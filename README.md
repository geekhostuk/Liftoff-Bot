# Liftoff Competition

Competition management platform for Liftoff FPV Simulator. Remotely control your lobby — change tracks, kick players, run playlists with scheduled rotations, tag tracks by category and run random tag-based rotations, queue tracks for upcoming play, and let pilots vote to skip, extend, or choose a track category. Always-on weekly scoring with automatic league tables. Includes a Node.js backend, live spectator view, competition page, and admin dashboard. Turn casual lobbies into league nights.

> **BepInEx game plugin** — the plugin that runs inside Liftoff lives in its own repo: [liftoff-plugin](https://github.com/geekhostuk/liftoff-plugin) (private).

---

## Overview

Liftoff Competition transforms a standard Liftoff multiplayer session into a structured, managed event. It connects a BepInEx game plugin running inside Liftoff to a server backend, which powers three web interfaces: a **public live view** for spectators, a **competition page** with season and weekly league tables, and an **admin dashboard** for organisers.

### How It Works

```
                         ┌──────────────┐
        Internet ───────►│    Nginx     │
                         │ (TLS, route) │
                         └──────┬───────┘
                  ┌─────────┬───┴───┬──────────┐
                  │         │       │          │
           ┌──────┴──┐ ┌───┴───┐ ┌─┴────┐ ┌───┴──────┐
           │ public  │ │ admin │ │ api  │ │ realtime │
           │  web    │ │  web  │ │(REST)│ │  (WS +   │
           │(static) │ │(stat.)│ │      │ │ domain)  │
           └─────────┘ └───────┘ └──┬───┘ └────┬─────┘
                                    │          │
                                    └────┬─────┘
                                         │
                                   ┌─────┴─────┐
                                   │ PostgreSQL │
                                   │   (pg 16)  │
                                   └───────────┘
```

| Service | What it does | Exposed at |
|---------|-------------|------------|
| **public-web** | Serves the public HTML/JS/CSS (live view, competition, stats, about) | `/*` |
| **admin-web** | Serves the admin dashboard HTML/JS/CSS | `/admin/*` (Basic Auth) |
| **api** | Express REST API — public + admin routes, auth, DB reads/writes | `/api/*` |
| **realtime** | WebSocket servers, plugin ingestion, domain services (track overseer, idle kick, skip/extend vote, tag vote, scoring), internal API | `/ws/*` |
| **postgres** | PostgreSQL 16 database — stores all race data, competitions, playlists, and admin users | Port 5432 (internal) |
| **nginx** | TLS termination, path-based routing, Basic Auth for admin | Ports 80/443 |

1. The **BepInEx plugin** captures Photon multiplayer events (races, laps, players, chat) inside Liftoff and sends them to the realtime server over WebSocket.
2. The **realtime server** ingests events into PostgreSQL, manages in-memory state, runs domain services, and broadcasts updates to connected web clients.
3. The **API server** handles REST endpoints for both public data and admin operations. Admin actions that need the plugin or domain services are forwarded to the realtime server via an internal HTTP API.
4. The **track overseer** (in realtime) manages track rotation in playlist or tag mode, maintains a track queue, and auto-recovers after server reboots.
5. The **admin dashboard** lets organisers control the lobby: change tracks, run playlists, send chat, manage players, and configure competitions.
6. The **live view** gives spectators a real-time window into the current race, track, and player activity.
7. The **competition page** shows season and weekly league tables with live-updating standings.
8. Commands flow back from the realtime server to the plugin to execute lobby changes (track switches, chat messages, kicks) inside the game.

---

## Features

### Lobby Control
- Change tracks remotely from the admin dashboard
- Kick players when moderation is needed
- Browse and search the available track catalog
- Full command/response protocol between server and game

### Playlists
- Create named playlists with ordered track lists
- Start, stop, pause, and skip through playlists
- Scheduled track rotation with configurable timing
- Admin-only track queue — queue tracks to play next, reorder or remove queued items
- Resume mid-playlist after server reboot with correct remaining time
- Ideal for league nights, qualifying sessions, tournaments, and curated race events

### Track Tagging & Tag Runner

- Tag tracks with categories (e.g. `honk`, `technical`, `short`, `sg_playlist`)
- Managed tag list — admins create, rename, and delete tags
- Tracks are auto-discovered from the in-game track catalog (no manual entry)
- Search and filter tracks, assign multiple tags per track via checkboxes
- Per-track duration override — set a custom rotation time for individual tracks
- Local ID auto-populated from catalog; Steam ID editable for future Steam API lookups
- **Tag Runner** — a mode of the track overseer that randomly selects tracks matching one or more tags
  - Avoids recently played tracks (circular buffer of last 5)
  - Only selects tracks present in the current in-game catalog
  - Persists config to database — auto-resumes after server restart

### Tag Voting

- Chat-based category voting — players or admins can trigger a vote between tag options
- Players type `/tagvote` in game chat to start a vote with up to 4 random tags
- Vote by typing `/1`, `/2`, `/3`, or `/4` in chat
- Live tally displayed in chat after each new vote
- When the timer expires, the winning tag queues a random track
- Random tiebreak if multiple tags share the top vote count
- Admin-triggered votes via dashboard with custom tag selection and duration
- 5-minute cooldown between player-triggered votes
- `/tags` command lists all available tags in chat

### Vote to Skip
- Players type `/next` in game chat to start a skip vote (3-minute timer)
- Additional players type `/next` to add their vote
- Configurable vote threshold — when enough players vote, the track advances automatically

### Vote to Extend
- Players type `/extend` in game chat to start an extend vote (3-minute timer)
- Uses the same vote threshold as `/next`
- When the vote passes, 5 minutes are added to the current track timer before it auto-advances

### Idle Kick

- When the lobby is full (8 players), idle pilots inactive for 5 minutes receive an in-game warning
- After 1 additional minute without activity, they are automatically kicked to free up a slot
- Activity is tracked via gameplay events: checkpoints, laps, race completions, resets, chat messages, race starts, and race ends — so slow pilots on long tracks won't be falsely kicked
- JMT_Bot (the host) is always immune and hidden from the admin player list
- Additional players can be whitelisted via admin API, admin dashboard, or `IDLE_KICK_WHITELIST` env var
- Only active when the track overseer is running — free lobbies are unaffected

### Player Commands

- `/info` — shows available player commands, current mode, and time remaining
- `/next` — vote to skip the current track
- `/extend` — vote to extend the current track by 5 minutes
- `/tagvote` — start a tag category vote (up to 4 random tags)
- `/1` `/2` `/3` `/4` — cast your vote during an active tag vote
- `/tags` — list all available track tags

### Competition System

- **Always-on weekly scoring** — competition periods are automatically created for each Monday-to-Sunday week, no admin setup required
- Scoring runs continuously whenever races are recorded; no need to start or stop a competition
- Real-time scoring on every race close, plus batch scoring at period finalisation

### Points & Scoring

- **Race position** — F1-style points (25/18/15/12/10/8/6/4) based on fastest single lap per race
- **Most laps** — 1 point per 5 laps (capped at 10), plus 5-point lap leader bonus
- **Hot streak** — 3 points for setting the fastest lap in a race
- **Consistency** — 3 points if your lap time standard deviation is below the race median (drop worst 20%)
- **Most improved** — top 3 pilots by % improvement over pre-week personal bests earn 15/10/5 points; 3 points per new personal best on any track
- **Participation** — 10/20/30 points for flying on 3/5/7 days; 5 bonus points for 3+ different tracks
- Anti-gaming: minimum 2 laps to qualify, solo pilots get no position points, 2 participants = half points

> For the full points breakdown, scoring formulas, consistency calculation method, award categories, and everything shown on the competition page, see **[Competition.md](Competition.md)**.

### Competition Page

- Dedicated competition page with season and weekly league tables
- Season leaderboard aggregating all weeks
- Weekly standings broken down by category (position, laps, consistency, improved, participation, streak)
- Award highlight cards for top performers in each category
- Pilot drill-down showing race-by-race history and points breakdown
- Live updates via WebSocket — standings refresh automatically after each race
- Small competition summary widget on the homepage with top 3 pilots

### Live Spectator View
- Real-time race visualization in the browser
- Current track and environment display
- Active player roster
- Live lap activity feed
- Connection status indicator
- Designed for embedding in streams, club pages, or community sites

### Admin Dashboard

- Browser-based control panel for event organisers
- Multi-user authentication — each admin has their own username and password
- Real-time player monitoring with kick controls, idle time display, and whitelist toggle
- Track catalog browsing, selection, and manual track control
- Playlist creation, management, and automated rotation with configurable intervals
- **Track tagging** — search tracks, assign tags via checkboxes, edit Steam IDs and per-track durations
- **Tag runner** — start/stop/skip random tag-based rotation via track overseer with tag multi-select and interval config
- **Tag voting** — trigger category votes with custom tag options and duration
- Automated chat templates triggered by track changes, race starts, race ends, and player joins (new/returning)
- **Chat Beta** — redesigned chat with filterable log, character counter, variable chips, and live preview
- **Auto Messages Beta** — dedicated template manager with edit/test, trigger-filtered variables, and live preview
- **Track Overseer** — overseer dashboard with mode switching (playlist/tag), track queue management, upcoming track preview, and track history
- Live chat log and manual messaging into the game
- Persistent WebSocket connection for real-time status updates across all sections

> For a detailed breakdown of every dashboard section, all API endpoints, WebSocket events, and how the playlist and competition runners work, see **[admin-dashboard.md](admin-dashboard.md)**.

### Chat System
- View in-game chat live in the admin panel
- Send messages directly into the game from the browser
- **Chat Beta** — redesigned chat page with filterable log, character counter (255-char limit), variable insertion chips, and live template preview
- **Auto Messages Beta** — dedicated template management page with edit/test actions, trigger-filtered variable chips, live preview, and collapsible variable reference
- Automated message templates triggered by events:
  - `track_change` — announce the next track
  - `race_start` — notify players a race has begun
  - `race_end` — congratulate the winner
  - `player_joined` — any player enters the lobby
  - `player_new` — first-time player (never raced before)
  - `player_returned` — returning player with race history
- Template variables:
  - **Trigger-specific:** `{env}`, `{track}`, `{race}`, `{mins}`, `{winner}`, `{time}`, `{race_id}`, `{nick}`
  - **Universal:** `{1st}`, `{2nd}`, `{3rd}` (weekly competition standings), `{playlist}` (source playlist name), `{player_points}`, `{player_position}` (player's weekly rank/points)
- Schedule warning messages before track rotation
- Live preview resolves variables against current server data

### Race Data

- Automatic race and lap recording to PostgreSQL
- Per-pilot tracking via Steam ID and pilot GUID
- Session history and leaderboard support
- Structured JSONL event logs from the plugin
- Race results feed into competition scoring automatically via always-on weekly periods

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Game Plugin | C# / .NET 4.7.2 / BepInEx / Photon (PUN3) — [separate repo](https://github.com/geekhostuk/liftoff-plugin) |
| API Server | Node.js / Express |
| Realtime Server | Node.js / WebSocket (ws) |
| Database | PostgreSQL 16 |
| Validation | AJV (JSON Schema) |
| Frontend Build | Vite |
| Frontend | React 19, React Router 7 |
| Infrastructure | Docker, Docker Compose, Nginx, Let's Encrypt |
| Tests | Vitest |

---

## Project Structure

```
Liftoff/
├── contracts/                          # Shared event schemas (JSON Schema)
│   ├── common.json
│   ├── lap_recorded.json
│   ├── player_entered.json
│   ├── player_left.json
│   ├── player_list.json
│   ├── race_end.json
│   ├── race_reset.json
│   └── set_track.json
│
├── web/
│   ├── public/                         # Public frontend (React + Vite)
│   │   ├── src/
│   │   │   ├── pages/                  # Page components (Home, Live, Tracks, Competition, etc.)
│   │   │   ├── components/             # Shared UI + layout components
│   │   │   ├── hooks/                  # Custom React hooks
│   │   │   ├── lib/                    # API client, formatters, utilities
│   │   │   ├── App.jsx                 # Router + layout
│   │   │   └── main.jsx                # Entry point
│   │   ├── vite.config.js
│   │   ├── Dockerfile
│   │   └── nginx.conf                  # Container-level nginx config
│   │
│   └── admin/                          # Admin frontend (React + Vite)
│       ├── src/
│       │   ├── pages/                  # Page components
│       │   ├── components/             # Shared UI + layout components
│       │   ├── hooks/                  # Custom React hooks
│       │   ├── lib/                    # API client, utilities
│       │   ├── App.jsx                 # Router + layout
│       │   └── main.jsx                # Entry point
│       ├── vite.config.js
│       ├── Dockerfile
│       └── nginx.conf                  # Container-level nginx config
│
├── Server/
│   ├── src/
│   │   ├── api/                        # API server
│   │   │   ├── index.js                # Entry point — Express REST API
│   │   │   ├── realtimeClient.js       # HTTP client for internal API calls
│   │   │   └── routes/
│   │   │       ├── admin.js            # Admin API endpoints
│   │   │       └── public.js           # Public API endpoints
│   │   │
│   │   ├── realtime/                   # Realtime server
│   │   │   └── index.js               # Entry point — WebSockets + domain services + internal API
│   │   │
│   │   ├── pluginSocket.js             # Plugin WebSocket server
│   │   ├── liveSocket.js               # Live & admin WebSocket servers
│   │   ├── broadcast.js                # Event broadcast dispatcher
│   │   ├── trackOverseer.js            # Track rotation (playlist & tag modes) + queue
│   │   ├── competitionScoring.js       # Points engine (real-time + batch)
│   │   ├── state.js                    # In-memory state
│   │   ├── auth.js                     # Password hashing & session store
│   │   ├── tagVote.js                  # Chat-based tag category voting
│   │   ├── idleKick.js                 # Auto-kick idle pilots
│   │   ├── skipVote.js                 # Vote-to-skip logic
│   │   ├── extendVote.js               # Vote-to-extend logic
│   │   ├── eventTypes.js               # Event type constants
│   │   ├── contracts.js                # Event validation
│   │   ├── routes/                     # Shared route definitions (used by realtime)
│   │   │   ├── admin.js
│   │   │   └── public.js
│   │   ├── cli/
│   │   │   └── createUser.js           # CLI admin user creation
│   │   └── db/                         # Database layer (PostgreSQL via pg pool)
│   │       ├── connection.js           # PostgreSQL connection pool + migration runner
│   │       ├── migrations/             # Numbered SQL migration files
│   │       │   ├── 001_initial.sql
│   │       │   ├── 002_competition.sql
│   │       │   ├── 003_whitelist.sql
│   │       │   ├── 004_tags.sql
│   │       │   ├── 005_track_ids.sql
│   │       │   ├── 006_week_schedules.sql
│   │       │   ├── 007_overseer.sql
│   │       │   ├── 008_scoring_periods.sql
│   │       │   └── 009_overseer_queue.sql
│   │       ├── competition.js          # Competition queries
│   │       ├── ingest.js               # Event ingestion
│   │       ├── queries.js              # Public data queries
│   │       ├── adminUsers.js           # Admin user management
│   │       ├── chatTemplates.js        # Chat template CRUD
│   │       ├── playlists.js            # Playlist CRUD
│   │       ├── tags.js                 # Tag, track, and track-tag CRUD
│   │       └── trackOverseer.js        # Track overseer state & queue persistence
│   │
│   ├── nginx/
│   │   └── nginx.conf                  # Reverse proxy config (4 upstreams)
│   ├── docker-compose.yml              # 5 services: api, realtime, postgres, public-web, admin-web + nginx
│   ├── Dockerfile
│   └── .env.example
│
└── Logs/                               # Plugin log output
```

---

## Getting Started

### Prerequisites

- **Server:** Node.js 23+, PostgreSQL 16+ (or Docker, which includes Postgres)
- **Plugin:** .NET Framework 4.7.2 SDK, Liftoff with [BepInEx](https://github.com/BepInEx/BepInEx) installed

### Server Setup

1. **Clone the repo and configure environment:**
   ```bash
   cd Server
   cp .env.example .env
   ```

2. **Edit `.env`** with your own secrets:
   ```env
   PLUGIN_API_KEY=your-plugin-key
   ADMIN_TOKEN=your-admin-token
   DATABASE_URL=postgresql://liftoff:liftoff@localhost:5432/liftoff
   IDLE_KICK_WHITELIST=              # comma-separated nicks immune to idle kick
   ADMIN_USER=                       # initial admin username (first run only)
   ADMIN_PASS=                       # initial admin password (first run only)
   ```

3. **Run with Docker (recommended):**
   ```bash
   cd Server
   docker compose up -d --build
   ```

   This starts 5 containers plus nginx: API server, realtime server, PostgreSQL, public web, and admin web.

   Or **run locally** (PostgreSQL and both servers needed):
   ```bash
   # Ensure PostgreSQL is running and the database exists:
   createdb liftoff

   cd Server
   npm install
   npm run start:realtime &    # WebSockets + domain services (port 3000 + internal 3001)
   npm run start:api           # REST API (port 3000)
   ```

4. **Create an admin user** (choose one method):

   **Option A — via environment variables:** Set `ADMIN_USER` and `ADMIN_PASS` in `.env` before first start. The user is created automatically if the database has no users yet.

   **Option B — via CLI:**
   ```bash
   cd Server
   node src/cli/createUser.js <username> <password>
   ```

   You can create additional users the same way. The `ADMIN_TOKEN` in `.env` continues to work for API/script access via Bearer header.

5. **Access the interfaces:**

   With Docker (via nginx):
   - Public site: `https://yourdomain/`
   - Admin panel: `https://yourdomain/admin/`

### Frontend Development

Both web projects use Vite for development with hot reload:

```bash
cd web/public    # or web/admin
npm install
npm run dev      # starts Vite dev server with proxy to localhost:3000
```

Build for production:
```bash
npm run build    # outputs to dist/
```

### Plugin Setup

The BepInEx game plugin lives in a separate repository: [liftoff-plugin](https://github.com/geekhostuk/liftoff-plugin). See that repo for build and install instructions.

### Production Deployment

For production with HTTPS:

1. Set up your domain's DNS to point to your server.
2. Update the domain in `Server/nginx/nginx.conf` if not using the default (`jesusmctwos.co.uk`).
3. Run `init-certs.sh` to provision Let's Encrypt certificates.
4. Run `init-htpasswd.sh` to set up Nginx Basic Auth for the admin page.
5. Create admin users via CLI or env vars (see step 4 above).
6. Start with Docker Compose:
   ```bash
   cd Server
   docker compose up -d --build
   ```

---

## Architecture

The server is split into two processes that communicate via an internal HTTP API (port 3001, Docker-internal only):

**API Server** — Handles all REST endpoints, admin authentication, and database CRUD. When an admin action needs the game plugin or a domain service (track overseer, idle kick), it forwards the request to the realtime server.

**Realtime Server** — Owns all WebSocket connections (plugin, live view, admin), in-memory state, event ingestion, and domain services (track overseer, idle kick, skip/extend vote, tag vote, scoring). Exposes an internal API for the API server to call.

Both servers share the same PostgreSQL database. The database layer uses the `pg` connection pool with parameterized queries throughout — no ORM.

### Database Migrations

Schema changes are managed via numbered SQL files in `Server/src/db/migrations/`. The migration runner executes them in order on startup and tracks applied migrations in a `_migrations` table. To add a new migration, create a file like `003_your_change.sql` in the migrations directory. The schema uses the `citext` PostgreSQL extension for case-insensitive admin usernames and tag names.

### SQLite to PostgreSQL Migration

If migrating from a previous SQLite-based deployment, use the included migration script:

```bash
node scripts/migrate-sqlite-to-pg.js --sqlite ./competition.db --pg postgresql://liftoff:liftoff@localhost:5432/liftoff
```

This copies all data from the SQLite database into PostgreSQL, handling foreign keys and sequence resets automatically.

---

## Running Tests

```bash
cd Server
npm test
```

---

## Who It's For

- **Race organisers** — reduce the friction of running structured events
- **League admins** — automate track rotation and manage sessions remotely
- **Community hosts** — give your club nights a professional feel
- **Streamers** — embed the live view for your audience
- **Anyone** who wants Liftoff multiplayer to feel like an organised event, not an ad-hoc lobby

---

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

This project is licensed under the [MIT License](LICENSE).
