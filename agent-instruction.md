# Oh My OpenCode Dungeon — Agent Integration Guide

How to connect your **Oh My OpenCode** agents to Oh My OpenCode Dungeon so they appear as pixel-art heroes in real time.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Auth — Getting Your API Key](#auth--getting-your-api-key)
3. [Running Claude Dungeon](#running-claude-dungeon)
   - [Option A: Docker (recommended)](#option-a-docker-recommended)
   - [Option B: Local dev server](#option-b-local-dev-server)
4. [Connecting OpenCode](#connecting-opencode)
   - [Method 1: OpenCode Plugin (recommended — zero config after install)](#method-1-opencode-plugin-recommended)
   - [Method 2: Pipe via --format json](#method-2-pipe-via---format-json)
   - [Method 3: Send events directly via curl](#method-3-send-events-directly-via-curl)
5. [Event Schema Reference](#event-schema-reference)
6. [Agent Role → Hero Class Mapping](#agent-role--hero-class-mapping)
7. [Agent State → Dungeon Room Mapping](#agent-state--dungeon-room-mapping)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Clone and start the dungeon
git clone https://github.com/khanhworktime/oh-my-opencode-dungeon
cd oh-my-opencode-dungeon
cp .env.example .env
docker compose up -d

# 2. Get your API key
curl http://localhost:3001/api/bridge/key
# → { "apiKey": "cpab_abc123..." }

# 3. Set env vars (add to your shell profile to make permanent)
export ORCHESTRA_DUNGEON_SERVER=http://localhost:3001
export ORCHESTRA_DUNGEON_API_KEY=cpab_abc123...

# 4a. After plugin install (see below) — just run OpenCode normally
opencode

# 4b. Or pipe a one-shot run
opencode run --format json "fix the bug" | node bridge/omo-orchestra-bridge.mjs
```

Open **http://localhost:3001** — heroes appear as your agents run.

## Auth — Getting Your API Key

Claude Dungeon uses a single bearer token (prefixed `cpab_`) to authenticate bridge POSTs. The key is auto-generated on first start and persisted in a Docker volume.

### Retrieve the key

```bash
# From localhost (no auth required on this endpoint)
curl http://localhost:3001/api/bridge/key
```

```json
{ "apiKey": "cpab_f3a8c12d..." }
```

### Inside Docker

The volume `dungeon-data` maps to `/home/dungeon/.claude-dungeon` inside the container. The key survives container restarts.

```bash
docker compose exec app cat /home/dungeon/.claude-dungeon/config.json
```

### Rotating the key

```bash
docker compose exec app rm /home/dungeon/.claude-dungeon/config.json
docker compose restart app
curl http://localhost:3001/api/bridge/key   # new key
```

---

## Running Claude Dungeon

### Option A: Docker (recommended)

**Prerequisites:** Docker + Docker Compose

```bash
cp .env.example .env
# Edit .env — at minimum set a real JWT_SECRET:
#   JWT_SECRET=$(openssl rand -hex 32)
docker compose up -d

# Verify:
docker compose ps
curl http://localhost:3001/api/bridge/key
```

The app listens on **port 3001** by default (set `PORT=xxxx` in `.env` to change).

### Option B: Local dev server

**Prerequisites:** Node.js 18+, pnpm

```bash
pnpm install
cp .env.example .env    # set JWT_SECRET
pnpm dev               # starts on http://localhost:3000
```
---

## Connecting OpenCode

OpenCode has two integration paths. **Method 1 (plugin) is recommended** — once installed it works automatically in the background whenever `ORCHESTRA_DUNGEON_SERVER` is set.

---

### Method 1: OpenCode Plugin (recommended)

The plugin hooks into OpenCode's event system and forwards every session event to the dungeon in real time. No piping, no extra scripts.

#### Install (one-time setup)

```bash
# 1. Create the global plugin directory
mkdir -p ~/.config/opencode/plugins

# 2. Copy the plugin from this repo
cp plugins/dungeon-bridge.js ~/.config/opencode/plugins/dungeon-bridge.js
```

Add the plugin to your global OpenCode config at `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["dungeon-bridge"]
}
```

> If the file already has other settings, just add `"dungeon-bridge"` to the existing `plugin` array.

#### Use

```bash
# Set in your shell profile (~/.zshrc or ~/.bashrc) to make permanent:
export ORCHESTRA_DUNGEON_SERVER=http://localhost:3001
export ORCHESTRA_DUNGEON_API_KEY=cpab_abc123...    # from /api/bridge/key

# Now just run OpenCode normally — heroes appear automatically
opencode
```

The plugin is **silent when env vars are not set**, so you can leave it installed permanently without affecting sessions where you don't want dungeon visualization.

#### What events the plugin forwards

| OpenCode event | Hero effect |
| -------------- | ----------- |
| Session starts | Hero spawns in dungeon |
| `tool.execute.before` | Hero enters Boss Arena (fighting) |
| `tool.execute.after` | Hero returns to executing state |
| `message.part.updated` (reasoning) | Hero moves to Merchant Shop (planning) |
| `session.idle` | Hero rests in Tavern |
| `session.deleted` / `session.error` | Hero disappears |

---

### Method 2: Pipe via --format json

Use `opencode run --format json` to output JSONL events to stdout and pipe them into the bridge script. Good for one-shot automated tasks.

```bash
export ORCHESTRA_DUNGEON_SERVER=http://localhost:3001
export ORCHESTRA_DUNGEON_API_KEY=cpab_abc123...

# One-shot task
opencode run --format json "fix the login bug" | node bridge/omo-orchestra-bridge.mjs

# Replay sample events to test the visualization without running OpenCode
cat sample-events.jsonl | node bridge/omo-orchestra-bridge.mjs
```

The bridge automatically transforms OpenCode's native JSONL format (`tool_use`, `step_start`, `text`, etc.) into Orchestra events.

---

### Method 3: Send events directly via curl

POST events from any script or process — no bridge script needed:

```bash
curl -X POST http://localhost:3001/api/bridge/events \
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

Events are forwarded via WebSocket to all connected browsers immediately.

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
export ORCHESTRA_DUNGEON_SERVER=http://localhost:3001
```

### POST returns 401

The API key is wrong or missing. Re-fetch:

```bash
curl http://localhost:3001/api/bridge/key
```

### Plugin installed but heroes don't appear

1. Confirm the plugin file is at `~/.config/opencode/plugins/dungeon-bridge.js`
2. Confirm `~/.config/opencode/opencode.json` contains `"plugin": ["dungeon-bridge"]`
3. Confirm both env vars are exported in the same terminal where you run `opencode`
4. Quick smoke test — paste this to verify the server pipeline works:

```bash
curl -X POST $ORCHESTRA_DUNGEON_SERVER/api/bridge/events \
  -H "Content-Type: application/json" \
  -H "x-bridge-api-key: $ORCHESTRA_DUNGEON_API_KEY" \
  -d '{"runId":"test","events":[{"schemaVersion":1,"eventId":"t1","eventType":"agent.spawned","occurredAt":'$(date +%s)'000,"runId":"test","agentInstanceId":"hero-1","agentRole":"sisyphus"}]}'
```

If a hero appears in the dungeon, the server is working correctly — the issue is with event forwarding from OpenCode.

### Heroes don't appear after spawning

1. Confirm `agent.spawned` was sent with a valid `agentInstanceId`.
2. Confirm `run.started` was sent before `agent.spawned`.
3. Check server logs: `docker compose logs -f app`

### Heroes accumulate across runs

Send a `run.ended` event at the end of each session:

```json
{
  "schemaVersion": 1,
  "eventId": "...",
  "eventType": "run.ended",
  "occurredAt": 1730000999000,
  "runId": "run-abc"
}
```

The plugin (Method 1) emits this automatically on `session.deleted`.

### Replay persisted events after restart

Events are automatically rehydrated from `~/.claude-dungeon/events/` on server startup. No action needed.

### Port conflict

Set a different port in `.env`:

```
PORT=3002
```

Then update your `ORCHESTRA_DUNGEON_SERVER` accordingly.
