// Adds the Edgegap components at startup, so the game's scenes and prefabs stay untouched.
// - Dedicated server build (Linux Dedicated Server / -batchmode): EdgegapServerLifecycle starts the NGO server
//   (unless AutoStartServer is off) and stops the Edgegap deployment once the match is empty.
// - Client build: the game's own UI connects as before. When UseEdgegapMatchmaker is on, a Find Match panel
//   (EdgegapMatchmakingClient) shows on MenuSceneName.
//
// Command-line overrides (handy for scripted tests and for Edgegap's UNITY_COMMANDLINE_ARGS):
//   -edgegapListenPort <port>     server listen port when ARBITRIUM_PORT_GAMEPORT_INTERNAL is not set
//   -edgegapMatchmaker true|false use the matchmaker           -edgegapMatchmakerUrl <url>  -edgegapAuthToken <token>
//   -edgegapProfile <name>        matchmaker profile           -edgegapFindMatch            find a match on startup
//   -edgegapConnect -edgegapAddress <ip> -edgegapPort <port>   test: connect directly on startup
//   -edgegapQuitAfter <seconds>   test: quit after this long
// Adapted from the end-to-end verified edgegap/netcode-game-sample-unity-ngo-bossroom sample.
using System;
using System.Collections;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using UnityEngine;

public static class EdgegapBootstrap
{
    public static EdgegapSettings Settings { get; private set; }

    public static bool IsServerBuild
    {
        get
        {
#if UNITY_SERVER
            return true;
#else
            return Application.isBatchMode;
#endif
        }
    }

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    private static void Initialize()
    {
        Settings = Resources.Load<EdgegapSettings>(EdgegapSettings.ResourcePath);
        if (Settings == null)
        {
            Debug.LogWarning("Edgegap | No Resources/EdgegapSettings asset, using defaults.");
            Settings = ScriptableObject.CreateInstance<EdgegapSettings>();
        }
        else
        {
            // Work on a copy: command-line overrides must not change the asset in the Editor.
            Settings = UnityEngine.Object.Instantiate(Settings);
        }

        ApplyCommandLine(Settings);

        var go = new GameObject("Edgegap");
        UnityEngine.Object.DontDestroyOnLoad(go);

        if (float.TryParse(Arg("-edgegapQuitAfter"), out float quitAfter))
            go.AddComponent<EdgegapQuitTimer>().Seconds = quitAfter;

        if (IsServerBuild)
        {
            var server = go.AddComponent<EdgegapServerLifecycle>();
            server.AutoStartServer = Settings.AutoStartServer;
            server.ListenPort = Settings.ListenPort;
            server.PortName = Settings.PortName;
            server.FirstPlayerTimeoutSeconds = Settings.FirstPlayerTimeoutSeconds;
            server.EmptyServerTimeoutSeconds = Settings.EmptyServerTimeoutSeconds;
            return;
        }

        if (Settings.UseEdgegapMatchmaker)
        {
            var matchmaker = go.AddComponent<EdgegapMatchmakingClient>();
            matchmaker.BaseUrl = Settings.MatchmakerUrl;
            matchmaker.AuthToken = Settings.MatchmakerAuthToken;
            matchmaker.Profile = Settings.Profile;
            matchmaker.PortName = Settings.PortName;
            matchmaker.UseLatencyBeacons = Settings.UseLatencyBeacons;
            matchmaker.MenuSceneName = Settings.MenuSceneName;
            matchmaker.FindMatchOnStart = HasFlag("-edgegapFindMatch");
        }

        if (HasFlag("-edgegapConnect"))
        {
            string address = Arg("-edgegapAddress") ?? "127.0.0.1";
            ushort port = ushort.TryParse(Arg("-edgegapPort"), out ushort p) ? p : Settings.ListenPort;
            go.AddComponent<EdgegapQuitTimer>().StartCoroutine(ConnectWhenReady(address, port));
        }
    }

    // Test flag: plain NGO client start. Games with their own connection flow (a ConnectionManager, a lobby
    // menu) should call that flow here instead, so their connection payload and state machine run.
    private static IEnumerator ConnectWhenReady(string address, ushort port)
    {
        yield return new WaitUntil(() => NetworkManager.Singleton != null);
        yield return null;
        Debug.Log($"Edgegap | Connecting to {address}:{port}.");
        NetworkManager.Singleton.GetComponent<UnityTransport>().SetConnectionData(address, port);
        NetworkManager.Singleton.StartClient();
    }

    private static void ApplyCommandLine(EdgegapSettings s)
    {
        if (ushort.TryParse(Arg("-edgegapListenPort"), out ushort listenPort)) s.ListenPort = listenPort;
        if (bool.TryParse(Arg("-edgegapMatchmaker"), out bool useMatchmaker)) s.UseEdgegapMatchmaker = useMatchmaker;
        if (Arg("-edgegapMatchmakerUrl") is string url) s.MatchmakerUrl = url;
        if (Arg("-edgegapAuthToken") is string token) s.MatchmakerAuthToken = token;
        if (Arg("-edgegapProfile") is string profile) s.Profile = profile;
    }

    public static bool HasFlag(string name) => Array.IndexOf(Environment.GetCommandLineArgs(), name) >= 0;

    public static string Arg(string name)
    {
        string[] args = Environment.GetCommandLineArgs();
        int i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }
}
