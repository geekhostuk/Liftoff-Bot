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

The dashboard is divided into eight main sections, each controlling a different aspect of the lobby.

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

The playlist runner is a server-side state machine (`playlistRunner.js`) that automatically advances through a playlist's tracks on a timer.

**Controls:**
- **Start** — begin running a playlist with a configurable interval in minutes and an optional start position (`POST /api/admin/playlists/:id/start`)
- **Stop** — halt the current playlist (`POST /api/admin/playlist/stop`)
- **Skip** — immediately advance to the next track (`POST /api/admin/playlist/skip`)

**Status bar** (visible when a playlist is running):
- Current playlist name
- Current track position (e.g., "Track 3 of 8")
- Countdown timer showing time until next track change

**How it works:**
1. When started, the runner loads all tracks for the playlist from the database.
2. It sets the first track (or the specified start position) via the plugin.
3. A timer runs for the configured interval. When it fires, the runner advances to the next track and resets the timer.
4. When the last track is reached, the playlist wraps around to the beginning.
5. Track changes trigger any configured chat templates (e.g., announcing the new track).
6. The runner broadcasts its state to all connected admin WebSocket clients so the dashboard stays in sync.

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

### 5. Competition Management

Create and manage structured weekly competitions with automatic scoring.

#### Competitions

- **Create** — name a new competition/season (`POST /api/admin/competition`)
- **List** — view all competitions (`GET /api/admin/competitions`)
- **Archive** — mark a competition as archived (`POST /api/admin/competition/:id/archive`)

#### Weeks

Each competition is divided into weekly periods that progress through a lifecycle: `scheduled` &rarr; `active` &rarr; `finalised` &rarr; `archived`.

- **Generate weeks** — specify a start date and number of weeks. The system auto-aligns to Monday boundaries and creates all week records (`POST /api/admin/competition/:id/weeks`)
- **Edit week** — change start/end dates or manually change status (`PUT /api/admin/competition/week/:id`)
- **Delete week** — remove a week (`DELETE /api/admin/competition/week/:id`)
- **Recalculate points** — re-run the scoring engine for a specific week (`POST /api/admin/competition/recalculate/:weekId`)

#### Playlist Assignment

Each week can have multiple playlists assigned to it. Tracks from all playlists are pooled and shuffled into a fair daily schedule.

- **Assign playlist** — add a playlist to a week (`POST /api/admin/competition/week/:id/playlists`)
- **Remove playlist** — unassign a playlist from a week (`DELETE /api/admin/competition/week/:weekId/playlists/:wpId`)
- **Reorder** — change playlist order (`POST /api/admin/competition/week/:weekId/playlists/:wpId/move`)
- **Track interval** — set per-week (e.g. 15 minutes per track), configured via week edit form (`PUT /api/admin/competition/week/:id` with `interval_ms`)
- **Regenerate schedule** — clear cached schedules and regenerate on next tick (`POST /api/admin/competition/week/:id/regenerate-schedule`). Use after modifying playlists on an active week.

#### Interleaved Schedule Generation

When a week is active, the competition runner generates a daily schedule:

1. **Pool all tracks** from every playlist assigned to the week
2. **Shuffle** using a deterministic seeded PRNG (seed = `weekId × 1000 + dayNumber`) — different order each day, reproducible on reboot
3. **Build rounds** — each round contains every track exactly once (fair distribution)
4. **Repeat rounds** to fill 24 hours
5. **Persist** the schedule to the `week_schedules` database table

This means every track gets equal play time per day regardless of which playlist it belongs to.

#### Competition Runner

The competition runner (`competitionRunner.js`) is a server-side lifecycle manager that automates the entire weekly competition flow.

**Controls:**
- **View state** — see the active week, current day number, and auto-management status (`GET /api/admin/competition/runner/state`)
- **Toggle auto-management** — enable or disable automatic week activation and schedule rotation (`POST /api/admin/competition/runner/auto`)

**How it works:**
1. The runner watches for scheduled weeks whose start time has arrived.
2. When a week becomes active, it generates a daily interleaved schedule from all assigned playlists and starts playing it.
3. Each track plays for the week's configured interval, then advances to the next track in the shuffled schedule.
4. On day rollover, a new shuffled schedule is generated for the new day.
5. When a week's end time is reached, the runner finalises it (triggering batch scoring) and activates the next scheduled week.
6. **Reboot resilience** — schedules are persisted in the database. After a restart, the runner loads the current day's schedule and calculates the correct position from elapsed time.
7. Schedules are automatically invalidated when playlists are added, removed, or the track interval changes.

**Status bar** (visible when a competition is running):
- Active week number
- Current day number
- Number of playlists
- Whether auto-management is on or off

### 6. Status & Monitoring

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
| `playlist_state` | Playlist runner status update |
| `competition_state` | Competition runner status update |
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

### Competitions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/competition` | Create a new competition |
| `GET` | `/competitions` | List all competitions |
| `POST` | `/competition/:id/archive` | Archive a competition |
| `POST` | `/competition/:id/weeks` | Generate weeks for a competition |
| `GET` | `/competition/:id/weeks` | Get weeks for a competition |
| `PUT` | `/competition/week/:id` | Update a week (dates, status) |
| `DELETE` | `/competition/week/:id` | Delete a week |
| `GET` | `/competition/week/:id/playlists` | Get playlists assigned to a week |
| `POST` | `/competition/week/:id/playlists` | Assign a playlist to a week |
| `DELETE` | `/competition/week/:weekId/playlists/:wpId` | Remove a playlist from a week |
| `POST` | `/competition/week/:weekId/playlists/:wpId/move` | Reorder a playlist in a week |
| `POST` | `/competition/week/:id/regenerate-schedule` | Clear cached schedules (regenerates on next tick) |
| `POST` | `/competition/recalculate/:weekId` | Recalculate points for a week |
| `GET` | `/competition/runner/state` | Get competition runner state |
| `POST` | `/competition/runner/auto` | Toggle auto-management |

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
| `web/admin/src/pages/Chat.jsx` | Original chat page |
| `web/admin/src/pages/ChatBeta.jsx` | Redesigned chat page (Beta) |
| `web/admin/src/pages/AutoMessages.jsx` | Dedicated auto messages page (Beta) |
| `web/admin/src/pages/Competition.jsx` | Competition management page |
| `Server/src/api/routes/admin.js` | Admin REST API endpoint handlers |
| `Server/src/pluginSocket.js` | Plugin WebSocket server, template firing, variable enrichment |
| `Server/src/playlistRunner.js` | Playlist auto-advance state machine |
| `Server/src/competitionRunner.js` | Weekly competition lifecycle, interleaved schedule generation |
| `Server/src/competitionScoring.js` | Points engine (real-time + batch) |
| `Server/src/idleKick.js` | Idle detection, warnings, and auto-kick |
| `Server/src/broadcast.js` | Event dispatch to WebSocket clients |
| `Server/src/liveSocket.js` | WebSocket server setup (admin + public) |
| `Server/src/auth.js` | Password hashing and session management |
| `Server/src/db/connection.js` | PostgreSQL connection pool and migration runner |
| `Server/src/db/competition.js` | Competition, standings, schedule, and runner state queries |
