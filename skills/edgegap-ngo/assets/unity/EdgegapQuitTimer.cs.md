# `assets/unity/EdgegapQuitTimer.cs`

Template file. Write the content of the code block below, without the fences, to `EdgegapQuitTimer.cs`.

```csharp
// Coroutine host for EdgegapBootstrap, and the -edgegapQuitAfter test timer. In its own file: Unity only
// finds MonoBehaviours in builds when the file name matches the class name.
using UnityEngine;

/// <summary>Coroutine host for the bootstrap, and the -edgegapQuitAfter test timer.</summary>
public class EdgegapQuitTimer : MonoBehaviour
{
    public float Seconds = -1f;

    private void Update()
    {
        if (Seconds > 0f && Time.realtimeSinceStartup > Seconds)
        {
            Debug.Log("Edgegap | Quitting (-edgegapQuitAfter).");
            Application.Quit();
            Seconds = -1f;
        }
    }
}
```
