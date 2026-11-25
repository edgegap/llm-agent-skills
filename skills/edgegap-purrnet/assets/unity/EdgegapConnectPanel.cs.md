# `assets/unity/EdgegapConnectPanel.cs`

Template file. Write the content of the code block below, without the fences, to `EdgegapConnectPanel.cs`.

```csharp
// Client-side connect panel, added by EdgegapBootstrap in client builds.
// - Direct connection (default): enter a server address and port, then Connect.
// - Edgegap Matchmaker (UseEdgegapMatchmaker on): Find Match, then EdgegapMatchmakingClient connects to the
//   server Edgegap started for the match.
// The panel hides once connected. If the connection drops, the scene reloads to reset the world.
using System.Collections;
using PurrNet;
using PurrNet.Transports;
using UnityEngine;
using UnityEngine.SceneManagement;

[DisallowMultipleComponent]
public class EdgegapConnectPanel : MonoBehaviour
{
    [Tooltip("Give up a direct connection attempt after this long.")]
    public float ConnectTimeoutSeconds = 10f;

    private EdgegapMatchmakingClient _matchmaker;
    private string _address;
    private string _port;
    private string _status = "";
    private bool _connecting;
    private bool _wasConnected;
    private bool _autoFindMatchPending;

    private static NetworkManager Network => NetworkManager.main;
    private bool IsConnected => Network != null && Network.clientState == ConnectionState.Connected;

    private void Start()
    {
        EdgegapSettings settings = EdgegapBootstrap.Settings;
        _matchmaker = GetComponent<EdgegapMatchmakingClient>();
        _address = settings.DirectAddress;
        _port = settings.DirectPort.ToString();

        if (_matchmaker == null && EdgegapBootstrap.HasFlag("-edgegapConnect"))
            Connect();
        _autoFindMatchPending = _matchmaker != null && EdgegapBootstrap.HasFlag("-edgegapFindMatch");
    }

    private void Update()
    {
        if (_autoFindMatchPending && _matchmaker.IsMatchmakerHealthy)
        {
            _autoFindMatchPending = false;
            _matchmaker.FindMatch();
        }

        bool connected = IsConnected;
        if (connected && !_wasConnected)
            Debug.Log("Edgegap | Connected to the game server.");

        if (_wasConnected && !connected && Network != null && Network.clientState == ConnectionState.Disconnected)
        {
            // Back to a clean offline world: the NetworkManager and scene objects are recreated,
            // this DontDestroyOnLoad object keeps the panel and matchmaking state.
            _wasConnected = false;
            _status = "Disconnected from the server.";
            Debug.Log("Edgegap | Disconnected from the game server, reloading the scene.");
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
            return;
        }

        _wasConnected = connected;
    }

    private void LateUpdate()
    {
        // The game locks the cursor for gameplay; keep it usable while the panel is shown.
        if (!IsConnected)
        {
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }
    }

    private void Connect()
    {
        if (_connecting || Network == null)
            return;

        if (!ushort.TryParse(_port, out ushort port))
        {
            _status = "Invalid port.";
            return;
        }

        if (Network.transport is UDPTransport udp)
        {
            udp.address = _address.Trim();
            udp.serverPort = port;
        }
        else
        {
            Debug.LogError($"Edgegap | Transport is {(Network.transport != null ? Network.transport.GetType().Name : "none")}, expected UDPTransport.");
        }

        StartCoroutine(ConnectRoutine(_address.Trim(), port));
    }

    private IEnumerator ConnectRoutine(string address, ushort port)
    {
        _connecting = true;
        _status = $"Connecting to {address}:{port}...";
        Debug.Log($"Edgegap | {_status}");
        Network.StartClient();

        float started = Time.realtimeSinceStartup;
        // StartClient is asynchronous: wait for the state to leave Disconnected first.
        yield return new WaitUntil(() =>
            Network.clientState != ConnectionState.Disconnected || Time.realtimeSinceStartup - started > 1f);
        yield return new WaitUntil(() =>
            Network.clientState != ConnectionState.Connecting || Time.realtimeSinceStartup - started > ConnectTimeoutSeconds);

        _connecting = false;
        if (IsConnected)
        {
            _status = "";
            yield break;
        }

        Network.StopClient();
        _status = $"Couldn't connect to {address}:{port}. Is the server running?";
        Debug.LogWarning($"Edgegap | {_status}");
    }

    private void OnGUI()
    {
        if (IsConnected)
            return;

        const float width = 320f;
        GUILayout.BeginArea(new Rect((Screen.width - width) / 2f, Screen.height * 0.25f, width, 260f), GUI.skin.box);
        GUILayout.Label("Play online (Edgegap)");

        if (_matchmaker != null)
            MatchmakerGUI();
        else
            DirectGUI();

        GUILayout.EndArea();
    }

    private void DirectGUI()
    {
        GUILayout.Label("Server address");
        _address = GUILayout.TextField(_address);
        GUILayout.Label("Port");
        _port = GUILayout.TextField(_port);

        GUI.enabled = !_connecting;
        if (GUILayout.Button(_connecting ? "Connecting..." : "Connect"))
            Connect();
        GUI.enabled = true;

        if (!string.IsNullOrEmpty(_status))
            GUILayout.Label(_status);
    }

    private void MatchmakerGUI()
    {
        GUILayout.Label(_matchmaker.Status);

        if (_matchmaker.MatchmakingClient == null)
            return;

        if (!_matchmaker.IsMatchmakerHealthy)
        {
            if (GUILayout.Button("Retry"))
                _matchmaker.RetryMatchmakerStatus();
        }
        else if (_matchmaker.IsSearching)
        {
            if (GUILayout.Button("Cancel"))
                _matchmaker.CancelMatchmaking();
        }
        else if (!_matchmaker.IsConnecting)
        {
            if (GUILayout.Button("Find Match"))
                _matchmaker.FindMatch();
        }

        if (!string.IsNullOrEmpty(_status))
            GUILayout.Label(_status);
    }
}
```
