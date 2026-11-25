# `assets/unity/EdgegapBootstrap.cs`

Template file. Write the content of the code block below, without the fences, to `EdgegapBootstrap.cs`.

```csharp
// Adds the Edgegap components at startup, so the upstream GameScene stays untouched (easy upstream syncs).
// - Dedicated server build (-batchmode / Linux Dedicated Server): EdgegapServerLifecycle starts the
//   PurrNet server on the listen port and stops the Edgegap deployment once the match is empty.
// - Client build: EdgegapConnectPanel connects directly to a server (default) or, when
//   UseEdgegapMatchmaker is on, finds a match with EdgegapMatchmakingClient.
// PurrNet's own auto start (host in the Editor, client to 127.0.0.1 in builds) is turned off in builds.
// The Editor keeps it unless "Apply In Editor" is ticked on the settings asset.
//
// Command-line overrides (handy for scripted tests and for Edgegap's UNITY_COMMANDLINE_ARGS):
//   -edgegapListenPort <port>     server listen port
//   -edgegapAddress <host>        direct connection address    -edgegapPort <port>  direct connection port
//   -edgegapConnect               connect directly on startup  -edgegapFindMatch    find a match on startup
//   -edgegapMatchmaker true|false use the matchmaker           -edgegapMatchmakerUrl <url>  -edgegapAuthToken <token>
using System;
using PurrNet;
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

        if (Application.isEditor && !Settings.ApplyInEditor)
            return;

        ApplyCommandLine(Settings);

        // This component starts the server/client itself.
        NetworkManager.DisableFlags();

        var go = new GameObject("Edgegap");
        UnityEngine.Object.DontDestroyOnLoad(go);

        if (IsServerBuild)
        {
            var server = go.AddComponent<EdgegapServerLifecycle>();
            server.ListenPort = Settings.ListenPort;
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
            matchmaker.ShowGUI = false; // EdgegapConnectPanel shows the status
        }

        go.AddComponent<EdgegapConnectPanel>();
    }

    private static void ApplyCommandLine(EdgegapSettings s)
    {
        if (ushort.TryParse(Arg("-edgegapListenPort"), out ushort listenPort)) s.ListenPort = listenPort;
        if (Arg("-edgegapAddress") is string address) s.DirectAddress = address;
        if (ushort.TryParse(Arg("-edgegapPort"), out ushort port)) s.DirectPort = port;
        if (bool.TryParse(Arg("-edgegapMatchmaker"), out bool useMatchmaker)) s.UseEdgegapMatchmaker = useMatchmaker;
        if (Arg("-edgegapMatchmakerUrl") is string url) s.MatchmakerUrl = url;
        if (Arg("-edgegapAuthToken") is string token) s.MatchmakerAuthToken = token;
    }

    public static bool HasFlag(string name) => Array.IndexOf(Environment.GetCommandLineArgs(), name) >= 0;

    private static string Arg(string name)
    {
        string[] args = Environment.GetCommandLineArgs();
        int i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }
}
```
