# `assets/br200/Assets/EdgegapBR200/Editor/BR200ServerBuilder.cs`

Template file. Write the content of the code block below, without the fences, to `BR200ServerBuilder.cs`.

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Edgegap.BR200.Editor
{
    /// <summary>
    /// Checks a BR200 project and builds its Linux dedicated server where the
    /// Edgegap Unity plugin expects it (Builds/EdgegapServer/ServerBuild).
    /// Touches no BR200 or Fusion code: Fusion settings are read by reflection.
    /// </summary>
    public static class BR200ServerBuilder
    {
        const string DefaultOutput = "Builds/EdgegapServer/ServerBuild";
        static readonly string[] RequiredScenes = { "Loader", "Menu", "LoadingScene", "Game", "GameplayUI" };

        [MenuItem("Tools/Edgegap BR200/Check Project")]
        public static void CheckFromMenu()
        {
            var problems = Check(fix: false);
            if (problems.Count == 0)
                EditorUtility.DisplayDialog("Edgegap BR200", "The project is ready for a server build.", "OK");
            else
                EditorUtility.DisplayDialog("Edgegap BR200", string.Join("\n\n", problems), "OK");
        }

        [MenuItem("Tools/Edgegap BR200/Build Linux Server")]
        public static void BuildFromMenu()
        {
            var problems = Check(fix: true);
            if (problems.Count > 0)
            {
                EditorUtility.DisplayDialog("Edgegap BR200", string.Join("\n\n", problems), "OK");
                return;
            }
            Build(DefaultOutput);
        }

        /// <summary>
        /// Unity CLI entry point:
        /// -executeMethod Edgegap.BR200.Editor.BR200ServerBuilder.BuildFromCommandLine [-edgegapOutput path]
        /// </summary>
        public static void BuildFromCommandLine()
        {
            string[] args = Environment.GetCommandLineArgs();
            int i = Array.IndexOf(args, "-edgegapOutput");
            string output = i >= 0 && i + 1 < args.Length ? args[i + 1] : DefaultOutput;

            var problems = Check(fix: true);
            foreach (string problem in problems)
                Debug.LogError($"[Edgegap BR200] {problem}");

            bool ok = problems.Count == 0 && Build(output);
            EditorApplication.Exit(ok ? 0 : 1);
        }

        /// <summary>Returns what blocks a working server build. With fix, applies the safe fixes.</summary>
        static List<string> Check(bool fix)
        {
            var problems = new List<string>();

            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Standalone, BuildTarget.StandaloneLinux64))
                problems.Add("Install the Linux Dedicated Server build support module in Unity Hub.");

            // BR200 ships with an IL2CPP server backend, and needs it: on a Mono server,
            // Fusion RPCs such as Player.RPC_SendPlayerData throw MethodAccessException
            // and players never get a character. Building Linux IL2CPP from Windows
            // or macOS needs Unity's Linux toolchain package.
            if (PlayerSettings.GetScriptingBackend(NamedBuildTarget.Server) != ScriptingImplementation.IL2CPP)
            {
                problems.Add("Set Project Settings > Player > Dedicated Server > Scripting Backend to IL2CPP. " +
                             "BR200's RPCs fail on a Mono server (MethodAccessException).");
            }
            else if (Application.platform != RuntimePlatform.LinuxEditor
                     && !File.ReadAllText("Packages/manifest.json").Contains("\"com.unity.toolchain."))
            {
                problems.Add("Building the IL2CPP server from this OS needs Unity's Linux toolchain. " +
                             "Add the package com.unity.toolchain.win-x86_64-linux-x86_64 (Windows) or the macOS toolchain for Linux x86_64 " +
                             "in Window > Package Manager > + > Add package by name.");
            }

            // BR200 and Fusion use unsafe code. BR200's Project Settings enable it,
            // but the first import can compile before they apply; reopening fixes that.
            if (!PlayerSettings.allowUnsafeCode)
            {
                if (fix)
                {
                    PlayerSettings.allowUnsafeCode = true;
                    Debug.Log("[Edgegap BR200] Enabled Player Settings > Allow 'unsafe' Code.");
                }
                else
                {
                    problems.Add("Enable Edit > Project Settings > Player > Allow 'unsafe' Code.");
                }
            }

            // BR200 loads these by name; its own build profile leaves Template out.
            string[] enabled = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            var inBuild = new HashSet<string>(enabled.Select(Path.GetFileNameWithoutExtension));
            string[] missing = RequiredScenes.Where(s => !inBuild.Contains(s)).ToArray();
            if (enabled.Length == 0 || Path.GetFileNameWithoutExtension(enabled[0]) != "Loader")
                problems.Add("TPSBR/Scenes/Loader must be the first enabled scene in the build profile.");
            if (missing.Length > 0)
                problems.Add("Add these TPSBR/Scenes scenes to the build profile: " + string.Join(", ", missing));
            if (!inBuild.Any(s => s.StartsWith("GenArea")))
                problems.Add("Add at least one map (TPSBR/Scenes/GenArea*) to the build profile.");

            string appId = ReadSetting("Fusion.Photon.Realtime.PhotonAppSettings", "Global", "AppSettings", "AppIdFusion");
            if (appId == null)
                Debug.LogWarning("[Edgegap BR200] Could not read the Fusion App ID; check Tools > Fusion > Realtime Settings yourself.");
            else if (appId.Trim().Length == 0)
                problems.Add("Set your Fusion App ID in Tools > Fusion > Realtime Settings.");

            string peerMode = ReadSetting("Fusion.NetworkProjectConfig", "Global", "PeerMode");
            if (peerMode == null)
                Debug.LogWarning("[Edgegap BR200] Could not read Peer Mode; check Tools > Fusion > Network Project Config yourself.");
            else if (peerMode != "Single")
                problems.Add($"Set Peer Mode to Single in Tools > Fusion > Network Project Config (it is {peerMode}).");

            return problems;
        }

        static bool Build(string output)
        {
            string[] scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output)));

            // Build the Server subtarget (headless, UNITY_SERVER defined), not a
            // plain Linux player, and check afterwards that Unity did. Building it
            // leaves the editor's standalone subtarget on Server, which would turn
            // the next client build into a headless server, so put it back.
            StandaloneBuildSubtarget previous = EditorUserBuildSettings.standaloneBuildSubtarget;
            BuildReport report;
            try
            {
                report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
                {
                    scenes = scenes,
                    target = BuildTarget.StandaloneLinux64,
                    subtarget = (int)StandaloneBuildSubtarget.Server,
                    locationPathName = output,
                });
            }
            finally
            {
                EditorUserBuildSettings.standaloneBuildSubtarget = previous;
            }

            var subtarget = report.summary.GetSubtarget<StandaloneBuildSubtarget>();
            bool ok = report.summary.result == BuildResult.Succeeded && subtarget == StandaloneBuildSubtarget.Server;
            string backend = PlayerSettings.GetScriptingBackend(NamedBuildTarget.Server).ToString();

            File.WriteAllText(Path.Combine(Path.GetDirectoryName(output), "edgegap-build.txt"),
                $"unity={Application.unityVersion}\nsubtarget={subtarget}\nbackend={backend}\n" +
                $"result={report.summary.result}\nbuilt_utc={DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}\n");

            Debug.Log($"[Edgegap BR200] {report.summary.result}: {output} ({subtarget}, {backend}, " +
                      $"{report.summary.totalTime.TotalMinutes:0.0} min)");
            return ok;
        }

        /// <summary>Follows static/instance members by name; null when anything is missing.</summary>
        static string ReadSetting(string typeName, params string[] path)
        {
            Type type = AppDomain.CurrentDomain.GetAssemblies()
                .Select(a => a.GetType(typeName, false))
                .FirstOrDefault(t => t != null);
            if (type == null) return null;

            object current = null;
            Type currentType = type;
            const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;
            foreach (string name in path)
            {
                try
                {
                    PropertyInfo prop = currentType.GetProperty(name, flags);
                    FieldInfo field = prop == null ? currentType.GetField(name, flags) : null;
                    if (prop == null && field == null) return null;
                    current = prop != null ? prop.GetValue(current) : field.GetValue(current);
                }
                catch (Exception)
                {
                    return null;
                }
                if (current == null) return null;
                currentType = current.GetType();
            }
            return current.ToString();
        }
    }
}
```
