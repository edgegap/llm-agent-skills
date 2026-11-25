# `assets/test/ConnectionTypeProbe.cs`

Template file. Write the content of the code block below, without the fences, to `ConnectionTypeProbe.cs`.

```csharp
using Fusion;
using UnityEngine;

// Test-only: logs what the Tab overlay's CT field shows in BR200 (runner.CurrentConnectionType),
// so headless clients report Direct vs Relayed in their logs. Delete it before shipping.
public sealed class ConnectionTypeProbe : MonoBehaviour
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Create()
    {
        var go = new GameObject("ConnectionTypeProbe");
        DontDestroyOnLoad(go);
        go.AddComponent<ConnectionTypeProbe>();
    }

    float _next;

    void Update()
    {
        if (Time.realtimeSinceStartup < _next) return;
        _next = Time.realtimeSinceStartup + 5f;

        foreach (var runner in FindObjectsByType<NetworkRunner>(FindObjectsSortMode.None))
        {
            if (runner.IsRunning == false) continue;
            int players = 0;
            foreach (var _ in runner.ActivePlayers) players++;
            Debug.Log($"[probe] mode={runner.GameMode} CT={runner.CurrentConnectionType} " +
                      $"rtt={runner.GetPlayerRtt(PlayerRef.None) * 1000:0}ms players={players} " +
                      $"session={runner.SessionInfo?.Name} region={runner.SessionInfo?.Region}");
        }
    }
}
```
