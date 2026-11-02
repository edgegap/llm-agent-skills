using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace LightNet.Edgegap
{
    /// <summary>
    /// What the lobby service returns when a player hosts or joins (see lobby-service/README.md).
    /// </summary>
    [Serializable]
    public class RelayTicket
    {
        public string code;
        public string host_secret;      // host only: needed to close the lobby
        public string session_id;
        public string role;             // "host" or "client"
        public string relay_ip;
        public string relay_host;
        public int relay_port;          // server port for the host, client port for clients
        public long session_token;
        public long user_token;
        public string error;

        public RelayEndpoint ToEndpoint()
        {
            return new RelayEndpoint
            {
                Address = string.IsNullOrEmpty(relay_ip) ? relay_host : relay_ip,
                Port = relay_port,
                SessionAuthorizationToken = (uint)session_token,
                UserAuthorizationToken = (uint)user_token
            };
        }
    }

    /// <summary>
    /// Talks to the sample lobby service, which holds the Edgegap relay token and creates relay
    /// sessions for players. The token never ships in the game.
    /// </summary>
    public class RelayLobbyClient
    {
        public string BaseUrl;
        public int TimeoutSeconds = 45;

        public RelayLobbyClient(string baseUrl)
        {
            BaseUrl = baseUrl.TrimEnd('/');
        }

        /// <summary>Create a lobby + relay session with this player as host.</summary>
        public IEnumerator Host(int maxPlayers, Action<RelayTicket> onDone)
        {
            string body = "{\"max_players\":" + maxPlayers + "}";
            return Request("POST", "/lobbies", body, null, onDone);
        }

        /// <summary>Authorize this player on the lobby's relay session.</summary>
        public IEnumerator Join(string code, Action<RelayTicket> onDone)
        {
            return Request("POST", "/lobbies/" + UnityWebRequest.EscapeURL(code.Trim().ToUpperInvariant()) + "/join", "{}", null, onDone);
        }

        /// <summary>Close the lobby and its relay session (host only). Relay sessions bill while open.</summary>
        public IEnumerator Close(RelayTicket hostTicket, Action<RelayTicket> onDone = null)
        {
            return Request("DELETE", "/lobbies/" + UnityWebRequest.EscapeURL(hostTicket.code), null, hostTicket.host_secret, onDone);
        }

        IEnumerator Request(string method, string path, string body, string hostSecret, Action<RelayTicket> onDone)
        {
            using (UnityWebRequest request = new UnityWebRequest(BaseUrl + path, method))
            {
                if (body != null)
                {
                    request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                    request.SetRequestHeader("Content-Type", "application/json");
                }
                if (hostSecret != null)
                {
                    request.SetRequestHeader("X-Host-Secret", hostSecret);
                }
                request.downloadHandler = new DownloadHandlerBuffer();
                request.timeout = TimeoutSeconds;

                yield return request.SendWebRequest();

                RelayTicket ticket = null;
                string text = request.downloadHandler.text;
                if (!string.IsNullOrEmpty(text))
                {
                    try
                    {
                        ticket = JsonUtility.FromJson<RelayTicket>(text);
                    }
                    catch (Exception)
                    {
                        // not JSON, reported below
                    }
                }
                if (request.result != UnityWebRequest.Result.Success)
                {
                    ticket = ticket ?? new RelayTicket();
                    if (string.IsNullOrEmpty(ticket.error))
                    {
                        ticket.error = $"{method} {path} failed: {request.error} {text}";
                    }
                }
                else if (ticket == null && method != "DELETE")
                {
                    ticket = new RelayTicket { error = $"{method} {path}: unexpected response '{text}'" };
                }
                onDone?.Invoke(ticket ?? new RelayTicket());
            }
        }
    }
}
