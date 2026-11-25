# Engine and toolchain setup

Contents
1. What the developer installs
2. Getting the engine source
3. Building the engine
4. Known engine and compiler fixes
5. Timings and how not to lose them
6. No source build: Epic's container image (UE 5.8)

Dedicated servers need an engine **built from source**: Epic Launcher builds can't build `Server` targets. The alternative is to build only the Linux server inside Epic's container image, which holds a source-built engine, and keep the Launcher engine for the editor and clients (§6). Everything below is Windows-first (the common dev machine); on Linux the server builds natively and the cross-compile toolchain isn't needed.

## 1. What the developer installs

Give these as links; the developer clicks through installers and account steps.

| What | Where | Notes |
|---|---|---|
| Epic ↔ GitHub account link | https://www.unrealengine.com/en-US/ue-on-github | Then accept the EpicGames org invite: https://github.com/orgs/EpicGames/invitation. Until then the engine repo answers **"Repository not found"**. |
| Git | https://git-scm.com/download/win | |
| Visual Studio 2022 | https://visualstudio.microsoft.com/downloads/ | Workloads: **Game development with C++**, **Desktop development with C++**, **.NET desktop development**. VS 2022 specifically: UE 5.5 doesn't support newer VS compilers (§4). |
| Linux cross-compile toolchain | https://dev.epicgames.com/documentation/en-us/unreal-engine/linux-development-requirements-for-unreal-engine | Must match the engine version: UE 5.5 → `v23_clang-18.1.0-rockylinux8`, UE 5.4 → `v22_clang-16.0.6-centos7`, UE 5.3 → `v22_clang-16.0.6-centos7`. The installer sets `LINUX_MULTIARCH_ROOT`. |
| Docker Desktop | https://www.docker.com/products/docker-desktop/ | Must be running for builds and pushes. |

Verify instead of trusting "done":
- `git --version`, `docker info` (server part answers).
- Visual Studio workloads: `vswhere -products * -requires Microsoft.VisualStudio.Workload.NativeGame -property displayName` (`vswhere.exe` is in `C:\Program Files (x86)\Microsoft Visual Studio\Installer\`). Workloads often land on the wrong Visual Studio when two are installed. The real requirement is the MSVC toolset and a Windows SDK: `VC\Tools\MSVC\14.*` under the VS 2022 install and `C:\Program Files (x86)\Windows Kits\10\Include\10.*`.
- Toolchain: `LINUX_MULTIARCH_ROOT` set at machine level (a new shell sees it).

## 2. Getting the engine source

Clone the branch matching the project's engine version, shallow, to a **short path**:

```bash
git clone -b 5.5 --depth 1 https://github.com/EpicGames/UnrealEngine.git C:/UE5
```

- Run it from **PowerShell or Git Bash on Windows**, not WSL: in WSL, `C:/UE5` is a relative folder named `C:` (permission denied, or a clone in the wrong place).
- "Repository not found" means the GitHub account isn't in the EpicGames org yet (§1), or Git signed in with another account.
- Short paths matter: Windows builds fail when intermediate paths exceed 260 characters (§4). Keep the engine and the project near the drive root.

Then, in `C:\UE5`: `Setup.bat` (downloads ~20 GB, prerequisites installer pops up), then `GenerateProjectFiles.bat`.

## 3. Building the engine

From the command line, so you can run it in the background and read the log:

```bash
cd C:\UE5
Engine\Build\BatchFiles\Build.bat UnrealEditor Win64 Development -WaitMutex
Engine\Build\BatchFiles\Build.bat ShaderCompileWorker Win64 Development -WaitMutex
```

- **ShaderCompileWorker is a separate target.** Building only `UnrealEditor` from the command line leaves it out, and the first game launch dies with `Couldn't launch ShaderCompileWorker.exe`. Building the `UE5` solution in Visual Studio includes it.
- Add the compiler pin from §4 to every `Build.bat` call when a newer Visual Studio is installed.
- The `.uproject`'s `EngineAssociation` must point at this build. Registering happens when the engine is built or `UnrealVersionSelector` runs; the GUID is under `HKCU\Software\Epic Games\Unreal Engine\Builds`. A GUID in a cloned sample is the original author's machine: set it to yours locally and **don't commit that change**.
- Compile the project's editor target against the engine to prove the setup:
  `Build.bat <Project>Editor Win64 Development -Project="<path>\<Project>.uproject" -WaitMutex`

## 4. Known engine and compiler fixes

| Symptom | Cause | Fix |
|---|---|---|
| Build log says `Visual Studio 2022 compiler version 14.5x … not a preferred version` and picks a toolchain under `Microsoft Visual Studio\18\` | A newer Visual Studio (2026) is installed next to 2022; UBT picks its compiler, which UE 5.5 doesn't support. | Stop the build. Pin the VS 2022 toolset on every UBT call: `-Compiler=VisualStudio2022 -CompilerVersion=<14.4x.xxxxx from VS 2022's VC\Tools\MSVC>`. A 14.38-14.44 warning ("not a preferred version") is fine. |
| `BlackmagicInputChannel.h: error C2039: 'system_clock': is not a member of 'std::chrono'` (UE 5.5 with MSVC 14.4x) | Missing include in an engine plugin. | Add `#include <chrono>` after `#include <atomic>` in `Engine/Plugins/Media/BlackmagicMedia/Source/BlackmagicCore/Private/Common.h`, then re-run the build (incremental, about a minute). |
| `The following action paths are longer than 260 characters` | Deep project or engine path on Windows. | Move the project (or a worktree of it) to a short path such as `C:\Projects\<Name>`. |
| `MultiplayerGameEditor modifies the values of properties: [ bStrictConformanceMode … ]` / `has build products in common with UnrealEditor` | Targets created with an older engine (`BuildSettingsVersion.V2`). | Upgrade every `*.Target.cs`: `DefaultBuildSettings = BuildSettingsVersion.V5;` and `IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;` (use the version matching the engine). |
| `Couldn't launch ShaderCompileWorker.exe` | Not built (§3). | Build the `ShaderCompileWorker` target. |
| `Unable to launch the Unreal Trace Server … Access is denied` | Harmless warning. | Ignore. |
| NuGet `NU1903` vulnerability warnings while building UBT/UAT | Harmless for local builds. | Ignore. |

## 5. Timings and how not to lose them

| Step | First time | After |
|---|---|---|
| `Setup.bat` | 20-60 min (download) | – |
| Engine editor build | 1-3 h | minutes |
| Project editor target | 1-2 min | seconds |
| Linux server package (`BuildCookRun`) | ~1 h (engine server modules for Linux + cook) | 10-20 min |
| First game launch | 5-15 min shader compile | seconds |

- Run long builds in the background and check progress in the log (`[1768/6583] Compile …` gives the fraction done).
- UBT holds a global mutex: a second build, or launching the editor, waits until the first finishes. Don't start an editor launch while packaging if you need it soon.
- Moving the project to a new path recompiles engine modules for it. Pick the final path early.

## 6. No source build: Epic's container image (UE 5.8)

Verified on 2026-11-02 with Lyra on UE 5.8.4 (Launcher editor and clients, Linux server built in Docker, Edgegap matchmaker and EOS sessions, end to end on Edgegap), and with a minimal C++ project through the build scripts below.

- Image: `ghcr.io/epicgames/unreal-engine:dev-slim-<version>` (dev-slim-5.8.4 is about 82 GB unpacked; give Docker Desktop the disk). Pulling needs the Epic ↔ GitHub link (§1) and a GitHub token with `read:packages`: `gh auth token | docker login ghcr.io -u <user> --password-stdin` from bash.
- Easiest path: [edgegap/buildtool-unreal-scripts](https://github.com/edgegap/buildtool-unreal-scripts) 1.1.0 or newer. Its `BuildUploadServer.ps1`/`.sh` build, cook and package the server in the image, keep compiled code, cooked content and DDC in Docker cache mounts (a rebuild of an unchanged project compiled in 12 s instead of 66 s), and push to the Edgegap registry. Older releases fail at the runtime stage (`apt-get jq curl` without `install`) and print the self-stop token in the logs.
- Running RunUAT yourself in the container: `BuildCookRun -server -noclient -platform=Linux -build -cook -stage -pak -archive`, the project in a Docker volume, not a Windows bind mount (much faster).

UE 5.8 pitfalls met on that path:

| Symptom | Fix |
|---|---|
| Cook fails: `Content is missing from cook … marked NeverCook` (Landmass packages referencing `/Engine/EditorMaterials`) | Drop `-SkipCookingEditorContent` from BuildCookRun. |
| `-skipcook` later fails: `Failed reading oplog` | 5.8 keeps cook output in Zen under `~/.config/Epic`: keep that folder in a volume between runs. |
| clang crashes on a rebuild (`CHAINED-SIGNAL 11`) | `-UbtArgs="-NoUBA"`. |
| `More than one server target` | `DefaultEngine.ini` `[BuildSettings] DefaultServerTarget=<Name>Server`. |
| Installed engine rejects a target that sets `bUseChecksInShipping` (or other engine-wide settings) | Set them only when `BuildEnvironment == TargetBuildEnvironment.Unique`. |
| Launcher copies of engine plugin sources fail clang `-Werror` (unreachable code) | Take those files from the matching engine source tag. |
| CustomConfig targets (`-CustomConfig=EOS`) are disabled in an installed engine | Pass `-CustomConfig=EOS` at run time, or put the settings in `DefaultEngine.ini`: `Config/Custom/*` isn't staged in packaged builds. |

