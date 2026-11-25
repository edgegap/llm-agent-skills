# `assets/unity/Examples/BossRoom/EdgegapTestDriver.cs`

Template file. Write the content of the code block below, without the fences, to `EdgegapTestDriver.cs`.

```csharp
// Command-line test driver for client builds: lets a script join a server and start a match without clicking.
// Only active when one of its flags is passed, so normal players never see it. EdgegapBootstrap adds it.
//   -edgegapConnect -edgegapAddress <ip> -edgegapPort <port>  join a server from the main menu (direct mode)
//   -edgegapAutoReady <seat>                                  in CharSelect, take hero seat 0-7 and lock in
//   -edgegapScreenshots <folder>                              save a screenshot every 10 s
//   -edgegapQuitAfter <seconds>                               quit after this long
using System;
using System.Collections;
using System.IO;
using Unity.BossRoom.ConnectionManagement;
using Unity.BossRoom.Gameplay.GameState;
using Unity.Netcode;
using UnityEngine;
using UnityEngine.SceneManagement;

public class EdgegapTestDriver : MonoBehaviour
{
    public static bool IsRequested =>
        EdgegapBootstrap.HasFlag("-edgegapConnect")
        || EdgegapBootstrap.HasFlag("-edgegapAutoReady")
        || EdgegapBootstrap.HasFlag("-edgegapScreenshots")
        || EdgegapBootstrap.HasFlag("-edgegapQuitAfter");

    private IEnumerator Start()
    {
        if (float.TryParse(EdgegapBootstrap.Arg("-edgegapQuitAfter"), out float quitAfter))
            StartCoroutine(QuitAfter(quitAfter));

        if (EdgegapBootstrap.Arg("-edgegapScreenshots") is string folder)
            StartCoroutine(Screenshots(folder));

        if (int.TryParse(EdgegapBootstrap.Arg("-edgegapAutoReady"), out int seat))
            StartCoroutine(AutoReady(seat));

        if (!EdgegapBootstrap.HasFlag("-edgegapConnect"))
            yield break;

        string address = EdgegapBootstrap.Arg("-edgegapAddress") ?? "127.0.0.1";
        int port = int.TryParse(EdgegapBootstrap.Arg("-edgegapPort"), out int p) ? p : EdgegapBootstrap.Settings.ListenPort;

        yield return new WaitUntil(() => SceneManager.GetActiveScene().name == "MainMenu");
        yield return new WaitForSeconds(1f); // let the menu's VContainer scope and connection manager start

        var cm = FindFirstObjectByType<ConnectionManager>();
        Debug.Log($"Edgegap Test | Connecting to {address}:{port}.");
        cm.StartClientIp($"Tester{UnityEngine.Random.Range(100, 999)}", address, port);
    }

    private IEnumerator AutoReady(int seat)
    {
        while (true)
        {
            yield return new WaitUntil(() => SceneManager.GetActiveScene().name == "CharSelect");
            NetworkCharSelection selection = null;
            yield return new WaitUntil(() => (selection = FindFirstObjectByType<NetworkCharSelection>()) != null && selection.IsSpawned);
            yield return new WaitForSeconds(2f);

            ulong id = NetworkManager.Singleton.LocalClientId;
            Debug.Log($"Edgegap Test | Taking seat {seat} and locking in.");
            selection.ServerChangeSeatRpc(id, seat, false);
            yield return new WaitForSeconds(1f);
            selection.ServerChangeSeatRpc(id, seat, true);

            yield return new WaitUntil(() => SceneManager.GetActiveScene().name != "CharSelect");
        }
    }

    private IEnumerator Screenshots(string folder)
    {
        Directory.CreateDirectory(folder);
        int i = 0;
        while (true)
        {
            yield return new WaitForSeconds(10f);
            yield return new WaitForEndOfFrame();
            string file = Path.Combine(folder, $"{i++:D3}-{SceneManager.GetActiveScene().name}.png");
            ScreenCapture.CaptureScreenshot(file);
        }
    }

    private IEnumerator QuitAfter(float seconds)
    {
        yield return new WaitForSeconds(seconds);
        Debug.Log("Edgegap Test | Quitting.");
        Application.Quit();
    }
}
```
