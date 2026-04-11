# Admin Dashboard

The admin dashboard (`/admin/`) is a React SPA that gives event organisers full remote control over a Liftoff multiplayer lobby. It connects to the server via both REST API calls and a persistent WebSocket (`/ws/admin`) for real-time updates.

---

## Authentication

- **Cookie-based sessions** — logging in sets an `httpOnly` cookie (`liftoff_admin`) that authenticates all subsequent requests and the WebSocket connection.
- **Multi-user support** — each admin has their own username and password, stored as bcrypt hashes in the `admin_users` PostgreSQL table.
- **Legacy token access** — the `ADMIN_TOKEN` environment variable can still be used for API/script access via a Bearer header.
- **Rate limiting** — 60 requests/minute for general endpoints, 10 requests/minute for sensitive operations (login, user creation).

Admin users are created either via `ADMIN_USER`/`ADMIN_PASS` environment variables on first start, or via the CLI tool (`node src/cli/createUser.js <username> <password>`).

---

## Dashboard Sections

The dashboard provides the following core sections (described below), plus dedicated pages for Tags, Tracks, Track Manager, Scoring, Competitions, User Management, Idle Kick, Bot Remote, and Rooms.

### 1. Players Online

Real-time view of every pilot currently connected to the lobby.

| Column | Description |
|--------|-------------|
| Pilot Name | The player's in-game nickname |
| Actor ID | Photon network actor number |
| Idle Time | How long since last activity, colour-coded by severity |
| Actions | Kick button and idle-kick whitelist toggle |

**How it works:**
- The server tracks player activity (checkpoints, laps, race completions, resets, chat messages, race starts/ends).
- The player list updates in real-time via WebSocket — joins, leaves, and idle time changes appear instantly.
- **Kick** sends a `POST /api/admin/players/kick` request with the player's actor number. The server relays this to the plugin, which removes the player from the Photon room.
- **Whitelist toggle** adds or removes a player from the idle-kick whitelist (`POST/DELETE /api/admin/idle-kick/whitelist`). Whitelisted players are never auto-kicked for inactivity.
- `JMT_Bot` (the host account) is always hidden from the list and immune to idle kick.

**Idle time colour coding:**
- Green — active (under 3 minutes idle)
- Yellow — approaching warning threshold
- Red — at or past warning threshold, about to be kicked

### 2. Track Control

Manual control over which track is loaded in the lobby.

**Controls:**
- **Environment dropdown** — select the game environment (e.g., "Countryside", "Industrial")
- **Track dropdown** — select a specific track within the chosen environment
- **Game mode dropdown** — select the race type (e.g., "Single Class", "MultiGP")
- **Set Track button** — immediately loads the selected track (`POST /api/admin/track/set`)
- **Next Track button** — advances to the next track in the current sequence (`POST /api/admin/track/next`)
- **Refresh Catalog button** — requests the plugin to read the in-game track list and send it to the server (`POST /api/admin/catalog/refresh`)

**How it works:**
- The track catalog is fetched from the server on page load. It contains all environments, tracks, and game modes that the plugin has discovered from the game.
- When you set a track, the server sends a `set_track` command to the plugin via WebSocket. The plugin manipulates the game's UI to navigate to the correct environment, track, and game mode.
- The catalog age and stats (number of environments, tracks, game modes) are shown in the status bar so you know how fresh the data is.

### 3. Playlists

Create and manage ordered lists of tracks that can be run automatically on a timer.

#### Playlist Management

- **Create** — name a new playlist (`POST /api/admin/playlists`)
- **Rename** — change a playlist's name (`PUT /api/admin/playlists/:id`)
- **Delete** — remove a playlist and all its tracks (`DELETE /api/admin/playlists/:id`)

#### Track Management (within a playlist)

- **Add track** — select environment, track, and game mode, then add it to the playlist (`POST /api/admin/playlists/:id/tracks`). An optional `workshop_id` field supports Steam Workshop tracks.
- **Reorder** — move tracks up or down within the playlist (`POST /api/admin/playlists/tracks/:tid/move`)
- **Remove** — delete a track from the playlist (`DELETE /api/admin/playlists/tracks/:tid`)

#### Playlist Runner

The playlist runner is managed by the Track Overseer (`trackOverseer.js`), which automatically advances through a playlist's tracks on a timer.

**Controls:**
- **Start** — begin running a playlist with a configurable interval in minutes and an optional start position (`POST /api/admin/playlists/:id/start`)
- **Stop** — halt the current playlist (`POST /api/admin/playlist/stop`)
- **Skip** — immediately advance to the next track (`POST /api/admin/playlist/skip`)

**Status bar** (visible when a playlist is running):
- Current playlist name
- Current track position (e.g., "Track 3 of 8")
- Countdown timer showing time until next track change

**How it works:**
1. When started, the overseer loads all tracks for the playlist from the database.
2. It sets the first track (or the specified start position) via the plugin.
3. A timer runs for the configured interval. When it fires, the overseer advances to the next track and resets the timer.
4. When the last track is reached, the playlist wraps around to the beginning.
5. Track changes trigger any configured chat templates (e.g., announcing the new track).
6. The overseer broadcasts its state to all connected admin WebSocket clients so the dashboard stays in sync.

### 4. Chat

Send messages to players and configure automated messaging.

#### Manual Chat

- Type a message and click **Send** to push it into the game chat immediately (`POST /api/admin/chat/send`).
- The message appears in-game as if sent by the host.

#### Chat Log

- Incoming chat messages from all players are displayed in real-time via WebSocket.
- Each message shows the player's name and a timestamp.

#### Automated Chat Templates

Templates are pre-configured messages that fire automatically when specific events occur.

**Creating a template:**
- **Trigger** — the event that fires the template:
  - `track_change` — when the track changes
  - `race_start` — when a race begins
  - `race_end` — when a race finishes
  - `player_joined` — when any player enters the lobby
  - `player_new` — when a first-time player enters (no race history)
  - `player_returned` — when a returning player enters (has race history)
  - `interval` — fires on a repeating timer (every `interval_ms` milliseconds, minimum 10 seconds), only when players are online
- **Template text** — the message body, which can include variables
- **Delay** — milliseconds after the event to send the message
  - Positive values: fire after the event (e.g., `5000` = 5 seconds after)
  - Negative values: fire before the event (e.g., `-120000` = 2 minutes before the next track change, useful for warnings)
- **Enabled toggle** — enable or disable without deleting

**Template variables:**

| Variable | Description | Available on |
|----------|-------------|--------------|
| `{env}` | Environment name | `track_change` |
| `{track}` | Track name | `track_change` |
| `{race}` | Game mode | `track_change` |
| `{mins}` | Minutes until next change | `track_change` (negative delay) |
| `{race_id}` | Race ID (first 8 chars) | `race_start` |
| `{winner}` | Winner's nickname | `race_end` |
| `{time}` | Winner's best time | `race_end` |
| `{nick}` | Player nickname | `player_joined`, `player_new`, `player_returned` |
| `{1st}` | 1st place pilot (weekly standings) | All triggers |
| `{2nd}` | 2nd place pilot (weekly standings) | All triggers |
| `{3rd}` | 3rd place pilot (weekly standings) | All triggers |
| `{playlist}` | Current playlist name (source playlist during competition) | All triggers |
| `{player_points}` | Player's weekly competition points | Player triggers |
| `{player_position}` | Player's weekly competition rank (or "unranked") | Player triggers |

**API endpoints:**
- `GET /api/admin/chat/templates` — list all templates
- `POST /api/admin/chat/templates` — create a template
- `PUT /api/admin/chat/templates/:id` — update a template
- `DELETE /api/admin/chat/templates/:id` — delete a template
- `GET /api/admin/chat/template-variables` — list all available variables with descriptions
- `POST /api/admin/chat/template-preview` — resolve a template against live data (without sending)

### 4a. Chat Beta

Redesigned chat interface available alongside the original.

- **Filterable chat log** — search/filter messages by nick or content in real-time
- **Enhanced send message** — textarea with character counter (255-char in-game limit), colour-coded warnings at 200/240/255 chars
- **Variable insertion chips** — clickable buttons that insert `{variable}` at cursor position
- **Live preview** — resolve the message against current server data before sending
- Variables fetched dynamically from the template-variables API

### 4b. Auto Messages Beta

Dedicated automated message management page, separate from the chat log.

- **Template list** — DataTable with trigger, message, delay (human-readable), enabled toggle, edit/test/delete actions
- **Add/Edit form** — trigger dropdown, template textarea, delay input, enabled checkbox
- **Variable reference panel** — collapsible section showing available variables filtered by selected trigger, clickable to insert
- **Live preview** — debounced preview showing resolved text and character count with colour-coded limit indicator
- **Test button** — preview any existing template against live data without sending

### 5. Track Overseer

Central control panel for automated track rotation, powered by the Track Overseer (`trackOverseer.js`).

#### Status Display

The overseer status bar shows:
- **Mode** — the current rotation mode: `playlist`, `tag`, or `idle` (stopped)
- **Current track** — the track currently loaded in the lobby
- **Time remaining** — countdown until the next automatic track change

#### Playlist Mode

Run an ordered playlist of tracks on a timer.

- **Select a playlist** — choose from existing playlists
- **Set interval** — configure the rotation interval in minutes
- **Start** — begin playlist rotation (`POST /api/admin/overseer/start-playlist`)

The overseer cycles through the playlist's tracks sequentially, wrapping to the beginning after the last track.

#### Tag Mode

Run a random selection of tracks filtered by tags on a timer.

- **Select tags** — choose one or more tags to filter the track pool
- **Set interval** — configure the rotation interval in minutes
- **Start** — begin tag-based rotation (`POST /api/admin/overseer/start-tags`)

The overseer picks a random track matching the selected tags each time the interval fires.

#### Track Queue

Admins can manually queue tracks that take priority over normal rotation.

- **Add to queue** — select a track and add it to the FIFO queue (`POST /api/admin/queue`)
- **Reorder** — move a queued track up or down (`POST /api/admin/queue/:id/move`)
- **Remove** — delete a single track from the queue (`DELETE /api/admin/queue/:id`)
- **Clear** — remove all tracks from the queue (`DELETE /api/admin/queue`)

When the current track's interval expires, the overseer checks the queue first. If a queued track exists, it plays next (FIFO order) before resuming normal rotation.

#### Upcoming Tracks

A preview of the next tracks in the rotation, including any queued tracks at the top (`GET /api/admin/tracks/upcoming`).

#### Track History

A table showing recently played tracks (`GET /api/admin/tracks/history`):

| Column | Description |
|--------|-------------|
| Track | Track name |
| Environment | Game environment |
| Source | How the track was selected (playlist, tag, queue, manual) |
| Skip Count | Number of skip votes received |
| Extend Count | Number of extend votes received |
| Timestamps | When the track was loaded and unloaded |

#### Controls

- **Skip** — immediately advance to the next track (`POST /api/admin/overseer/skip`)
- **Extend** — add 5 minutes to the current track's remaining time (`POST /api/admin/overseer/extend`)
- **Skip to Index** — jump to a specific position in the upcoming tracks list (`POST /api/admin/overseer/skip-to-index`)
- **Stop** — halt automatic rotation (`POST /api/admin/overseer/stop`)

### 6. Rooms

Manage logical rooms that group bots together with independent services.

- **Create room** — name a new room and configure its scoring mode
- **Scoring mode** — controls how races in the room feed into competitions:
  - `global` — room feeds into the global competition only
  - `room` — room has its own isolated competition
  - `both` — room scores into both global and room-specific competitions
- **Bot assignment** — assign bots to rooms; each bot belongs to exactly one room
- **Room selector** — the Overseer and other controls use a room dropdown to scope operations to a specific room
- **Default room** — a default room is auto-created on first start for backward compatibility; all existing bots are assigned to it

### 7. Status & Monitoring

The dashboard header displays persistent status indicators:

- **Plugin connection** — green dot when the BepInEx plugin is connected, red when disconnected
- **WebSocket status** — indicates the admin client's real-time connection health
- **Catalog stats** — number of environments, tracks, and game modes in the catalog, plus how recently the catalog was refreshed
- **Logout button** — ends the admin session

---

## WebSocket Communication

The admin dashboard maintains a persistent WebSocket connection to `/ws/admin`.

**Authentication:** The connection is authenticated using the same `httpOnly` cookie set during login. Legacy token authentication via query parameter is also supported.

**Keepalive:** The server sends ping frames every 20 seconds to prevent connection dropout through proxies and load balancers.

**Events received by the admin client:**

| Event | Description |
|-------|-------------|
| `player_entered` | A player joined the lobby |
| `player_left` | A player left the lobby |
| `chat_received` | A chat message was sent in-game |
| `race_start` | A race has begun |
| `race_end` | A race has finished |
| `lap_recorded` | A lap was completed |
| `track_changed` | The track was changed |
| `overseer_state` | Track Overseer status update |
| `idle_update` | Player idle time changes |
| `player_list` | Full player list snapshot |

The client-side JavaScript (`admin.js`) listens for these events and updates the relevant UI sections in real-time without requiring page refreshes.

---

## API Endpoint Reference

All admin endpoints are prefixed with `/api/admin/` and require authentication.

### Track Control
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/track/set` | Set a specific track (env, track, game mode) |
| `POST` | `/track/next` | Advance to the next track |
| `POST` | `/catalog/refresh` | Request catalog refresh from plugin |

### Players
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/players/kick` | Kick a player by actor number |
| `GET` | `/idle-kick/status` | Get idle status for all players |
| `POST` | `/idle-kick/whitelist` | Add a player to the idle-kick whitelist |
| `DELETE` | `/idle-kick/whitelist` | Remove a player from the whitelist |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/chat/send` | Send a chat message to the game |
| `GET` | `/chat/templates` | List all chat templates |
| `POST` | `/chat/templates` | Create a new template |
| `PUT` | `/chat/templates/:id` | Update a template |
| `DELETE` | `/chat/templates/:id` | Delete a template |
| `GET` | `/chat/template-variables` | List available template variables with descriptions |
| `POST` | `/chat/template-preview` | Resolve a template against live data (without sending) |

### Playlists
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/playlists` | List all playlists |
| `POST` | `/playlists` | Create a new playlist |
| `PUT` | `/playlists/:id` | Rename a playlist |
| `DELETE` | `/playlists/:id` | Delete a playlist and its tracks |
| `GET` | `/playlists/:id/tracks` | Get tracks in a playlist |
| `POST` | `/playlists/:id/tracks` | Add a track to a playlist |
| `DELETE` | `/playlists/tracks/:tid` | Remove a track from a playlist |
| `POST` | `/playlists/tracks/:tid/move` | Reorder a track (up/down) |
| `POST` | `/playlists/:id/start` | Start running a playlist |
| `POST` | `/playlist/stop` | Stop the running playlist |
| `POST` | `/playlist/skip` | Skip to the next track |
| `GET` | `/playlist/state` | Get playlist runner state |

### Track Overseer
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/overseer/state` | Get current overseer state (mode, track, time remaining) |
| `POST` | `/overseer/start-playlist` | Start playlist rotation (playlist ID, interval) |
| `POST` | `/overseer/start-tags` | Start tag-based rotation (tag IDs, interval) |
| `POST` | `/overseer/stop` | Stop automatic rotation |
| `POST` | `/overseer/skip` | Skip to the next track |
| `POST` | `/overseer/extend` | Extend current track by 5 minutes |
| `POST` | `/overseer/skip-to-index` | Jump to a specific position in upcoming tracks |

### Queue
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/queue` | List all queued tracks |
| `POST` | `/queue` | Add a track to the queue |
| `DELETE` | `/queue/:id` | Remove a track from the queue |
| `POST` | `/queue/:id/move` | Reorder a queued track |
| `DELETE` | `/queue` | Clear the entire queue |

### Tracks
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tracks/upcoming` | Preview upcoming tracks in the rotation |
| `GET` | `/tracks/history` | Get recently played track history |

### Scoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/scoring/recalculate/:weekId` | Recalculate points for a week |
| `GET` | `/scoring/current-week` | Get current scoring week |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users` | List all admin users |
| `POST` | `/users` | Create a new admin user |
| `DELETE` | `/users/:id` | Delete an admin user |

---

## Key Source Files

| File | Purpose |
|------|---------|
| `web/admin/src/pages/Dashboard.jsx` | Admin dashboard home page |
| `web/admin/src/pages/Chat.jsx` | Chat page with filterable log, character counter, variable chips |
| `web/admin/src/pages/AutoMessages.jsx` | Automated message template management |
| `web/admin/src/pages/Overseer.jsx` | Track Overseer management page (room-aware) |
| `web/admin/src/pages/Rooms.jsx` | Room management — create, configure, assign bots |
| `Server/src/api/routes/admin.js` | Admin REST API endpoint handlers (~1,210 lines) |
| `Server/src/RoomManager.js` | Room lifecycle, bot-to-room assignment, per-room contexts |
| `Server/src/RoomState.js` | Per-room in-memory state container |
| `Server/src/pluginSocket.js` | Plugin WebSocket server, template firing, variable enrichment |
| `Server/src/trackOverseer.js` | Backward-compatible facade → default room's TrackOverseerInstance |
| `Server/src/TrackOverseerInstance.js` | Per-room track rotation (playlist, tag, queue modes) |
| `Server/src/intervalMessages.js` | Per-room interval-based auto chat templates |
| `Server/src/db/trackOverseer.js` | Track Overseer database queries |
| `Server/src/db/rooms.js` | Room CRUD and bot-to-room assignment |
| `Server/src/competitionScoring.js` | Points engine (real-time + batch, room-aware) |
| `Server/src/idleKick.js` | Idle detection, warnings, and auto-kick |
| `Server/src/broadcast.js` | Event dispatch to WebSocket clients |
| `Server/src/liveSocket.js` | WebSocket server setup (admin + public) |
| `Server/src/auth.js` | Password hashing and session management |
| `Server/src/db/connection.js` | PostgreSQL connection pool and migration runner |
| `Server/src/db/competition.js` | Competition and standings queries |
