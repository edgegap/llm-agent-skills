# `assets/unreal/Source/EdgegapServerSubsystem.cpp`

Template file. Write the content of the code block below, without the fences, to `EdgegapServerSubsystem.cpp`.

```cpp
// Edgegap dedicated server lifecycle for Unreal Engine 5 (edgegap-unreal skill).

#include "EdgegapServerSubsystem.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "GameFramework/GameModeBase.h"
#include "HAL/PlatformMisc.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "TimerManager.h"

DEFINE_LOG_CATEGORY_STATIC(LogEdgegapServer, Log, All);

bool UEdgegapServerSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	return IsRunningDedicatedServer();
}

bool UEdgegapServerSubsystem::IsMatchmakerDeployment()
{
	// The matchmaker injects MM_* variables into the deployments it starts.
	return !FPlatformMisc::GetEnvironmentVariable(TEXT("MM_MATCH_ID")).IsEmpty()
		|| !FPlatformMisc::GetEnvironmentVariable(TEXT("MM_TICKET_IDS")).IsEmpty();
}

void UEdgegapServerSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	if (!IsMatchmakerDeployment())
	{
		UE_LOG(LogEdgegapServer, Log, TEXT("Not started by the Edgegap matchmaker: the server will not stop itself"));
		return;
	}

	UE_LOG(LogEdgegapServer, Log, TEXT("Started by the Edgegap matchmaker: the server stops itself when the match is empty"));
	PostLoginHandle = FGameModeEvents::GameModePostLoginEvent.AddUObject(this, &UEdgegapServerSubsystem::OnPostLogin);
	LogoutHandle = FGameModeEvents::GameModeLogoutEvent.AddUObject(this, &UEdgegapServerSubsystem::OnLogout);

	TWeakObjectPtr<UEdgegapServerSubsystem> WeakThis(this);
	GetGameInstance()->GetTimerManager().SetTimer(StopTimer, FTimerDelegate::CreateLambda([WeakThis]()
	{
		if (WeakThis.IsValid())
		{
			WeakThis->StopDeployment(TEXT("no player joined"));
		}
	}), NoPlayerTimeoutSeconds, false);
}

void UEdgegapServerSubsystem::Deinitialize()
{
	FGameModeEvents::GameModePostLoginEvent.Remove(PostLoginHandle);
	FGameModeEvents::GameModeLogoutEvent.Remove(LogoutHandle);
	if (UGameInstance* GameInstance = GetGameInstance())
	{
		GameInstance->GetTimerManager().ClearTimer(StopTimer);
	}
	Super::Deinitialize();
}

void UEdgegapServerSubsystem::OnPostLogin(AGameModeBase* GameMode, APlayerController* NewPlayer)
{
	GetGameInstance()->GetTimerManager().ClearTimer(StopTimer);
}

void UEdgegapServerSubsystem::OnLogout(AGameModeBase* GameMode, AController* Exiting)
{
	// The leaving controller still counts at this point, so check again once it is gone.
	GetGameInstance()->GetTimerManager().SetTimer(StopTimer, this, &UEdgegapServerSubsystem::CheckEmptyServer, EmptyServerGraceSeconds, false);
}

void UEdgegapServerSubsystem::CheckEmptyServer()
{
	UWorld* World = GetGameInstance()->GetWorld();
	AGameModeBase* GameMode = World ? World->GetAuthGameMode() : nullptr;
	if (GameMode && GameMode->GetNumPlayers() == 0)
	{
		StopDeployment(TEXT("all players left"));
	}
}

void UEdgegapServerSubsystem::StopDeployment(const FString& Reason)
{
	if (bStopRequested)
	{
		return;
	}

	// Injected by Edgegap into every deployment. Never log the token.
	const FString DeleteUrl = FPlatformMisc::GetEnvironmentVariable(TEXT("ARBITRIUM_DELETE_URL"));
	const FString DeleteToken = FPlatformMisc::GetEnvironmentVariable(TEXT("ARBITRIUM_DELETE_TOKEN"));
	if (DeleteUrl.IsEmpty() || DeleteToken.IsEmpty())
	{
		UE_LOG(LogEdgegapServer, Warning, TEXT("Would stop (%s), but ARBITRIUM_DELETE_URL/TOKEN are missing"), *Reason);
		return;
	}

	bStopRequested = true;
	UE_LOG(LogEdgegapServer, Log, TEXT("Stopping deployment: %s"), *Reason);

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(DeleteUrl);
	Request->SetVerb(TEXT("DELETE"));
	Request->SetHeader(TEXT("Authorization"), DeleteToken);
	Request->OnProcessRequestComplete().BindLambda([](FHttpRequestPtr, FHttpResponsePtr Response, bool bConnected)
	{
		const int32 Code = Response.IsValid() ? Response->GetResponseCode() : 0;
		UE_LOG(LogEdgegapServer, Log, TEXT("Self-stop request returned %d"), Code);

		// On success Edgegap sends SIGTERM shortly. If the request failed, exit anyway so the match ends;
		// with restart policy "Never" or "On Crash" a clean exit also ends the deployment.
		if (!bConnected || Code < 200 || Code >= 300)
		{
			FPlatformMisc::RequestExit(false);
		}
	});
	Request->ProcessRequest();
}
```
