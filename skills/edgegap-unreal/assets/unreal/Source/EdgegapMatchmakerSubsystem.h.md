# `assets/unreal/Source/EdgegapMatchmakerSubsystem.h`

Template file. Write the content of the code block below, without the fences, to `EdgegapMatchmakerSubsystem.h`.

```cpp
// Edgegap matchmaking client for Unreal Engine 5 (edgegap-unreal skill).
// Drop into the game module's source folder; the module needs HTTP, Json, Sockets, Slate and SlateCore.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Interfaces/IHttpRequest.h"
#include "EdgegapMatchmakerSubsystem.generated.h"

class SWidget;

UENUM(BlueprintType)
enum class EEdgegapMatchmakingState : uint8
{
	Idle,
	Searching,
	Connecting,
	Failed
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FEdgegapMatchmakingStatusChanged, EEdgegapMatchmakingState, State, const FString&, StatusText);

/**
 * Client side of Edgegap matchmaking: measures latency to Edgegap's ping beacons, creates a ticket,
 * polls it until a server is assigned, then travels to that server.
 *
 * Configured in Config/DefaultGame.ini under [/Script/<YourModule>.EdgegapMatchmakerSubsystem].
 * Off unless bEnabled=True; when off, the subsystem is never created and the game is unchanged.
 * Never created on dedicated servers.
 */
UCLASS(config=Game)
class UEdgegapMatchmakerSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	// Begin USubsystem interface
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	// End USubsystem interface

	/** Measures beacon latency, creates a ticket and starts polling. Does nothing while already searching. */
	UFUNCTION(BlueprintCallable, Category = "Edgegap")
	void FindMatch();

	/** Deletes the current ticket and stops searching. */
	UFUNCTION(BlueprintCallable, Category = "Edgegap")
	void CancelMatch();

	UFUNCTION(BlueprintPure, Category = "Edgegap")
	EEdgegapMatchmakingState GetState() const { return State; }

	UFUNCTION(BlueprintPure, Category = "Edgegap")
	FString GetStatusText() const { return StatusText; }

	/** Fires on every state or status text change, for a UMG menu. */
	UPROPERTY(BlueprintAssignable, Category = "Edgegap")
	FEdgegapMatchmakingStatusChanged OnStatusChanged;

	/** Turns matchmaking on. Off by default so the integration is opt-in. */
	UPROPERTY(config)
	bool bEnabled = false;

	/** Matchmaker API URL from the dashboard. Keep it quoted in the ini: unquoted, the parser cuts it at "//". */
	UPROPERTY(config)
	FString MatchmakerUrl;

	/** Matchmaker auth token from the dashboard. Safe to ship in clients: it grants no Edgegap API access. */
	UPROPERTY(config)
	FString AuthToken;

	/** Profile name from the matchmaker config. */
	UPROPERTY(config)
	FString Profile = TEXT("casual");

	/** Port name on the Edgegap app version. If the version has a single port, that port is used anyway. */
	UPROPERTY(config)
	FString PortName = TEXT("gameport");

	UPROPERTY(config)
	float PollIntervalSeconds = 2.f;

	/**
	 * Sends the player's latency to each beacon with the ticket, for a "latencies" rule in the profile.
	 * Turn off if the profile has no such rule: the matchmaker rejects attributes it doesn't expect.
	 */
	UPROPERTY(config)
	bool bSendBeaconLatencies = true;

	/** Timeout for one ping to one beacon. Unreachable beacons are left out of the ticket. */
	UPROPERTY(config)
	float BeaconPingTimeoutSeconds = 1.f;

	/** Shows a minimal Find Match / Cancel overlay on standalone (menu) maps. Turn off once your own UI calls FindMatch. */
	UPROPERTY(config)
	bool bShowDefaultUI = true;

private:
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> MakeRequest(const FString& Verb, const FString& Path) const;
	void OnBeaconsReceived(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected, int32 ForSearch);
	void CreateTicket(const TMap<FString, float>& BeaconLatencies);
	void OnTicketCreated(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected);
	void PollTicket();
	void OnTicketPolled(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected);
	void DeleteTicket();
	void StopPolling();
	void Fail(const FString& Reason);
	void SetState(EEdgegapMatchmakingState NewState, const FString& NewStatusText);

	void OnPostLoadMap(UWorld* LoadedWorld);
	void ShowDefaultUI();
	void HideDefaultUI();

	EEdgegapMatchmakingState State = EEdgegapMatchmakingState::Idle;
	FString StatusText = TEXT("Press Find Match");
	FString TicketId;
	/** Increments on every FindMatch and CancelMatch, so late results from an old search are ignored. */
	int32 SearchId = 0;
	FTimerHandle PollTimer;
	bool bPollInFlight = false;
	bool bAutoQueued = false;
	FDelegateHandle PostLoadMapHandle;
	TSharedPtr<SWidget> DefaultWidget;
};
```
