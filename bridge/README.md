# Oh My OpenCode Orchestra Bridge

`omo-orchestra-bridge.mjs` reads JSON-formatted Orchestra events from **stdin** and forwards them in batches to the Claude Dungeon `/api/bridge/events` endpoint.

No `npm install` needed — it uses only Node.js built-ins.

## Requirements

- Node.js 18+
- A running Claude Dungeon instance (local or Docker)

## Setup

### 1. Get your API key

```bash
# Fetch from a running instance (localhost only)
curl http://localhost:3000/api/bridge/key
# → { "apiKey": "cpab_abc123..." }
```

### 2. Set environment variables

```bash
export ORCHESTRA_DUNGEON_SERVER=http://localhost:3000
export ORCHESTRA_DUNGEON_API_KEY=cpab_abc123...
```

### 3. Pipe events into the bridge

```bash
# Replay the sample events to test the visualization
cat sample-events.jsonl | node bridge/omo-orchestra-bridge.mjs

# Or wire directly from an Oh My OpenCode session
omo run my-task | node bridge/omo-orchestra-bridge.mjs
```

Open **http://localhost:3000** — heroes appear in real time.

## How It Works

```
Oh My OpenCode session            Claude Dungeon
─────────────────────────         ────────────────────────────
stdout (JSON events)              ┌─────────────────────────┐
        │                         │  POST /api/bridge/events│
        ▼                         │  x-bridge-api-key: ...  │
omo-orchestra-bridge.mjs ───────► │                         │
  • reads stdin line-by-line      │  WebSocket broadcast    │
  • validates / transforms events │  to all browsers        │
  • batches up to 100 events      └─────────────────────────┘
  • retries with exp. backoff
```

## Event Format

The bridge accepts two formats:

### Already-valid Orchestra events (pass-through)

```json
{
  "schemaVersion": 1,
  "eventId": "01JC2Y05J0378M71FQ8J1NFK5B",
  "eventType": "agent.spawned",
  "occurredAt": 1730582401000,
  "runId": "my-session-001",
  "agentInstanceId": "sisyphus_001",
  "agentRole": "sisyphus"
}
```

### Legacy / raw events (auto-transformed)

```json
{ "type": "agent.state.changed", "role": "sisyphus", "state": "executing" }
```

The bridge fills in `schemaVersion`, `eventId`, `occurredAt`, and `runId` automatically.

## Supported Event Types

| `eventType`              | Effect in dungeon                  |
| ------------------------ | ---------------------------------- |
| `run.started`            | Signals start of a run             |
| `run.ended`              | Removes all heroes for this run    |
| `agent.spawned`          | Creates a new hero                 |
| `agent.state.changed`    | Moves hero to a new room/animation |
| `tool.call.started`      | Hero enters Boss Arena (fighting)  |
| `tool.call.finished`     | Hero leaves Boss Arena             |
| `agent.message.appended` | Hero shows a chat bubble           |
| `delegation`             | Hero enters corridor               |

## Environment Variables

| Variable                    | Required | Description                         |
| --------------------------- | -------- | ----------------------------------- |
| `ORCHESTRA_DUNGEON_SERVER`  | ✅       | Base URL of Claude Dungeon instance |
| `ORCHESTRA_DUNGEON_API_KEY` | ✅       | Bearer token from `/api/bridge/key` |

## Troubleshooting

**"ORCHESTRA_DUNGEON_SERVER environment variable is required"**
→ Set the env var before running the bridge.

**HTTP 401 from the server**
→ API key is wrong. Re-fetch: `curl http://localhost:3000/api/bridge/key`

**Events sent but heroes don't appear**
→ Make sure `run.started` and `agent.spawned` events were sent before state events.
→ Check server logs: `docker compose logs -f app`

**Bridge exits immediately**
→ stdin closed. Pipe a continuous process into it, or keep stdin open with:
`node bridge/omo-orchestra-bridge.mjs < /dev/stdin`

## Security

- The API key is only passed via `ORCHESTRA_DUNGEON_SERVER_API_KEY` — never hard-code it
- The `/api/bridge/key` endpoint is accessible from localhost only
- No source code or file contents are transmitted — only agent state/event metadata
