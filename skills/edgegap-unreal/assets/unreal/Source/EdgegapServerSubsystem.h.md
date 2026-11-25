# `assets/unreal/Source/EdgegapServerSubsystem.h`

Template file. Write the content of the code block below, without the fences, to `EdgegapServerSubsystem.h`.

```cpp
// Edgegap dedicated server lifecycle for Unreal Engine 5 (edgegap-unreal skill).
// Drop into the game module's source folder; the module needs HTTP.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "EdgegapServerSubsystem.generated.h"

class AController;
class AGameModeBase;
class APlayerController;

/**
 * Stops the Edgegap deployment when the match is over, so idle servers don't keep billing.
 *
 * Only active on a dedicated server that the Edgegap matchmaker started (MM_* variables present):
 * it stops the deployment a few seconds after the last player leaves, or if nobody joins in time.
 * Servers deployed by hand or run locally are left alone. Needs no change to the game mode:
 * it listens to the engine's global login/logout events.
 *
 * Optional tuning in Config/DefaultGame.ini under [/Script/<YourModule>.EdgegapServerSubsystem].
 */
UCLASS(config=Game)
class UEdgegapServerSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	// Begin USubsystem interface
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	// End USubsystem interface

	/** True when the Edgegap matchmaker started this server. */
	static bool IsMatchmakerDeployment();

	/** Asks Edgegap to stop this deployment. Edgegap then sends SIGTERM, which Unreal handles as a clean exit. */
	void StopDeployment(const FString& Reason);

	/** Seconds a fresh server waits for its first player before stopping itself. */
	UPROPERTY(config)
	float NoPlayerTimeoutSeconds = 300.f;

	/** Seconds the server stays up once empty, so a matched player who is still connecting can join. */
	UPROPERTY(config)
	float EmptyServerGraceSeconds = 15.f;

private:
	void OnPostLogin(AGameModeBase* GameMode, APlayerController* NewPlayer);
	void OnLogout(AGameModeBase* GameMode, AController* Exiting);
	void CheckEmptyServer();

	FTimerHandle StopTimer;
	FDelegateHandle PostLoginHandle;
	FDelegateHandle LogoutHandle;
	bool bStopRequested = false;
};
```
