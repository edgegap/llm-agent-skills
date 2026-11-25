# `assets/unity/EdgegapSettings.cs`

Template file. Write the content of the code block below, without the fences, to `EdgegapSettings.cs`.

```csharp
// Edgegap settings, edited on Assets/Edgegap/Resources/EdgegapSettings.asset.
// EdgegapBootstrap reads them at startup, so the game's scenes don't need any change.
using UnityEngine;

[CreateAssetMenu(fileName = "EdgegapSettings", menuName = "Edgegap/Settings")]
public class EdgegapSettings : ScriptableObject
{
    public const string ResourcePath = "EdgegapSettings";

    [Header("Mode")]
    [Tooltip("Off (default): the game's own UI connects to an address and port. "
        + "On: a Find Match panel uses the Edgegap Matchmaker.")]
    public bool UseEdgegapMatchmaker = false;

    [Tooltip("Scene where the Find Match panel shows (the main menu). Empty: every scene, while not connected.")]
    public string MenuSceneName = "";

    [Header("Dedicated Server")]
    [Tooltip("Start the NGO server from EdgegapServerLifecycle in server builds. Turn off when the game already "
        + "starts its own server headless (e.g. a Boss Room-style ConnectionManager).")]
    public bool AutoStartServer = true;

    [Tooltip("UDP port the server listens on when ARBITRIUM_PORT_GAMEPORT_INTERNAL is not set (local runs). "
        + "On Edgegap the app version's internal port is used.")]
    public ushort ListenPort = 7777;

    [Tooltip("Stop the Edgegap deployment if nobody connects within this time.")]
    public float FirstPlayerTimeoutSeconds = 120f;

    [Tooltip("Stop the Edgegap deployment once all players have been gone for this long.")]
    public float EmptyServerTimeoutSeconds = 30f;

    [Header("Edgegap Matchmaker (matchmaker on)")]
    [Tooltip("Matchmaker API URL from the Edgegap dashboard.")]
    public string MatchmakerUrl = "";

    [Tooltip("Matchmaker Auth Token from the Edgegap dashboard. Safe to ship in clients: it grants no Edgegap account access.")]
    public string MatchmakerAuthToken = "";

    [Tooltip("Profile name from the matchmaker configuration.")]
    public string Profile = "casual";

    [Tooltip("Port name on the Edgegap app version.")]
    public string PortName = "gameport";

    [Tooltip("Ping Edgegap beacons and send the results in tickets. Needs a `latencies` rule in the profile.")]
    public bool UseLatencyBeacons = false;
}
```
