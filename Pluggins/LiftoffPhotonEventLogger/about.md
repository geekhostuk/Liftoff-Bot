# Liftoff Photon Event Logger

`LiftoffPhotonEventLogger` is a BepInEx 5 plugin for [Liftoff](https://store.steampowered.com/app/410340/Liftoff_FPV_Drone_Racing/) that captures Photon multiplayer traffic, extracts race telemetry, and provides remote server control over the game session.

## What it does

The plugin registers as a Photon callback target (`IOnEventCallback`, `IInRoomCallbacks`) and serves two main purposes:

1. **Race telemetry & event forwarding** — captures game events and streams them as JSON to a competition server over WebSocket.
2. **Remote session control** — receives commands from the server to change tracks, kick players, and send chat messages.

## Events captured and forwarded

All events are serialised as JSONL and sent to the competition server via the `CompetitionClient` WebSocket connection.

| Event | Source | Description |
|-------|--------|-------------|
| `session_started` | Room join | Plugin version, session ID, room metadata |
| `race_reset` | Race state machine | New race boundary (track change, SGSO, RS reset) |
| `race_end` | Race state machine | All pilots finished or race boundary hit |
| `lap_recorded` | Event 200 / GMS property | Lap number, time (ms/sec), delta vs previous/best |
| `pilot_complete` | RS property ≥ 5 | All lap times, total time, completion reason |
| `checkpoint` | GMS property (regex) | Checkpoint ID, lap index, elapsed time (currently non-functional due to GMS obfuscation — see below) |
| `pilot_active` | Event 201 movement detection | Throttled to 1 per 30s per player, only when drone has moved ≥ 2 units |
| `player_entered` | Photon callback | Actor, nick, user/Steam ID |
| `player_left` | Photon callback | Actor, nick |
| `player_list` | Photon callback | Full player roster sync |
| `chat_message` | Harmony patch on ChatWindowPanel | Actor, user ID, nick, message text |
| `track_catalog` | Server request | Available tracks, races, environments |
| `kick_result` | After kick attempt | Actor, nick, success/failure, reason |
| `command_ack` | After any command | Command ID, status, optional error |

## Remote commands (server → plugin)

The competition server can send JSON commands over the WebSocket. Each command gets a `command_ack` response.

| Command | Description |
|---------|-------------|
| `next_track` | Cycle to next track |
| `set_track` | Change to a specific track/race/environment by ID |
| `update_playlist` | Queue a sequence of tracks, optionally apply immediately |
| `request_catalog` | Return a snapshot of available tracks |
| `send_chat` | Inject a chat message into the game |
| `kick_player` | Remove a player by actor number (uses reflection to invoke `RPCKicked`) |

## Photon Event 201 — Position Telemetry

Event 201 is Liftoff's drone position/movement telemetry, sent at ~10 Hz per player. The plugin uses it to detect whether a player is actively flying (for idle-kick purposes on the server).

**Data structure:**
```
customData = Object[3] {
  int (sequence number),
  null,
  Object[4] {
    int 2001,
    bool,
    null,
    Single[12] {
      [0-3]  throttle / control inputs,
      [4]    position X,
      [5]    position Y,
      [6]    position Z,
      [7-10] quaternion rotation (X, Y, Z, W),
      [11]   elapsed time
    }
  }
}
```

**Key behaviour:**
- Event 201 fires as long as the drone is spawned, even if stationary on the start line.
- The plugin tracks position per actor and only emits `pilot_active` when the drone has moved ≥ 2 units from its last recorded position.
- `pilot_active` is throttled to a maximum of once per 30 seconds per player.

**Other silent events:** Event 226 (room heartbeat/ping) is also suppressed from file logging.

## GMS Property — Obfuscated

The GMS (Game Match State) player property contains race checkpoint and lap data, but property names are obfuscated in current Liftoff versions (garbled strings of quote characters). The regex-based checkpoint extraction (`GmsCheckpointRegex` looking for `RacePlayerCheckpointInfo`) no longer matches. Checkpoint events are effectively non-functional unless the obfuscation changes in a future update.

Lap time extraction from GMS (`Single[]` arrays) still works because it matches the value format rather than property names.

## Race state machine

`RaceStateProjector` manages race boundaries and per-pilot state:

- **New race** triggered by: SGSO property change, track change command, RS reset (≥5 → ≤3), or room start.
- **Lap recording** from Event 200 (Photon raise event) and GMS property merging. Min lap time is enforced (configurable) and a grace window suppresses events after track changes.
- **Pilot completion** when RS crosses into ≥5 or max lap count reached.
- **Pilot reset** when RS decreases during active racing (drone reset).
- Each race gets a unique GUID and sequential ordinal number.

## Chat capture

Uses Harmony to patch `ChatWindowPanel.GenerateUserMessage()`. Captures user ID, username, and message text. Forwarded as `chat_message` events.

## Player identity

`PlayerIdentityStore` maps actor numbers to nicks and Steam user IDs. Updated on player join/leave/property changes. Provides `ResolveNick(actor)` and `TryFindActorByUserId()` lookups.

## Kick mechanism

When the server sends `kick_player`:

1. Checks the plugin is master client and the target player exists
2. Uses reflection to find the `RPCKicked` method in Liftoff's `Assembly-CSharp`
3. Finds a PhotonView with that MonoBehaviour attached
4. Invokes the RPC with constructed parameters targeting the player
5. Reports success/failure via `kick_result` event

## MultiplayerTrackControl

Experimental feature for host-side multiplayer settings:

- Inspects Liftoff's multiplayer UI and runtime objects via reflection
- Applies track, race, environment, and workshop content changes through Liftoff's own setup flow
- Queues and retries deferred changes when the game UI isn't ready
- Supports dry-run mode for safe testing
- Exposes optional debug hotkeys and on-screen controls

## Log files

Per-session log files are created under the plugin folder:

| File | Format | Contents |
|------|--------|----------|
| `photon-events-{timestamp}.log` | Text | All Photon events with raw parameters |
| `photon-state-{timestamp}.log` | Text | State changes (players, room properties) |
| `photon-race-{timestamp}.jsonl` | JSONL | Race events (one JSON object per line) |
| `event-codes/event-code-{N}.log` | Text | Per-event-code logs for protocol inspection |

- Events 201 and 226 are excluded from file logging to save space.
- A background writer thread handles all file I/O off the main Unity thread.
- Logs older than 7 days are automatically deleted on startup.

## Competition server connection

`CompetitionClient` manages the WebSocket connection:

- Background thread for WebSocket I/O (separate from Unity main thread)
- Events queued via `EnqueueEvent()` and drained asynchronously
- Received commands dispatched back to main thread via `SynchronizationContext`
- Auto-reconnects with configurable delay (default 5 seconds)
- Authenticates via `Authorization: Bearer {api_key}` header

**Configuration** (BepInEx config):
- `Competition.Enabled` — enable/disable server connection (default: false)
- `Competition.ServerUrl` — WebSocket URL (default: `ws://localhost:3000/ws/plugin`)
- `Competition.ApiKey` — authentication token
- `Competition.ReconnectDelaySecs` — reconnect delay (1-60, default: 5)
