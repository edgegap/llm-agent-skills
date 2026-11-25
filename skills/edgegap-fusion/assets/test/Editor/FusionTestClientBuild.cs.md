# `assets/test/Editor/FusionTestClientBuild.cs`

Template file. Write the content of the code block below, without the fences, to `FusionTestClientBuild.cs`.

```csharp
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;

// Test-only: a Windows IL2CPP client for scripted two-client tests against a
// Fusion dedicated server. Delete it before shipping.
// <Unity> -batchmode -quit -projectPath <project> -executeMethod FusionTestClientBuild.Build -logFile -
public static class FusionTestClientBuild
{
    public static void Build()
    {
        PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.IL2CPP);
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray(),
            target = BuildTarget.StandaloneWindows64,
            // Without this, a server build earlier in the session can leave the
            // standalone subtarget on Server and this "client" comes out headless.
            subtarget = (int)StandaloneBuildSubtarget.Player,
            locationPathName = "Builds/TestClient/Client.exe",
        });
        UnityEngine.Debug.Log($"[FusionTestClientBuild] {report.summary.result} {report.summary.totalTime.TotalMinutes:0.0} min");
        EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
    }
}
```
