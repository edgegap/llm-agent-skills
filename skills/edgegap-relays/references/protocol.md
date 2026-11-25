# Relay wire protocol, and the channels on top of it

Contents: 1. The Edgegap relay protocol · 2. Connection flow · 3. Channels over the relay (what `RelayNetworkService` does) · 4. Porting to another netcode or language

## 1. The Edgegap relay protocol

Source: https://github.com/edgegap/distributed-relay-examples (Relay Implementation Manual). Everything is UDP, and both the host and the clients are UDP *clients* of the relay: the host does not listen on a port.

- One relay port for the host (`relay.ports.server.port`), one for every client (`relay.ports.client.port`).
- Max datagram (MTU) 1200 bytes. The relay adds up to 13 bytes, so a game payload is at most **1187** bytes.
- Integers are little endian on every platform.
- No reliability, ordering, fragmentation or encryption: the netcode brings those.

Message types and relay states:

```
MsgType : byte { PING = 1, DATA = 2 }
State   : byte { Disconnected = 0, Checking = 1, Valid = 2, Invalid = 3, SessionTimeout = 4, Error = 5 }
```

| Direction | Bytes |
|---|---|
| host or client → relay, PING (every ~500 ms, from the first moment) | `u32 userToken, u32 sessionToken, u8 1` |
| relay → host or client, PING reply | `u8 1, u8 state` |
| client → relay, DATA | `u32 userToken, u32 sessionToken, u8 2, payload` |
| relay → host, DATA from a client | `u8 2, u32 connectionId, payload` |
| host → relay, DATA to one client | `u32 userToken, u32 sessionToken, u8 2, u32 connectionId, payload` |
| relay → client, DATA from the host | `u8 2, payload` |

The PINGs are both keep-alive and authentication. Send DATA only after the state is `Valid` (1-2 s after the first PING). The relay never shows the host a client's IP: a client is a `connectionId`, learned from its first DATA.

## 2. Connection flow

The relay has no "connect" event. The host learns that a client exists when DATA with a new `connectionId` arrives, and a client can't tell whether the host is there. So the netcode needs its own handshake. `RelayNetworkService` does:

1. Everyone PINGs the relay until `Valid`. The host is then "running" and waits.
2. A client sends `Hello(epoch)` to the host every 250 ms. `epoch` is random per game start, so the host can tell a restarted client (same `connectionId`, new epoch) from a resend.
3. The host answers `Welcome(epoch)` and raises "client connected". The client raises "connected" on Welcome.
4. Keepalives every 500 ms when nothing else is sent. No traffic for 5 s means disconnected. `Disconnect` is sent 3 times on purpose leave.
5. Traffic from an unknown `connectionId` (other than Hello) gets a `Disconnect` reply, so a client the host dropped finds out at once.

Failure messages the service reports: relay state `Invalid`/`SessionTimeout`/`Error`, no `Valid` within 15 s, no `Welcome` within 15 s of `Valid`.

## 3. Channels over the relay

Every DATA payload starts with a frame type byte:

| Frame | Bytes after the type | Purpose |
|---|---|---|
| 1 Hello | `u32 epoch` | client → host until Welcome |
| 2 Welcome | `u32 epoch` | host → client |
| 3 KeepAlive | | |
| 4 Disconnect | | |
| 5 Reliable | `u16 seq, data` | last (or only) fragment of a message |
| 6 ReliableFragment | `u16 seq, data` | more fragments follow |
| 7 Ack | `u16 seq` | |
| 8 Unreliable | `u32 seq, data` | |

- **Reliable**: each fragment (up to 1184 bytes of data) gets the next `u16` sequence number and is resent every 200 ms until acked. At most 512 are in flight, and the rest wait in a backlog. The receiver acks every reliable frame, duplicates included, buffers out-of-order frames (up to 1024 ahead), and delivers in order, joining fragments until a type-5 frame. The sequence comparison uses `(short)(seq - expected)`, so wrap-around is safe. Messages can be up to 64 KB.
- **Unreliable**: `u32` sequence. The receiver drops anything not newer than the last delivered, so messages arrive in order or not at all. Up to 1182 bytes, with no fragmentation.
- Loss emulation (`SetNetworkErrorEmulation(percent, _)`) drops outgoing data frames, resends included, to test the reliable path.

## 4. Porting to another netcode or language

The C# service in `assets/unity/Edgegap/Relay/RelayNetworkService.cs` is the reference. Its parts map to any engine:
- One UDP socket `connect()`ed to the relay address and the right port. Raise its receive buffer (the C# service sets 1 MB; the Windows default is 64 KB, small for a burst of fragments).
- A network thread (or a non-blocking poll in the game loop) that sends relay PINGs, reads datagrams, runs resend and keepalive timers.
- On Windows, disable `SIO_UDP_CONNRESET`, or an ICMP "port unreachable" turns into an exception on the next receive.
- The relay header goes on every datagram you send. On the host, the `connectionId` goes after the type byte.

If the netcode already has reliability and fragmentation over raw UDP (KCP, ENet, LiteNetLib), skip §3: keep its packets as the payload, map its "peer" to the `connectionId` on the host, and keep each datagram ≤ 1187 bytes (set the netcode's MTU to about 1150 to leave room).
