// Edgegap settings for this sample, edited on Assets/Edgegap/Resources/EdgegapSettings.asset.
// EdgegapBootstrap reads them at startup, so the upstream GameScene doesn't need any change.
using UnityEngine;

[CreateAssetMenu(fileName = "EdgegapSettings", menuName = "Edgegap/Settings")]
public class EdgegapSettings : ScriptableObject
{
    public const string ResourcePath = "EdgegapSettings";

    [Header("Mode")]
    [Tooltip("Builds only (the Editor keeps PurrNet's own host/clone auto start). Off: the client connects "
        + "directly to the server below. On: Find Match uses the Edgegap Matchmaker.")]
    public bool UseEdgegapMatchmaker = false;

    [Tooltip("Also use the Edgegap flow (connect panel, no auto start) in the Editor's Play Mode.")]
    public bool ApplyInEditor = false;

    [Header("Dedicated Server")]
    [Tooltip("UDP port the server listens on. Must equal the internal port of the Edgegap app version.")]
    public ushort ListenPort = 7777;

    [Tooltip("Stop the Edgegap deployment if nobody connects within this time.")]
    public float FirstPlayerTimeoutSeconds = 120f;

    [Tooltip("Stop the Edgegap deployment once all players have been gone for this long.")]
    public float EmptyServerTimeoutSeconds = 30f;

    [Header("Direct Connection (matchmaker off)")]
    [Tooltip("Default server address shown in the connect panel: 127.0.0.1 for a local server, "
        + "or a deployment's host, e.g. <request-id>.pr.edgegap.net.")]
    public string DirectAddress = "127.0.0.1";

    [Tooltip("Default server port: 7777 locally, or the deployment's external port.")]
    public ushort DirectPort = 7777;

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
