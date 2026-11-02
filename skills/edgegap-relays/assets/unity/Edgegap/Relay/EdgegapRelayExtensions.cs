namespace LightNet.Edgegap
{
    /// <summary>
    /// Start a <see cref="NetworkComponent"/> on the Edgegap relay instead of direct sockets.
    /// Everything else (events, RegisterNetworkDataClass, Send/BroadcastNetworkData) stays the same.
    /// </summary>
    public static class EdgegapRelayExtensions
    {
        /// <summary>
        /// Host the match through the relay's server port. The host is the "server" of LightNet:
        /// <see cref="NetworkComponent.IsServer"/> returns true and OnClientConnected fires per joining player.
        /// </summary>
        /// <returns>The relay service (for its relay state and errors), or null if starting failed.</returns>
        public static RelayNetworkService StartRelayHost(this NetworkComponent net, RelayEndpoint relay, int maxClients)
        {
            RelayNetworkService service = new RelayNetworkService();
            if (!net.UseNetworkService(service) || !service.StartHost(relay, maxClients))
            {
                return null;
            }
            return service;
        }

        /// <summary>
        /// Join the host through the relay's client port. OnClientConnected fires once the host answered.
        /// </summary>
        /// <returns>The relay service (for its relay state and errors), or null if starting failed.</returns>
        public static RelayNetworkService StartRelayClient(this NetworkComponent net, RelayEndpoint relay)
        {
            RelayNetworkService service = new RelayNetworkService();
            if (!net.UseNetworkService(service) || !service.StartClient(relay))
            {
                return null;
            }
            return service;
        }

        /// <summary>
        /// The relay service this component runs on, or null when it uses direct sockets.
        /// </summary>
        public static RelayNetworkService GetRelay(this NetworkComponent net)
        {
            return net.GetNetworkService() as RelayNetworkService;
        }
    }
}
