# Make the game dedicated-server ready

Contents
1. Blueprint-only projects: add a C++ module
2. Server target and build settings
3. Maps, game mode, listen-server habits
4. The integration: Edgegap SDK (recommended) or drop-in files (fallback)
5. Local dedicated server test

## 1. Blueprint-only projects: add a C++ module

No `Modules` in the `.uproject` and no `Source/` folder means Blueprint-only. Dedicated server targets, the Edgegap SDK plugin (it compiles only in a project with C++) and the drop-in subsystems all need a C++ module. Easiest for the developer: in the editor, **Tools → New C++ Class → None (empty class)** creates the module, the targets and the `.sln`. Without the editor, create it yourself (module name = project name, no spaces):

- `Source/<Module>/<Module>.Build.cs`:
  ```csharp
  using UnrealBuildTool;
  public class <Module> : ModuleRules
  {
      public <Module>(ReadOnlyTargetRules Target) : base(Target)
      {
          PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
          PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore" });
      }
  }
  ```
- `Source/<Module>/<Module>.cpp`: `#include "Modules/ModuleManager.h"` and `IMPLEMENT_PRIMARY_GAME_MODULE(FDefaultGameModuleImpl, <Module>, "<Module>");`
- `Source/<Module>.Target.cs`, `<Module>Editor.Target.cs`, `<Module>Server.Target.cs` (§2).
- In the `.uproject`: `"Modules": [{ "Name": "<Module>", "Type": "Runtime", "LoadingPhase": "Default" }]`.

Blueprints keep working unchanged. With the SDK they call `Find Match (<profile>)` (or `Find Match` on the `Edgegap Matchmaker` subsystem) and bind its `On Status`, `On Match Found` and `On Failed` events (`sdk.md` §4); server-side nodes are under **Edgegap > Server**. With the drop-ins they use `Get Game Instance → Get Subsystem (EdgegapMatchmakerSubsystem)`: `Find Match`, `Cancel Match`, `Get Status Text`, and the `On Status Changed` event for a UMG menu.

## 2. Server target and build settings

A project needs three targets. The Server one is often missing:

```csharp
using UnrealBuildTool;
public class <Module>ServerTarget : TargetRules
{
    public <Module>ServerTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Server;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;
        ExtraModuleNames.Add("<Module>");
    }
}
```

Use the same `DefaultBuildSettings`/`IncludeOrderVersion` in all three targets, matching the engine (UE 5.5: `V5`/`Unreal5_5`; 5.4: `V5`/`Unreal5_4`; 5.3: `V4`/`Unreal5_3`). Old values such as `V2` make the editor target fail against a 5.5 source engine (`modifies the values of properties … bStrictConformanceMode`).

## 3. Maps, game mode, listen-server habits

In `Config/DefaultEngine.ini` under `[/Script/EngineSettings.GameMapsSettings]`:
- `GameDefaultMap`: the client's menu or entry map. The matchmaking overlay shows on standalone maps.
- `ServerDefaultMap`: the map the dedicated server opens.
- `GlobalDefaultGameMode` or a per-map override in World Settings.

List both maps under `+MapsToCook=` in `[/Script/UnrealEd.ProjectPackagingSettings]` (`DefaultGame.ini`) so the server package contains them.

Listen-server projects (`open Map?listen`, Sessions with a hosting player, "Host game" buttons): the dedicated server replaces the host. Gameplay replication usually works as is. Check code that assumes a local player on the server (`GetFirstPlayerController()` on the server, HUD or audio in server code paths), guard it with `IsRunningDedicatedServer()` or `GetNetMode() == NM_DedicatedServer`, and drop the host flow from the menu.

## 4. The integration: Edgegap SDK (recommended) or drop-in files (fallback)

**UE 5.0-5.8: the Edgegap SDK.** Copy `Plugin/EdgegapSDK` from https://github.com/edgegap/sdk-unreal-engine into `Plugins/`, regenerate project files, build the editor target, then wire the server side (ticket check through the game mode's `PreLogin`, end-of-match `Self Stop`). Everything is in `sdk.md` §3-5. Nothing below this paragraph is needed with the SDK, and the two must not be combined (same class names).

**Fallback: the drop-in files**, for engines outside 5.0-5.8 or a team that won't add a plugin. They have no server-side ticket check: any client that knows the address can join.

Copy `assets/unreal/Source/*` into `Source/<Module>/` and extend `<Module>.Build.cs`:

```csharp
PublicDependencyModuleNames.AddRange(new string[] { /* existing */ "HTTP", "Json", "Sockets", "Slate", "SlateCore" });
```

- **`EdgegapMatchmakerSubsystem`** (game instance subsystem, clients only): beacon pings → ticket → poll → `ClientTravel`. Shows a Find Match overlay on standalone maps (`bShowDefaultUI`), registers `Edgegap.FindMatch` / `Edgegap.CancelMatch` console commands, honors `-FindMatch` on the command line, and exposes BlueprintCallable functions and an `OnStatusChanged` event. It doesn't exist unless `bEnabled=True`, so a disabled build behaves exactly as before.
- **`EdgegapServerSubsystem`** (dedicated server only): if the server was started by the matchmaker (`MM_MATCH_ID` or `MM_TICKET_IDS` present), it calls `DELETE $ARBITRIUM_DELETE_URL` 15 s after the last player leaves, or after 5 min if nobody joins. It uses `FGameModeEvents`, so the game mode stays untouched. Hand-deployed and local servers aren't affected.

The classes have no `<MODULE>_API` macro: they're used inside the game module only. Their ini sections are `[/Script/<Module>.EdgegapMatchmakerSubsystem]` and `[/Script/<Module>.EdgegapServerSubsystem]`, with the module name from `Build.cs`, not the project display name.

Already have a game-specific menu? Set `bShowDefaultUI=False` and bind a button to `Find Match`, and the status text to `On Status Changed`.

## 5. Local dedicated server test

Before any Docker work, prove the server and client talk locally with the editor binaries:

```bash
UnrealEditor.exe "<path>\<Project>.uproject" <ServerMap> -server -log -port=7777
UnrealEditor.exe "<path>\<Project>.uproject" -game -windowed -ResX=960 -ResY=540 -log
```

In the client console (`` ` ``): `open 127.0.0.1:7777`. The server log shows `Join succeeded`; the client log shows `Welcomed by server`. The first launch compiles shaders for several minutes.
