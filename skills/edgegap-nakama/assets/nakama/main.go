// Nakama Go module: Nakama keeps accounts, matchmaking and leaderboards, and
// every match runs on its own dedicated server that Nakama starts on Edgegap
// through the Edgegap Fleet Manager for Nakama (github.com/edgegap/nakama-edgegap).
//
// From edgegap/backend-game-sample-godot-nakama-fishgame (nakama/main.go), verified end to end on Edgegap
// with Nakama 3.39 and nakama-edgegap 20d849e. Updated for Nakama 3.42 and nakama-edgegap 902c9aa, where
// NewEdgegapFleetManager takes an EdgegapConfig instead of the initializer and no longer reads the
// runtime env itself (edgegapConfigFromEnv below does). Adapt the marked lines.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/edgegap/nakama-edgegap/pkg/fleetmanager"
	"github.com/heroiclabs/nakama-common/runtime"
)

const (
	// ADAPT: the game's leaderboard and the storage collection that remembers
	// which instances already reported a result.
	leaderboardWins   = "wins"
	resultsCollection = "match_results"

	// Notification codes the game client handles. Same codes as the plugin's
	// own instance_create RPC and the Unity plugin.
	notificationConnectionInfo = 111
	notificationCreateTimeout  = 112
	notificationCreateFailed   = 113
)

func InitModule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	initStart := time.Now()

	cfg, err := edgegapConfigFromEnv(ctx)
	if err != nil {
		logger.WithField("error", err).Error("failed to read Edgegap configuration")
		return err
	}
	// Validates cfg, including that EDGEGAP_APPLICATION exists on Edgegap.
	efm, err := fleetmanager.NewEdgegapFleetManager(ctx, logger, db, nk, cfg)
	if err != nil {
		logger.WithField("error", err).Error("failed to create Edgegap fleet manager")
		return err
	}
	// One Fleet Manager, default namespace: RPC IDs and storage names stay as in
	// earlier plugin versions. A second Edgegap application needs its own
	// EdgegapConfig and RegisterFleetManagerByName (references/nakama-module.md §1).
	if err = initializer.RegisterFleetManager(efm); err != nil {
		logger.WithField("error", err).Error("failed to register Edgegap fleet manager")
		return err
	}

	// ADAPT: register the hook for every auth method the game really uses. It
	// stores the player's public IP ("PlayerIp" in account metadata), which the
	// Fleet Manager sends to Edgegap to place the server near the players.
	// Without it, Create from the matchmaker hook fails: there is no caller IP
	// to fall back on. The plugin's hooks are fleetmanager.OnAuthenticateUpdate<X>
	// for X = Custom, Device, Email, Apple, Facebook, FacebookInstantInstance,
	// Google, Steam, and InstanceCenter, which is Game Center: register that one
	// with RegisterAfterAuthenticateGameCenter.
	if err = initializer.RegisterAfterAuthenticateEmail(fleetmanager.OnAuthenticateUpdateEmail); err != nil {
		logger.WithField("error", err).Error("failed to register AfterAuthenticateEmail")
		return err
	}

	if err = initializer.RegisterMatchmakerMatched(onMatchmakerMatched); err != nil {
		logger.WithField("error", err).Error("failed to register MatchmakerMatched")
		return err
	}

	// Authoritative: clients can't write to it, only the game server through
	// report_match_result (server-to-server, with the http_key).
	if err = nk.LeaderboardCreate(ctx, leaderboardWins, true, "desc", "incr", "", nil, true); err != nil {
		logger.WithField("error", err).Error("failed to create leaderboard")
		return err
	}
	if err = initializer.RegisterRpc("report_match_result", rpcReportMatchResult); err != nil {
		logger.WithField("error", err).Error("failed to register report_match_result")
		return err
	}

	logger.Info("Edgegap module loaded in '%s'", time.Since(initStart).String())
	return nil
}

// onMatchmakerMatched starts one Edgegap server for the matched players and,
// once that server sends READY, notifies each player with its address.
func onMatchmakerMatched(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, entries []runtime.MatchmakerEntry) (string, error) {
	userIds := make([]string, 0, len(entries))
	for _, entry := range entries {
		userIds = append(userIds, entry.GetPresence().GetUserId())
	}
	portName := runtimeEnv(ctx)["EDGEGAP_PORT_NAME"]

	notify := func(code int, subject string, content map[string]any) {
		for _, userId := range userIds {
			if err := nk.NotificationSend(ctx, userId, subject, content, code, "", false); err != nil {
				logger.WithField("error", err.Error()).Error("failed to send notification")
			}
		}
	}

	// Runs when the game server sends READY (CreateSuccess), or when the
	// deployment fails (Edgegap error webhook, or a failed Create).
	callback := func(status runtime.FmCreateStatus, instanceInfo *runtime.InstanceInfo, _ []*runtime.SessionInfo, _ map[string]any, createErr error) {
		switch status {
		case runtime.CreateSuccess:
			ip, dns, port := connectionInfo(instanceInfo, portName)
			if ip == "" || port == 0 {
				logger.Error("Edgegap instance %s is ready but has no address", instanceInfo.Id)
				notify(notificationCreateFailed, "create-failed", map[string]any{})
				return
			}
			logger.Info("Edgegap instance %s ready at %s:%d for %v", instanceInfo.Id, ip, port, userIds)
			notify(notificationConnectionInfo, "connection-info", map[string]any{
				"IpAddress":  ip,
				"DnsName":    dns,
				"Port":       port,
				"InstanceId": instanceInfo.Id,
			})
		case runtime.CreateTimeout:
			logger.WithField("error", errString(createErr)).Error("timed out creating Edgegap instance")
			notify(notificationCreateTimeout, "create-timeout", map[string]any{})
		default:
			logger.WithField("error", errString(createErr)).Error("failed to create Edgegap instance")
			notify(notificationCreateFailed, "create-failed", map[string]any{})
		}
	}

	// The game server only lets these users in. Anything in metadata reaches
	// the server as NAKAMA_INSTANCE_METADATA (JSON). "edgegap_version" here
	// would override the deployed app version for this match only.
	metadata := map[string]any{"user_ids": userIds}

	// Six arguments: ctx, maxPlayers, userIds, latencies (nil: Edgegap places
	// the server from the players' stored IPs), metadata, callback.
	if _, err := nk.GetFleetManager().Create(ctx, len(userIds), userIds, nil, metadata, callback); err != nil {
		// The plugin has already invoked the callback with an error status,
		// so the players got create-failed; just log.
		logger.WithField("error", err.Error()).Error("failed to request Edgegap instance")
	}

	// No Nakama match: the game runs on the Edgegap server. A non-empty return
	// value is a Nakama match ID that clients would be told to join.
	return "", nil
}

// connectionInfo returns the server address. The READY callback can run before
// Edgegap's ready webhook fills in ConnectionInfo, so the game server also sends
// its own address in the READY metadata ("game_server", same as the Unity plugin).
func connectionInfo(instance *runtime.InstanceInfo, portName string) (string, string, int) {
	if ci := instance.ConnectionInfo; ci != nil && ci.IpAddress != "" && ci.Port != 0 {
		return ci.IpAddress, ci.DnsName, ci.Port
	}
	gameServer, _ := instance.Metadata["game_server"].(map[string]any)
	ip, _ := gameServer["ARBITRIUM_PUBLIC_IP"].(string)
	mapping, _ := gameServer["ARBITRIUM_PORTS_MAPPING"].(map[string]any)
	ports, _ := mapping["ports"].(map[string]any)
	port, _ := ports[portName].(map[string]any)
	external, _ := port["external"].(float64)
	return ip, instance.Id + ".pr.edgegap.net", int(external)
}

type matchResult struct {
	InstanceId   string   `json:"instance_id"`
	WinnerUserId string   `json:"winner_user_id"`
	UserIds      []string `json:"user_ids"`
}

// rpcReportMatchResult is called by the game server (server-to-server, with
// Nakama's http_key) to add a win for the match winner.
func rpcReportMatchResult(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	// A call with a player's session carries a user ID; an http_key call doesn't.
	if userId, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string); userId != "" {
		return "", runtime.NewError("only game servers may report results", 7) // PERMISSION_DENIED
	}

	var result matchResult
	if err := json.Unmarshal([]byte(payload), &result); err != nil || result.InstanceId == "" || result.WinnerUserId == "" {
		return "", runtime.NewError("expects instance_id and winner_user_id", 3)
	}

	instance, err := nk.GetFleetManager().Get(ctx, result.InstanceId)
	if err != nil || instance == nil {
		return "", runtime.NewError("unknown instance", 5)
	}
	if !slices.Contains(metadataUserIds(instance.Metadata), result.WinnerUserId) {
		return "", runtime.NewError("winner was not matched to this instance", 3)
	}

	// Count each instance once, even if the server retries: Version "*" only
	// writes if the object doesn't exist yet. Permissions 0: no client access.
	if _, err := nk.StorageWrite(ctx, []*runtime.StorageWrite{{
		Collection:      resultsCollection,
		Key:             result.InstanceId,
		Value:           payload,
		Version:         "*",
		PermissionRead:  0,
		PermissionWrite: 0,
	}}); err != nil {
		return "", runtime.NewError("result already reported for this instance", 6) // ALREADY_EXISTS
	}

	users, err := nk.UsersGetId(ctx, []string{result.WinnerUserId}, nil)
	if err != nil || len(users) == 0 {
		return "", runtime.NewError("winner not found", 5)
	}
	if _, err := nk.LeaderboardRecordWrite(ctx, leaderboardWins, result.WinnerUserId, users[0].Username, 1, 0, nil, nil); err != nil {
		logger.WithField("error", err.Error()).Error("failed to write leaderboard record")
		return "", runtime.NewError("failed to record the win", 13)
	}

	logger.Info("Instance %s: %s won", result.InstanceId, users[0].Username)
	return `{"ok":true}`, nil
}

// metadataUserIds reads "user_ids" back from instance metadata, which comes
// out of storage as []any (or []string before it was stored).
func metadataUserIds(metadata map[string]any) []string {
	raw, _ := metadata["user_ids"].([]any)
	userIds := make([]string, 0, len(raw))
	for _, id := range raw {
		if s, ok := id.(string); ok {
			userIds = append(userIds, s)
		}
	}
	if len(userIds) == 0 {
		if ids, ok := metadata["user_ids"].([]string); ok {
			return ids
		}
	}
	return userIds
}

func runtimeEnv(ctx context.Context) map[string]string {
	env, _ := ctx.Value(runtime.RUNTIME_CTX_ENV).(map[string]string)
	return env
}

// edgegapConfigFromEnv builds the Fleet Manager configuration from Nakama's
// runtime env (--runtime.env, or runtime.env in the YAML config), with the same
// variable names the plugin read itself before 3.42. Same logic as
// edgegapConfigFromEnv in the plugin's own main.go at 902c9aa.
func edgegapConfigFromEnv(ctx context.Context) (fleetmanager.EdgegapConfig, error) {
	env := runtimeEnv(ctx)

	required := make(map[string]string, 5)
	for _, key := range []string{"EDGEGAP_API_URL", "EDGEGAP_API_TOKEN", "EDGEGAP_APPLICATION", "EDGEGAP_PORT_NAME", "NAKAMA_ACCESS_URL"} {
		value, ok := env[key]
		if !ok {
			return fleetmanager.EdgegapConfig{}, runtime.NewError(key+" not found in environment", 3)
		}
		required[key] = value
	}

	cfg := fleetmanager.NewEdgegapConfig(required["EDGEGAP_API_URL"], required["EDGEGAP_API_TOKEN"], required["EDGEGAP_APPLICATION"], required["EDGEGAP_PORT_NAME"], required["NAKAMA_ACCESS_URL"])

	// Only seeds the stored version the first time (references/infra.md §4).
	cfg.InitialVersion = env["INITIAL_EDGEGAP_VERSION"]
	if cfg.InitialVersion == "" {
		cfg.InitialVersion = env["EDGEGAP_VERSION"] // older name
	}

	// Optional durations keep their defaults (15m, 1m, 30s) when unset; an empty
	// polling or cleanup interval disables that worker.
	durations := []struct {
		key        string
		value      *time.Duration
		emptyValue bool
	}{
		{"EDGEGAP_POLLING_INTERVAL", &cfg.PollingInterval, true},
		{"NAKAMA_CLEANUP_INTERVAL", &cfg.CleanupInterval, true},
		{"NAKAMA_RESERVATION_MAX_DURATION", &cfg.ReservationMaxDuration, false},
	}
	for _, d := range durations {
		value, ok := env[d.key]
		if !ok {
			continue
		}
		if d.emptyValue && strings.TrimSpace(value) == "" {
			*d.value = 0
			continue
		}
		parsed, err := time.ParseDuration(value)
		if err != nil {
			return fleetmanager.EdgegapConfig{}, fmt.Errorf("invalid %s: %s", d.key, value)
		}
		*d.value = parsed
	}

	return cfg, nil
}

func errString(err error) string {
	if err == nil {
		return "unknown error"
	}
	return err.Error()
}
