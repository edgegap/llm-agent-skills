# `assets/client/unity/EdgegapMatchmaker.cs`

Template file. Write the content of the code block below, without the fences, to `EdgegapMatchmaker.cs`.

```csharp
using System;
using UnityEngine;
using UnityEngine.Networking;

/// <summary>
/// Edgegap matchmaker client (matchmaker 3.x ticket API). No SDK needed, works on WebGL.
///
///   POST   {url}/tickets        { profile, attributes }  -> { id, status }
///   GET    {url}/tickets/{id}   SEARCHING | MATCH_FOUND | HOST_ASSIGNED (+ assignment) | CANCELLED
///   DELETE {url}/tickets/{id}   leave the queue
///
/// Header: Authorization: the matchmaker Auth Token, raw. It is made to ship in game clients:
/// it only creates and reads tickets and grants no access to the Edgegap account.
/// WebGL builds also need their page origin in the config's allowed_cors_origins.
/// </summary>
public class EdgegapMatchmaker
{
    [Serializable] class TicketRequest { public string profile; public Attributes attributes = new(); }
    [Serializable] class Attributes { }
    [Serializable] class Ticket { public string id; public string status; public Assignment assignment; }
    [Serializable] class Assignment { public string fqdn; public string public_ip; public Ports ports; }
    // JsonUtility needs fixed field names: "gameport" is the port name in the Edgegap app version.
    [Serializable] class Ports { public PortInfo gameport; }
    [Serializable] class PortInfo { public int external; }

    readonly string url;
    readonly string token;
    readonly string profile;
    string ticketId;
    bool cancelled;

    public float PollSeconds = 2f;
    public event Action<string> OnStatus;

    public EdgegapMatchmaker(string url, string token, string profile)
    {
        this.url = url.Trim().TrimEnd('/');
        this.token = token.Trim();
        this.profile = profile;
    }

    /// <summary>Queues one player; returns the game server's wss:// URL once a server is assigned.</summary>
    public async Awaitable<string> FindMatch()
    {
        cancelled = false;
        OnStatus?.Invoke("Joining queue...");
        var body = JsonUtility.ToJson(new TicketRequest { profile = profile });
        var ticket = JsonUtility.FromJson<Ticket>(await Send("POST", "/tickets", body));
        ticketId = ticket.id;
        float started = Time.realtimeSinceStartup;

        while (!cancelled)
        {
            await Awaitable.WaitForSecondsAsync(PollSeconds);
            if (cancelled) break;
            var t = JsonUtility.FromJson<Ticket>(await Send("GET", $"/tickets/{UnityWebRequest.EscapeURL(ticketId)}", null));
            switch (t.status)
            {
                case "SEARCHING":
                    OnStatus?.Invoke($"Searching for players... {Mathf.RoundToInt(Time.realtimeSinceStartup - started)}s");
                    break;
                case "TEAM_FOUND":
                case "MATCH_FOUND":
                    OnStatus?.Invoke("Match found, starting server...");
                    break;
                case "HOST_ASSIGNED":
                    ticketId = null; // matched: a DELETE now would only get a 409
                    var port = t.assignment?.ports?.gameport?.external ?? 0;
                    if (string.IsNullOrEmpty(t.assignment?.fqdn) || port == 0)
                        throw new Exception("Assignment has no gameport");
                    // TLS Upgrade on the port: connect by fqdn, the certificate matches it.
                    return $"wss://{t.assignment.fqdn}:{port}";
                case "CANCELLED":
                    ticketId = null;
                    throw new Exception("Ticket expired before a match was found");
                default:
                    throw new Exception($"Unexpected ticket status {t.status}");
            }
        }
        throw new OperationCanceledException("Matchmaking cancelled");
    }

    /// <summary>Leaves the queue. Safe to call any time.</summary>
    public void Cancel()
    {
        cancelled = true;
        if (string.IsNullOrEmpty(ticketId)) return;
        var request = UnityWebRequest.Delete($"{url}/tickets/{UnityWebRequest.EscapeURL(ticketId)}");
        request.SetRequestHeader("Authorization", token);
        request.SendWebRequest().completed += _ => request.Dispose();
        ticketId = null;
    }

    async Awaitable<string> Send(string method, string path, string json)
    {
        using var request = new UnityWebRequest(url + path, method);
        request.downloadHandler = new DownloadHandlerBuffer();
        if (json != null)
        {
            request.uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(json));
            request.SetRequestHeader("Content-Type", "application/json");
        }
        request.SetRequestHeader("Authorization", token);
        await request.SendWebRequest();
        if (request.result != UnityWebRequest.Result.Success)
            throw new Exception($"Matchmaker {method} {path}: HTTP {request.responseCode} {request.error} {request.downloadHandler?.text}");
        return request.downloadHandler.text;
    }
}
```
