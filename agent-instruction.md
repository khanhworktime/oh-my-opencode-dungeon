# Oh My OpenCode Dungeon — Agent Integration Guide

How to connect your **Oh My OpenCode** agents to Oh My OpenCode Dungeon so they appear as pixel-art heroes in real time.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Auth — Getting Your API Key](#auth--getting-your-api-key)
3. [Running Claude Dungeon](#running-claude-dungeon)
   - [Option A: Docker (recommended)](#option-a-docker-recommended)
   - [Option B: Local dev server](#option-b-local-dev-server)
4. [Connecting Oh My OpenCode](#connecting-oh-my-opencode)
   - [Using the bridge script](#using-the-bridge-script)
   - [Sending events directly](#sending-events-directly)
5. [Event Schema Reference](#event-schema-reference)
6. [Agent Role → Hero Class Mapping](#agent-role--hero-class-mapping)
7. [Agent State → Dungeon Room Mapping](#agent-state--dungeon-room-mapping)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Clone and start
git clone https://github.com/khanhworktime/oh-my-opencode-dungeon
cd oh-my-opencode-dungeon
cp .env.example .env          # edit JWT_SECRET at minimum
docker compose up -d

# 2. Get your API key (only accessible from localhost)
curl http://localhost:3000/api/bridge/key
# → { "apiKey": "cpab_abc123..." }

# 3. Point your Oh My OpenCode session at Claude Dungeon
export ORCHESTRA_DUNGEON_SERVER=http://localhost:3000
export ORCHESTRA_DUNGEON_API_KEY=cpab_abc123...

# 4. Run the bridge (pipe Oh My OpenCode stdout into it)
node bridge/omo-orchestra-bridge.mjs
```

Open **http://localhost:3000** — heroes appear as your agents run.

---

## Auth — Getting Your API Key

Claude Dungeon uses a single bearer token (prefixed `cpab_`) to authenticate bridge POSTs. The key is auto-generated on first start and persisted to `~/.claude-dungeon/config.json`.

### Retrieve the key

```bash
# From localhost (always works — no auth required on this endpoint)
curl http://localhost:3000/api/bridge/key
```

```json
{ "apiKey": "cpab_f3a8c12d..." }
```

### Inside Docker

The volume `dungeon-data` maps to `/home/dungeon/.claude-dungeon` inside the container. The key survives container restarts — you only need to retrieve it once.

```bash
# If you need the raw file
docker compose exec app cat /home/dungeon/.claude-dungeon/config.json
```

### Rotating the key

Delete the config file and restart the server — a new key is generated automatically.

```bash
docker compose exec app rm /home/dungeon/.claude-dungeon/config.json
docker compose restart app
curl http://localhost:3000/api/bridge/key   # new key
```

---

## Running Claude Dungeon

### Option A: Docker (recommended)

**Prerequisites:** Docker + Docker Compose

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env — at minimum set a real JWT_SECRET:
#   JWT_SECRET=$(openssl rand -hex 32)

# 2. Build and start
docker compose up -d

# 3. Verify it's healthy
docker compose ps
curl http://localhost:3000/api/bridge/key
```

The app listens on **port 3000** by default. Set `PORT=xxxx` in `.env` to change it.

### Option B: Local dev server

**Prerequisites:** Node.js 18+, pnpm

```bash
pnpm install
cp .env.example .env      # set JWT_SECRET
pnpm dev                  # starts on http://localhost:3000
```

---

## Connecting Oh My OpenCode

### Using the bridge script

The `bridge/omo-orchestra-bridge.mjs` script reads JSON events from **stdin** and forwards them to Claude Dungeon in batches.

#### Step 1 — Set environment variables

```bash
export ORCHESTRA_DUNGEON_SERVER=http://localhost:3000
export ORCHESTRA_DUNGEON_API_KEY=cpab_abc123...    # from /api/bridge/key
```

#### Step 2 — Pipe Oh My OpenCode output into the bridge

```bash
# If your omo session writes events to stdout
omo run my-task | node bridge/omo-orchestra-bridge.mjs

# Or replay sample events to test the visualization
cat sample-events.jsonl | node bridge/omo-orchestra-bridge.mjs
```

#### Step 3 — Open the UI

Navigate to **http://localhost:3000** — heroes spawn as agents come online.

---

### Sending events directly

You can also POST events directly from any process (no bridge needed):

```bash
curl -X POST http://localhost:3000/api/bridge/events \
  -H "Content-Type: application/json" \
  -H "x-bridge-api-key: cpab_abc123..." \
  -d '{
    "runId": "my-session-001",
    "events": [
      {
        "schemaVersion": 1,
        "eventId": "01JC2Y05J0378M71FQ8J1NFK5B",
        "eventType": "agent.spawned",
        "occurredAt": 1730582401000,
        "workspaceId": "local",
        "runId": "my-session-001",
        "agentInstanceId": "sisyphus_001",
        "agentRole": "sisyphus"
      }
    ]
  }'
```

Events are appended to an in-memory store and persisted to `~/.claude-dungeon/events/<runId>.jsonl`. Heroes update instantly via WebSocket.

---

## Event Schema Reference

All events share this envelope. Only `schemaVersion`, `eventId`, `eventType`, `occurredAt`, and `runId` are required on every event.

```typescript
{
  schemaVersion: 1,                   // always 1
  eventId: string,                    // ULID recommended (globally unique)
  eventType:
    | "run.started"                   // signals the start of a run
    | "run.ended"                     // heroes disappear on run end
    | "agent.spawned"                 // creates a new hero
    | "agent.state.changed"           // moves hero to a new room/animation
    | "tool.call.started"             // hero enters fighting state
    | "tool.call.finished"            // hero leaves fighting state
    | "agent.message.appended"        // hero shows a chat bubble
    | "delegation",                   // hero enters corridor
  occurredAt: number,                 // epoch milliseconds
  workspaceId?: string,               // defaults to "local"
  runId: string,                      // unique per omo session
  agentInstanceId?: string,           // required for all agent/* events
  agentRole?: string,                 // see Role→Class table below
  agentState?: string,               // see State→Room table below
  toolCallId?: string,                // for tool.call.* events
  toolName?: string,                  // for tool.call.* events
  message?: string,                   // truncated to 200 chars
  parentAgentInstanceId?: string,     // for delegation events
  payload?: object                    // small extra data; no secrets
}
```

### Minimal event sequence for a single agent

```jsonl
{"schemaVersion":1,"eventId":"evt-001","eventType":"run.started","occurredAt":1730000000000,"runId":"run-abc"}
{"schemaVersion":1,"eventId":"evt-002","eventType":"agent.spawned","occurredAt":1730000001000,"runId":"run-abc","agentInstanceId":"sisy-1","agentRole":"sisyphus"}
{"schemaVersion":1,"eventId":"evt-003","eventType":"agent.state.changed","occurredAt":1730000002000,"runId":"run-abc","agentInstanceId":"sisy-1","agentRole":"sisyphus","agentState":"executing"}
{"schemaVersion":1,"eventId":"evt-004","eventType":"run.ended","occurredAt":1730000010000,"runId":"run-abc"}
```

---

## Agent Role → Hero Class Mapping

| `agentRole`  | Hero Class | Dungeon sprite |
| ------------ | ---------- | -------------- |
| `sisyphus`   | warrior    | Knight (blue)  |
| `prometheus` | mage       | Mage           |
| `oracle`     | mage       | Mage           |
| `explore`    | rogue      | Rogue          |
| `librarian`  | cleric     | Cleric         |
| `hephaestus` | craftsman  | Craftsman      |
| `atlas`      | scholar    | Scholar        |
| `momus`      | advisor    | Advisor        |
| `metis`      | strategist | Strategist     |
| _(unknown)_  | warrior    | Knight (blue)  |

---

## Agent State → Dungeon Room Mapping

| `agentState`               | Room          | Animation            |
| -------------------------- | ------------- | -------------------- |
| `idle`, `waiting`          | Tavern Rest   | Idle + Zzz           |
| `executing`, `tool.use`    | Boss Arena    | Attack (facing Boss) |
| `planning`, `thinking`     | Merchant Shop | Idle (facing Witch)  |
| `researching`, `reviewing` | Church        | Idle                 |
| `delegating`               | Corridor      | Idle + talk bubble   |
| `done`                     | Tavern Rest   | Idle + Zzz           |

State is inferred from `agentState` on `agent.state.changed` events, and also from `tool.call.started` / `tool.call.finished` pairs (hero fights while a tool is in flight).

---

## Troubleshooting

### Bridge exits with "ORCHESTRA_DUNGEON_SERVER is required"

```bash
export ORCHESTRA_DUNGEON_SERVER=http://localhost:3000
```

### POST returns 401

The API key is wrong or missing. Re-fetch:

```bash
curl http://localhost:3000/api/bridge/key
```

### Heroes don't appear after spawning

1. Check that `agent.spawned` was sent with a valid `agentInstanceId`.
2. Check that `run.started` was sent before `agent.spawned` (or send them together).
3. Look at server logs: `docker compose logs -f app`

### Heroes accumulate across runs

Send a `run.ended` event at the end of each session — the server cleans up heroes for that `runId`:

```json
{
  "schemaVersion": 1,
  "eventId": "...",
  "eventType": "run.ended",
  "occurredAt": 1730000999000,
  "runId": "run-abc"
}
```

### Replay persisted events after restart

Events are automatically rehydrated from `~/.claude-dungeon/events/` on server startup. The 5 most recent runs are replayed. No action needed.

### Port conflict

Set a different port in `.env`:

```
PORT=3001
```

Then update your `ORCHESTRA_DUNGEON_SERVER` accordingly.
