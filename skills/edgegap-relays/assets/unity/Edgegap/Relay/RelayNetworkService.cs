using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Threading;

namespace LightNet.Edgegap
{
    /// <summary>
    /// Connection state reported by the Edgegap relay in its PING replies.
    /// </summary>
    public enum RelayState : byte
    {
        Disconnected = 0,   // until we send our first ping
        Checking = 1,       // tokens are being validated
        Valid = 2,          // tokens accepted, DATA can flow
        Invalid = 3,        // tokens rejected (wrong session/user token, or user not authorized)
        SessionTimeout = 4, // the session owner timed out
        Error = 5
    }

    /// <summary>
    /// Everything a peer needs to talk to its relay. Comes from the relay session
    /// (lobby service, matchmaker, or edgegap_create_relay_session for tests).
    /// </summary>
    [Serializable]
    public struct RelayEndpoint
    {
        /// <summary>Relay IP or host name.</summary>
        public string Address;

        /// <summary>The relay's <b>server</b> port for the host, its <b>client</b> port for everyone else.</summary>
        public int Port;

        /// <summary>The session's authorization_token.</summary>
        public uint SessionAuthorizationToken;

        /// <summary>This player's authorization_token from session_users.</summary>
        public uint UserAuthorizationToken;

        public override string ToString()
        {
            return $"{Address}:{Port}";
        }
    }

    /// <summary>
    /// LightNet backend that sends everything through an Edgegap relay instead of direct sockets.<br/>
    /// The host and the clients are all UDP clients of the relay, so nobody needs port forwarding,
    /// and NAT or firewalls don't matter.<br/><br/>
    /// The relay only forwards unreliable UDP datagrams of up to 1200 bytes. On top of that this
    /// service implements both LightNet channels:<br/>
    /// - <see cref="ENetChannel.Reliable"/>: acknowledged, resent, delivered in order, fragmented (up to 64 KB per message).<br/>
    /// - <see cref="ENetChannel.Unreliable"/>: may drop, never out of order (older datagrams are discarded),
    ///   up to <see cref="MaxUnreliableMessageSize"/> bytes.<br/><br/>
    /// Use it through <see cref="NetworkComponent"/>: see <see cref="EdgegapRelayExtensions"/>.
    /// </summary>
    public class RelayNetworkService : INetworkService
    {
        // Relay limits (see the relay implementation manual)
        public const int MTU = 1200;
        public const int RELAY_OVERHEAD = 13;
        public const int MAX_PAYLOAD = MTU - RELAY_OVERHEAD;

        /// <summary>Largest message the unreliable channel can carry (no fragmentation there).</summary>
        public const int MaxUnreliableMessageSize = MAX_PAYLOAD - UNRELIABLE_HEADER;

        /// <summary>Largest message the reliable channel can carry (split into fragments).</summary>
        public const int MaxReliableMessageSize = 65535;

        const int RELIABLE_HEADER = sizeof(byte) + sizeof(ushort);
        const int UNRELIABLE_HEADER = sizeof(byte) + sizeof(uint);
        const int FRAGMENT_SIZE = MAX_PAYLOAD - RELIABLE_HEADER;

        // Milliseconds
        const int RELAY_PING_INTERVAL = 500;
        const int HELLO_INTERVAL = 250;
        const int KEEPALIVE_INTERVAL = 500;
        const int RESEND_INTERVAL = 200;
        const int SHUTDOWN_TIMEOUT = 2000;

        // Seconds
        const double CONNECTION_TIMEOUT = 5.0;
        const double RELAY_VALIDATION_TIMEOUT = 15.0;
        const double HOST_ANSWER_TIMEOUT = 15.0;

        // Unacknowledged reliable datagrams per peer. Must stay far below 32768 for sequence wrap-around.
        const int MAX_IN_FLIGHT = 512;
        const int MAX_OUT_OF_ORDER = 1024;
        const int SOCKET_BUFFER_SIZE = 1024 * 1024;
        const int QUEUE_WARN_THRESHOLD = 1000;

        enum RelayMessageType : byte
        {
            Ping = 1,
            Data = 2
        }

        // First byte of every DATA payload, our own little protocol between host and clients
        enum FrameType : byte
        {
            Hello = 1,              // client -> host, repeated until Welcome. [u32 epoch]
            Welcome = 2,            // host -> client.                         [u32 epoch]
            KeepAlive = 3,
            Disconnect = 4,
            Reliable = 5,           // last (or only) fragment of a message.   [u16 seq][data]
            ReliableFragment = 6,   // more fragments follow.                  [u16 seq][data]
            Ack = 7,                //                                         [u16 seq]
            Unreliable = 8          //                                         [u32 seq][data]
        }

        class PendingReliable
        {
            public byte[] Frame;
            public DateTime LastSent;
        }

        class Peer
        {
            public ulong Handle;
            public uint ConnectionId;   // relay connection id, host side only
            public uint Epoch;          // random per client start, detects a restarted client
            public DateTime LastReceived = DateTime.UtcNow;
            public DateTime LastSent = DateTime.MinValue;

            public ushort NextSendSeq;
            public Dictionary<ushort, PendingReliable> InFlight = new Dictionary<ushort, PendingReliable>();
            public Queue<byte[]> Backlog = new Queue<byte[]>();     // reliable frames waiting for window space (seq not written yet)

            public ushort NextRecvSeq;
            public Dictionary<ushort, KeyValuePair<FrameType, byte[]>> OutOfOrder = new Dictionary<ushort, KeyValuePair<FrameType, byte[]>>();
            public List<byte> Assembly = new List<byte>();

            public uint NextUnreliableSendSeq = 1;
            public uint LastUnreliableRecvSeq;

            public ConcurrentQueue<KeyValuePair<byte[], ENetChannel>> Received = new ConcurrentQueue<KeyValuePair<byte[], ENetChannel>>();
        }

        /// <summary>
        /// Specify what kind of events should be pushed into the event queue by setting the appropriate flag(s)
        /// </summary>
        public volatile ENetworkEventReportFlags EventFlags = ENetworkEventReportFlags.ConnectionStatus;

        volatile ENetworkState State = ENetworkState.Closed;
        volatile RelayState CurrentRelayState = RelayState.Disconnected;
        volatile bool bShutdown = true;
        volatile int NetworkErrorEmulationLevel = 0;
        volatile string LastErrorMessage;
        long ResendCount;

        bool bHost;
        int MaxClients;
        RelayEndpoint Relay;
        Socket RelaySocket;
        Thread NetThread;
        readonly object Sync = new object();

        ulong NextHandle = 1;
        readonly Dictionary<ulong, Peer> PeersByHandle = new Dictionary<ulong, Peer>();
        readonly Dictionary<uint, Peer> PeersByConnectionId = new Dictionary<uint, Peer>();
        readonly ConcurrentQueue<ConnectionEvent> Events = new ConcurrentQueue<ConnectionEvent>();

        // client side
        Peer HostPeer;
        uint ClientEpoch;
        bool bWelcomed;

        static readonly Random Rand = new Random();

        /// <summary>
        /// Start as the host (the player whose game owns the match), through the relay's <b>server</b> port.
        /// </summary>
        public bool StartHost(RelayEndpoint relay, int maxClients)
        {
            return Start(relay, true, maxClients);
        }

        /// <summary>
        /// Join the host through the relay's <b>client</b> port.
        /// </summary>
        public bool StartClient(RelayEndpoint relay)
        {
            return Start(relay, false, 0);
        }

        /// <summary>
        /// Last state the relay reported. Show it in your UI: Checking, then Valid within 1-2 s.
        /// </summary>
        public RelayState GetRelayState()
        {
            return CurrentRelayState;
        }

        /// <summary>
        /// Why networking closed on its own, or null.
        /// </summary>
        public string GetLastError()
        {
            return LastErrorMessage;
        }

        /// <summary>
        /// Reliable datagrams sent again because no ack came back in time. A steadily growing number
        /// means packet loss between this player and the relay.
        /// </summary>
        public long GetResendCount()
        {
            return Interlocked.Read(ref ResendCount);
        }

        public ENetworkState GetState()
        {
            return State;
        }

        public bool IsServer()
        {
            return bHost && State != ENetworkState.Closed;
        }

        bool Start(RelayEndpoint relay, bool host, int maxClients)
        {
            if (State != ENetworkState.Closed)
            {
                LogQueue.LogWarning("Cannot start relay networking, we're already {0}!", new object[] { State });
                return false;
            }
            if (string.IsNullOrEmpty(relay.Address) || relay.Port <= 0)
            {
                LogQueue.LogError("Relay address and port are required!");
                return false;
            }

            IPAddress address = Resolve(relay.Address);
            if (address == null)
            {
                LogQueue.LogError("Could not resolve relay address '{0}'!", new object[] { relay.Address });
                return false;
            }

            try
            {
                RelaySocket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
                // the default (64 KB on Windows) overflows on bursts, e.g. a large fragmented reliable message
                RelaySocket.ReceiveBufferSize = SOCKET_BUFFER_SIZE;
                RelaySocket.SendBufferSize = SOCKET_BUFFER_SIZE;
                DisableConnectionReset(RelaySocket);
                RelaySocket.Connect(new IPEndPoint(address, relay.Port));
            }
            catch (Exception e)
            {
                LogQueue.LogError("Could not open relay socket: {0}", new object[] { e.Message });
                RelaySocket?.Close();
                RelaySocket = null;
                return false;
            }

            Relay = relay;
            bHost = host;
            MaxClients = maxClients;
            LastErrorMessage = null;
            CurrentRelayState = RelayState.Disconnected;
            while (Events.TryDequeue(out ConnectionEvent _)) { }
            lock (Sync)
            {
                PeersByHandle.Clear();
                PeersByConnectionId.Clear();
                NextHandle = 1;
                HostPeer = null;
                bWelcomed = false;
                ClientEpoch = (uint)Rand.Next(1, int.MaxValue);
            }

            State = ENetworkState.Startup;
            bShutdown = false;
            NetThread = new Thread(ThreadFunc);
            NetThread.Name = host ? "LightNet_RelayHost" : "LightNet_RelayClient";
            NetThread.IsBackground = true;
            NetThread.Start();

            LogQueue.LogInfo("Connecting to Edgegap relay {0} as {1}...", new object[] { relay.ToString(), host ? "host" : "client" });
            return true;
        }

        public bool Close()
        {
            if (State == ENetworkState.Closed || State == ENetworkState.Shutdown)
            {
                LogQueue.LogWarning("Cannot close networking, already {0}!", new object[] { State });
                return false;
            }

            State = ENetworkState.Shutdown;
            lock (Sync)
            {
                // tell the other side right away instead of letting them time out
                foreach (Peer peer in PeersByHandle.Values)
                {
                    for (int i = 0; i < 3; ++i)
                    {
                        SendFrame(peer, new byte[] { (byte)FrameType.Disconnect }, true);
                    }
                }
            }

            bShutdown = true;
            if (NetThread != null && Thread.CurrentThread != NetThread && !NetThread.Join(SHUTDOWN_TIMEOUT))
            {
                LogQueue.LogWarning("Relay network thread did not stop in time.");
            }
            NetThread = null;
            CloseSocket();
            return true;
        }

        public bool Disconnect(ConnectionHandle connection)
        {
            if (!bHost)
            {
                return State != ENetworkState.Closed && Close();
            }

            lock (Sync)
            {
                if (!PeersByHandle.TryGetValue(connection.GetInternalHandle(), out Peer peer))
                {
                    LogQueue.LogWarning("Cannot close an unknown connection. Already disconnected?");
                    return false;
                }
                for (int i = 0; i < 3; ++i)
                {
                    SendFrame(peer, new byte[] { (byte)FrameType.Disconnect }, true);
                }
                RemovePeer(peer);
            }
            return true;
        }

        public bool IsAlive(ConnectionHandle handle)
        {
            lock (Sync)
            {
                return State == ENetworkState.Running && PeersByHandle.ContainsKey(handle.GetInternalHandle());
            }
        }

        /// <summary>
        /// Drop the given percentage of outgoing datagrams to test reliability. maxSendDelay is ignored.
        /// </summary>
        public void SetNetworkErrorEmulation(int looseLevel, int maxSendDelay)
        {
            NetworkErrorEmulationLevel = Math.Max(0, Math.Min(100, looseLevel));
        }

        public ConnectionHandle[] GetConnections()
        {
            lock (Sync)
            {
                ConnectionHandle[] handles = new ConnectionHandle[PeersByHandle.Count];
                int i = 0;
                foreach (ulong handle in PeersByHandle.Keys)
                {
                    handles[i++] = new ConnectionHandle(handle);
                }
                return handles;
            }
        }

        public string GetConnectionName(ConnectionHandle handle)
        {
            lock (Sync)
            {
                if (!PeersByHandle.TryGetValue(handle.GetInternalHandle(), out Peer peer))
                {
                    return "INVALID HANDLE";
                }
                string who = bHost ? $"relay connection {peer.ConnectionId}" : "host";
                return $"{who} via {Relay} - Alive";
            }
        }

        public bool GetNextEvent(out ConnectionEvent outEvent)
        {
            return Events.TryDequeue(out outEvent);
        }

        public bool SendMessage(ConnectionHandle connection, ENetChannel channel, byte[] message)
        {
            lock (Sync)
            {
                if (!PeersByHandle.TryGetValue(connection.GetInternalHandle(), out Peer peer))
                {
                    LogQueue.LogWarning("Given connection handle is invalid!");
                    return false;
                }
                return Send(peer, channel, message);
            }
        }

        public void BroadcastMessage(ENetChannel channel, byte[] message)
        {
            lock (Sync)
            {
                foreach (Peer peer in PeersByHandle.Values)
                {
                    Send(peer, channel, message);
                }
            }
        }

        public bool GetNextMessage(out byte[] message, out ConnectionHandle connection, out ENetChannel channel)
        {
            lock (Sync)
            {
                foreach (Peer peer in PeersByHandle.Values)
                {
                    if (peer.Received.TryDequeue(out KeyValuePair<byte[], ENetChannel> entry))
                    {
                        message = entry.Key;
                        channel = entry.Value;
                        connection = new ConnectionHandle(peer.Handle);
                        return true;
                    }
                }
            }
            message = null;
            connection = new ConnectionHandle(0);
            channel = ENetChannel.Unreliable;
            return false;
        }

        // ---------------------------------------------------------------- sending

        // caller holds Sync
        bool Send(Peer peer, ENetChannel channel, byte[] message)
        {
            if (State != ENetworkState.Running)
            {
                LogQueue.LogWarning("Cannot send, relay networking is not running!");
                return false;
            }
            if (message == null || message.Length == 0)
            {
                LogQueue.LogWarning("Cannot send empty message!");
                return false;
            }

            if (channel == ENetChannel.Unreliable)
            {
                if (message.Length > MaxUnreliableMessageSize)
                {
                    LogQueue.LogError("Unreliable message of {0} bytes exceeds the relay limit of {1} bytes! Use the reliable channel for large messages.", new object[] { message.Length, MaxUnreliableMessageSize });
                    return false;
                }
                byte[] frame = new byte[UNRELIABLE_HEADER + message.Length];
                frame[0] = (byte)FrameType.Unreliable;
                WriteUInt(frame, 1, peer.NextUnreliableSendSeq++);
                Array.Copy(message, 0, frame, UNRELIABLE_HEADER, message.Length);
                SendFrame(peer, frame, false);
                return true;
            }

            if (message.Length > MaxReliableMessageSize)
            {
                LogQueue.LogError("Reliable message of {0} bytes exceeds max message size of {1}!", new object[] { message.Length, MaxReliableMessageSize });
                return false;
            }

            for (int offset = 0; offset < message.Length; offset += FRAGMENT_SIZE)
            {
                int size = Math.Min(FRAGMENT_SIZE, message.Length - offset);
                bool bLast = offset + size >= message.Length;
                byte[] frame = new byte[RELIABLE_HEADER + size];
                frame[0] = (byte)(bLast ? FrameType.Reliable : FrameType.ReliableFragment);
                Array.Copy(message, offset, frame, RELIABLE_HEADER, size);
                peer.Backlog.Enqueue(frame);
            }
            if (peer.Backlog.Count > QUEUE_WARN_THRESHOLD)
            {
                LogQueue.LogWarning("Reliable send backlog has over {0} datagrams waiting. Sending faster than the relay round trip allows?", new object[] { QUEUE_WARN_THRESHOLD });
            }
            FlushBacklog(peer);
            return true;
        }

        // caller holds Sync
        void FlushBacklog(Peer peer)
        {
            while (peer.Backlog.Count > 0 && peer.InFlight.Count < MAX_IN_FLIGHT)
            {
                byte[] frame = peer.Backlog.Dequeue();
                ushort seq = peer.NextSendSeq++;
                WriteUShort(frame, 1, seq);
                PendingReliable pending = new PendingReliable { Frame = frame, LastSent = DateTime.UtcNow };
                peer.InFlight[seq] = pending;
                SendFrame(peer, frame, false);
            }
        }

        // caller holds Sync (or is the network thread before any peer exists)
        void SendFrame(Peer peer, byte[] frame, bool bForce)
        {
            if (!bForce && NetworkErrorEmulationLevel > 0 && Rand.Next(0, 100) < NetworkErrorEmulationLevel)
            {
                peer.LastSent = DateTime.UtcNow;
                return;
            }

            // relay header: user token, session token, DATA, (host only) connection id
            int header = sizeof(uint) * 2 + sizeof(byte) + (bHost ? sizeof(uint) : 0);
            byte[] datagram = new byte[header + frame.Length];
            WriteUInt(datagram, 0, Relay.UserAuthorizationToken);
            WriteUInt(datagram, 4, Relay.SessionAuthorizationToken);
            datagram[8] = (byte)RelayMessageType.Data;
            if (bHost)
            {
                WriteUInt(datagram, 9, peer.ConnectionId);
            }
            Array.Copy(frame, 0, datagram, header, frame.Length);
            SendDatagram(datagram);
            peer.LastSent = DateTime.UtcNow;
        }

        void SendRelayPing()
        {
            byte[] datagram = new byte[sizeof(uint) * 2 + sizeof(byte)];
            WriteUInt(datagram, 0, Relay.UserAuthorizationToken);
            WriteUInt(datagram, 4, Relay.SessionAuthorizationToken);
            datagram[8] = (byte)RelayMessageType.Ping;
            SendDatagram(datagram);
        }

        void SendDatagram(byte[] datagram)
        {
            try
            {
                RelaySocket?.Send(datagram);
            }
            catch (SocketException e)
            {
                LogQueue.LogWarning("Relay send failed: {0}", new object[] { e.Message });
            }
            catch (ObjectDisposedException) { }
        }

        // ---------------------------------------------------------------- network thread

        void ThreadFunc()
        {
            byte[] buffer = new byte[MTU * 2];
            DateTime started = DateTime.UtcNow;
            DateTime lastRelayPing = DateTime.MinValue;
            DateTime lastHello = DateTime.MinValue;
            DateTime validSince = DateTime.MinValue;

            while (!bShutdown)
            {
                DateTime now = DateTime.UtcNow;

                if ((now - lastRelayPing).TotalMilliseconds >= RELAY_PING_INTERVAL)
                {
                    SendRelayPing();
                    lastRelayPing = now;
                }

                // RECEIVE
                try
                {
                    if (RelaySocket.Poll(1000, SelectMode.SelectRead))
                    {
                        while (RelaySocket != null && RelaySocket.Available > 0)
                        {
                            int size = RelaySocket.Receive(buffer);
                            HandleDatagram(buffer, size);
                        }
                    }
                }
                catch (SocketException)
                {
                    // e.g. ICMP port unreachable on some platforms, just keep going
                }
                catch (ObjectDisposedException)
                {
                    return;
                }
                if (bShutdown)
                {
                    return;
                }

                now = DateTime.UtcNow;
                RelayState relayState = CurrentRelayState;

                // relay validation
                if (relayState == RelayState.Invalid || relayState == RelayState.SessionTimeout || relayState == RelayState.Error)
                {
                    Fail($"Relay rejected the connection: {relayState}. Check the session and user tokens, and that this player's IP is authorized on the session.");
                    return;
                }
                if (relayState != RelayState.Valid)
                {
                    if ((now - started).TotalSeconds > RELAY_VALIDATION_TIMEOUT)
                    {
                        Fail($"No answer from the relay at {Relay} after {RELAY_VALIDATION_TIMEOUT} s (state: {relayState}). Is the session still open, and is this the relay's {(bHost ? "server" : "client")} port?");
                        return;
                    }
                    continue;
                }
                if (validSince == DateTime.MinValue)
                {
                    validSince = now;
                    LogQueue.LogInfo("Edgegap relay accepted us (state Valid).");
                    if (bHost)
                    {
                        State = ENetworkState.Running;
                        LogQueue.LogInfo("Hosting through the relay, waiting for clients...");
                    }
                }

                lock (Sync)
                {
                    if (!bHost && !bWelcomed)
                    {
                        if ((now - validSince).TotalSeconds > HOST_ANSWER_TIMEOUT)
                        {
                            Fail($"The host did not answer within {HOST_ANSWER_TIMEOUT} s. Is the host connected to the relay?");
                            return;
                        }
                        if ((now - lastHello).TotalMilliseconds >= HELLO_INTERVAL)
                        {
                            byte[] hello = new byte[1 + sizeof(uint)];
                            hello[0] = (byte)FrameType.Hello;
                            WriteUInt(hello, 1, ClientEpoch);
                            if (HostPeer == null)
                            {
                                HostPeer = new Peer { Handle = 1, Epoch = ClientEpoch };
                            }
                            SendFrame(HostPeer, hello, true);
                            lastHello = now;
                        }
                    }

                    List<Peer> lost = null;
                    foreach (Peer peer in PeersByHandle.Values)
                    {
                        if ((now - peer.LastReceived).TotalSeconds >= CONNECTION_TIMEOUT)
                        {
                            (lost = lost ?? new List<Peer>()).Add(peer);
                            continue;
                        }

                        foreach (KeyValuePair<ushort, PendingReliable> pending in peer.InFlight)
                        {
                            if ((now - pending.Value.LastSent).TotalMilliseconds >= RESEND_INTERVAL)
                            {
                                pending.Value.LastSent = now;
                                SendFrame(peer, pending.Value.Frame, false);
                                Interlocked.Increment(ref ResendCount);
                            }
                        }

                        if ((now - peer.LastSent).TotalMilliseconds >= KEEPALIVE_INTERVAL)
                        {
                            SendFrame(peer, new byte[] { (byte)FrameType.KeepAlive }, true);
                        }
                    }

                    if (lost != null)
                    {
                        foreach (Peer peer in lost)
                        {
                            LogQueue.LogWarning("{0} timed out.", new object[] { bHost ? $"Relay connection {peer.ConnectionId}" : "Host" });
                            RemovePeer(peer);
                            AddEvent(peer.Handle, ConnectionEvent.EType.Disconnected, ENetworkEventReportFlags.ConnectionStatus);
                        }
                        if (!bHost)
                        {
                            Fail("Lost the connection to the host.", false);
                            return;
                        }
                    }
                }
            }
        }

        void HandleDatagram(byte[] buffer, int size)
        {
            if (size < 2)
            {
                return;
            }

            RelayMessageType type = (RelayMessageType)buffer[0];
            if (type == RelayMessageType.Ping)
            {
                RelayState state = (RelayState)buffer[1];
                if (state != CurrentRelayState)
                {
                    LogQueue.LogInfo("Relay state: {0}", new object[] { state });
                    CurrentRelayState = state;
                }
                return;
            }
            if (type != RelayMessageType.Data)
            {
                return;
            }

            int offset = 1;
            uint connectionId = 0;
            if (bHost)
            {
                if (size < offset + sizeof(uint) + 1)
                {
                    return;
                }
                connectionId = ReadUInt(buffer, offset);
                offset += sizeof(uint);
            }
            if (size <= offset)
            {
                return;
            }

            lock (Sync)
            {
                if (bHost)
                {
                    HandleHostFrame(connectionId, buffer, offset, size - offset);
                }
                else
                {
                    HandleClientFrame(buffer, offset, size - offset);
                }
            }
        }

        // caller holds Sync
        void HandleHostFrame(uint connectionId, byte[] buffer, int offset, int length)
        {
            FrameType frame = (FrameType)buffer[offset];
            PeersByConnectionId.TryGetValue(connectionId, out Peer peer);

            if (frame == FrameType.Hello)
            {
                if (length < 1 + sizeof(uint))
                {
                    return;
                }
                uint epoch = ReadUInt(buffer, offset + 1);
                if (peer != null && peer.Epoch != epoch)
                {
                    // same relay user, new game instance: the old one is gone
                    LogQueue.LogInfo("Relay connection {0} restarted.", new object[] { connectionId });
                    RemovePeer(peer);
                    AddEvent(peer.Handle, ConnectionEvent.EType.Disconnected, ENetworkEventReportFlags.ConnectionStatus);
                    peer = null;
                }
                if (peer == null)
                {
                    if (PeersByHandle.Count >= MaxClients)
                    {
                        LogQueue.LogWarning("Rejecting relay connection {0}: already at {1} clients.", new object[] { connectionId, MaxClients });
                        SendFrame(new Peer { ConnectionId = connectionId }, new byte[] { (byte)FrameType.Disconnect }, true);
                        return;
                    }
                    peer = new Peer { Handle = NextHandle++, ConnectionId = connectionId, Epoch = epoch };
                    PeersByHandle[peer.Handle] = peer;
                    PeersByConnectionId[connectionId] = peer;
                    LogQueue.LogInfo("Client joined through the relay (connection {0}, handle {1})", new object[] { connectionId, peer.Handle });
                    AddEvent(peer.Handle, ConnectionEvent.EType.Connected, ENetworkEventReportFlags.ConnectionStatus);
                }
                peer.LastReceived = DateTime.UtcNow;
                byte[] welcome = new byte[1 + sizeof(uint)];
                welcome[0] = (byte)FrameType.Welcome;
                WriteUInt(welcome, 1, epoch);
                SendFrame(peer, welcome, true);
                return;
            }

            if (peer == null)
            {
                // traffic from a connection we dropped (or never accepted): tell it to go away
                if (frame != FrameType.Disconnect)
                {
                    SendFrame(new Peer { ConnectionId = connectionId }, new byte[] { (byte)FrameType.Disconnect }, true);
                }
                return;
            }

            if (frame == FrameType.Disconnect)
            {
                LogQueue.LogInfo("Relay connection {0} disconnected.", new object[] { connectionId });
                RemovePeer(peer);
                AddEvent(peer.Handle, ConnectionEvent.EType.Disconnected, ENetworkEventReportFlags.ConnectionStatus);
                return;
            }

            HandlePeerFrame(peer, frame, buffer, offset, length);
        }

        // caller holds Sync
        void HandleClientFrame(byte[] buffer, int offset, int length)
        {
            FrameType frame = (FrameType)buffer[offset];
            if (HostPeer == null)
            {
                return;
            }

            if (frame == FrameType.Welcome)
            {
                if (length >= 1 + sizeof(uint) && ReadUInt(buffer, offset + 1) == ClientEpoch && !bWelcomed)
                {
                    bWelcomed = true;
                    HostPeer.LastReceived = DateTime.UtcNow;
                    PeersByHandle[HostPeer.Handle] = HostPeer;
                    State = ENetworkState.Running;
                    LogQueue.LogInfo("Connected to the host through the relay.");
                    AddEvent(HostPeer.Handle, ConnectionEvent.EType.Connected, ENetworkEventReportFlags.ConnectionStatus);
                }
                return;
            }

            if (!bWelcomed)
            {
                return;
            }

            if (frame == FrameType.Disconnect)
            {
                LogQueue.LogInfo("The host closed the connection.");
                RemovePeer(HostPeer);
                AddEvent(HostPeer.Handle, ConnectionEvent.EType.Disconnected, ENetworkEventReportFlags.ConnectionStatus);
                Fail(null, false);
                return;
            }

            HandlePeerFrame(HostPeer, frame, buffer, offset, length);
        }

        // caller holds Sync
        void HandlePeerFrame(Peer peer, FrameType frame, byte[] buffer, int offset, int length)
        {
            peer.LastReceived = DateTime.UtcNow;

            switch (frame)
            {
                case FrameType.KeepAlive:
                case FrameType.Welcome:
                    break;

                case FrameType.Ack:
                {
                    if (length < 1 + sizeof(ushort))
                    {
                        return;
                    }
                    ushort seq = ReadUShort(buffer, offset + 1);
                    if (peer.InFlight.Remove(seq))
                    {
                        FlushBacklog(peer);
                    }
                    break;
                }

                case FrameType.Reliable:
                case FrameType.ReliableFragment:
                {
                    if (length < RELIABLE_HEADER)
                    {
                        return;
                    }
                    ushort seq = ReadUShort(buffer, offset + 1);

                    byte[] ack = new byte[1 + sizeof(ushort)];
                    ack[0] = (byte)FrameType.Ack;
                    WriteUShort(ack, 1, seq);
                    SendFrame(peer, ack, false);

                    short distance = (short)(seq - peer.NextRecvSeq);
                    if (distance < 0 || distance >= MAX_OUT_OF_ORDER)
                    {
                        // duplicate (our ack got lost) or way ahead: ignore
                        return;
                    }

                    byte[] data = new byte[length - RELIABLE_HEADER];
                    Array.Copy(buffer, offset + RELIABLE_HEADER, data, 0, data.Length);

                    if (distance > 0)
                    {
                        peer.OutOfOrder[seq] = new KeyValuePair<FrameType, byte[]>(frame, data);
                        return;
                    }

                    DeliverReliable(peer, frame, data);
                    peer.NextRecvSeq++;
                    while (peer.OutOfOrder.TryGetValue(peer.NextRecvSeq, out KeyValuePair<FrameType, byte[]> next))
                    {
                        peer.OutOfOrder.Remove(peer.NextRecvSeq);
                        DeliverReliable(peer, next.Key, next.Value);
                        peer.NextRecvSeq++;
                    }
                    break;
                }

                case FrameType.Unreliable:
                {
                    if (length <= UNRELIABLE_HEADER)
                    {
                        return;
                    }
                    uint seq = ReadUInt(buffer, offset + 1);
                    // keep order: drop anything older than what we already handed out
                    if (peer.LastUnreliableRecvSeq != 0 && (int)(seq - peer.LastUnreliableRecvSeq) <= 0)
                    {
                        return;
                    }
                    peer.LastUnreliableRecvSeq = seq;

                    byte[] data = new byte[length - UNRELIABLE_HEADER];
                    Array.Copy(buffer, offset + UNRELIABLE_HEADER, data, 0, data.Length);
                    Enqueue(peer, data, ENetChannel.Unreliable);
                    break;
                }
            }
        }

        // caller holds Sync
        void DeliverReliable(Peer peer, FrameType frame, byte[] data)
        {
            if (frame == FrameType.ReliableFragment)
            {
                peer.Assembly.AddRange(data);
                return;
            }
            if (peer.Assembly.Count > 0)
            {
                peer.Assembly.AddRange(data);
                data = peer.Assembly.ToArray();
                peer.Assembly.Clear();
            }
            Enqueue(peer, data, ENetChannel.Reliable);
        }

        void Enqueue(Peer peer, byte[] data, ENetChannel channel)
        {
            peer.Received.Enqueue(new KeyValuePair<byte[], ENetChannel>(data, channel));
            if (peer.Received.Count == QUEUE_WARN_THRESHOLD)
            {
                LogQueue.LogWarning("Over {0} received messages queued! Do you poll them somewhere?", new object[] { QUEUE_WARN_THRESHOLD });
            }
            AddEvent(peer.Handle, ConnectionEvent.EType.ReceivedMessage, ENetworkEventReportFlags.ReceivedMessage);
        }

        // caller holds Sync
        void RemovePeer(Peer peer)
        {
            PeersByHandle.Remove(peer.Handle);
            PeersByConnectionId.Remove(peer.ConnectionId);
        }

        void AddEvent(ulong handle, ConnectionEvent.EType type, ENetworkEventReportFlags flag)
        {
            if ((EventFlags & flag) != 0)
            {
                Events.Enqueue(new ConnectionEvent { Connection = new ConnectionHandle(handle), EventType = type });
            }
        }

        // called on the network thread when networking ends on its own
        void Fail(string error, bool bIsError = true)
        {
            if (error != null)
            {
                LastErrorMessage = error;
                if (bIsError)
                {
                    LogQueue.LogError(error);
                }
                else
                {
                    LogQueue.LogWarning(error);
                }
            }
            bShutdown = true;
            State = ENetworkState.Shutdown;
            lock (Sync)
            {
                PeersByHandle.Clear();
                PeersByConnectionId.Clear();
            }
            CloseSocket();
        }

        void CloseSocket()
        {
            try
            {
                RelaySocket?.Close();
            }
            catch (Exception) { }
            RelaySocket = null;
            CurrentRelayState = RelayState.Disconnected;
            State = ENetworkState.Closed;
        }

        // ---------------------------------------------------------------- helpers

        static IPAddress Resolve(string address)
        {
            if (IPAddress.TryParse(address, out IPAddress ip))
            {
                return ip;
            }
            try
            {
                foreach (IPAddress candidate in Dns.GetHostAddresses(address))
                {
                    if (candidate.AddressFamily == AddressFamily.InterNetwork)
                    {
                        return candidate;
                    }
                }
            }
            catch (Exception e)
            {
                LogQueue.LogWarning("DNS lookup of '{0}' failed: {1}", new object[] { address, e.Message });
            }
            return null;
        }

        static void DisableConnectionReset(Socket socket)
        {
            // Windows reports ICMP "port unreachable" as a socket error on the next receive; ignore it
            const int SIO_UDP_CONNRESET = -1744830452;
            try
            {
                socket.IOControl(SIO_UDP_CONNRESET, new byte[] { 0 }, null);
            }
            catch (Exception) { }
        }

        // the relay protocol is little endian on every platform
        static void WriteUInt(byte[] buffer, int offset, uint value)
        {
            buffer[offset] = (byte)value;
            buffer[offset + 1] = (byte)(value >> 8);
            buffer[offset + 2] = (byte)(value >> 16);
            buffer[offset + 3] = (byte)(value >> 24);
        }

        static uint ReadUInt(byte[] buffer, int offset)
        {
            return (uint)(buffer[offset] | buffer[offset + 1] << 8 | buffer[offset + 2] << 16 | buffer[offset + 3] << 24);
        }

        static void WriteUShort(byte[] buffer, int offset, ushort value)
        {
            buffer[offset] = (byte)value;
            buffer[offset + 1] = (byte)(value >> 8);
        }

        static ushort ReadUShort(byte[] buffer, int offset)
        {
            return (ushort)(buffer[offset] | buffer[offset + 1] << 8);
        }
    }
}
