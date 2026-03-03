# 🏰 Claude Dungeon (Oh My OpenCode Orchestra Mode)

<img width="1200" height="675" alt="image" src="https://github.com/user-attachments/assets/8012ae32-a35f-4e1e-8236-bbba2e135f37" />

**Watch your Oh My OpenCode agents come alive as pixel-art heroes in a real-time dungeon.**

Claude Dungeon (now supporting Orchestra mode) ingests real-time events from multi-agent sessions and visualizes every agent as an animated knight exploring a dungeon — fighting bosses when executing tools, resting at the tavern, planning at the merchant shop.

![Claude Dungeon — Heroes in action](https://d2xsxph8kpxj0f.cloudfront.net/310519663321243150/kUk4sJXkGLHTnK5J3QqqXR/dungeon_heroes_final_42691e6e.png)

## Features

- **Real-time visualization** — heroes appear as Orchestra agent sessions start and disappear when they end
- **5 connected rooms** — Holy Sanctuary, Dungeon Main, Boss Arena, Merchant Shop, Tavern Rest, linked by corridors with doors
- **BFS pathfinding** — heroes navigate through corridors using proper tile-based pathfinding, never walking through walls
- **Animated sprites** — knights with idle/run/attack/rest animations from a full Metroidvania asset pack
- **Lord Wizard Boss** — permanently resides in Boss Arena with HP bar; attacks when heroes enter fighting state
- **Guardian enemy** — reacts to heroes in Dungeon Main with attack animation
- **Witch Merchant NPC** — animated in Merchant Shop; shows item orb when heroes are shopping
- **NPC facing** — heroes always face toward the NPC/Boss they are interacting with
- **Multi-agent support** — each concurrent Orchestra agent gets its own hero

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)

### Installation

```bash
git clone https://github.com/your-username/claude-dungeon
cd claude-dungeon
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Connect via Orchestra Mode

Claude Dungeon ingests events via the `/api/bridge/events` endpoint. The system accepts JSON-formatted event streams from the Oh My OpenCode Orchestra framework, allowing real-time visualization of multi-agent workflows.

Each agent event creates a hero character based on the agent role, and the hero navigates through dungeon rooms based on the agent's state and activity.

## Event Schema

The system uses a standardized event envelope to track agent activities. Each event follows this schema:

**Event Envelope (`/api/bridge/events`)**

```typescript
{
  schemaVersion: 1,
  eventId: string,              // ULID recommended for sortability
  eventType: "run.started" | "run.ended" | "agent.spawned" |
             "agent.state.changed" | "tool.call.started" |
             "tool.call.finished" | "agent.message.appended" | "delegation",
  occurredAt: number,           // epoch ms
  workspaceId: string,         // defaults to "local"
  runId: string,               // unique identifier for the run/session
  agentInstanceId?: string,    // required for agent events
  agentRole?: string,          // required for agent events (e.g., "sisyphus", "prometheus", etc.)
  agentState?: string,         // required for agent.state.changed events
  toolCallId?: string,         // required for tool.call.* events
  toolName?: string,           // required for tool.call.* events
  message?: string,            // redacted/truncated to 200 chars
  parentAgentInstanceId?: string, // for delegation events
  payload?: object             // optional, small data; no secrets
}
```

### Example Event:

```json
{
  "schemaVersion": 1,
  "eventId": "01JC2Y05J0378M71FQ8J1NFK5M",
  "eventType": "agent.state.changed",
  "occurredAt": 1730582439000,
  "workspaceId": "local",
  "runId": "cli_session_abc123",
  "agentInstanceId": "sisyphus_instance_456",
  "agentRole": "sisyphus",
  "agentState": "executing",
  "message": "Focused executor running Bash command"
}
```

## Project Structure

```
client/          React 19 + Tailwind 4 frontend
  src/
    components/  DungeonMap (Canvas), HeroPanel
    hooks/       useHeroSocket, useAuth
    lib/         dungeonConfig
server/          Express + tRPC backend
  routers/       agents
  websocket.ts   Real-time hero state management
  bridge.ts      REST API for external data push with Orchestra event handling
drizzle/         Database schema & migrations
public/sprites/  Pixel art assets (Metroidvania Asset Pack)
bridge/          Local bridge script for Orchestra event producers (omo-orchestra-bridge.mjs)
```

## How It Works

1. The server receives orchestration events via the `/api/bridge/events` endpoint through JSON batches
2. Each event creates or updates a hero character with role, state, and activity information
3. The event data is processed through projection rules to determine hero state, class, and room
4. State and room assignments (and animations) are broadcast via WebSocket to all connected browsers
5. The Canvas renderer draws heroes in the appropriate dungeon room with matching animations
6. Heroes navigate between rooms using BFS pathfinding on a tile grid — corridors are the only valid paths

## Architecture

The overall system follows this event flow:

```
Orchestra Producer Script                    Claude Dungeon Web App
─────────────────────────                   ─────────────────────────────
Sends events (stdin)     ──────────────►    ┌─────────────────────────┐
│                                            │  /api/bridge/events     │
│   ┌──────────────────┐                    │  (POST with event data)   │
└───┤ omo-orchestra-   │                    │                         │
    │   bridge.mjs     ├────┐               │  WebSocket broadcast    │
    └──────────────────┘    │               │  to all connected       │
                            │ POST           │  browser clients        │
                    CLAUDE_DUNGEON_SERVER   └─────────────────────────┘
                    └────────────────────►
                             API KEY
```

This setup allows for remote agents to send event data to a central Claude Dungeon instance.

## Agent State → Room Mapping

| Orchestra Agent State   | Dungeon Room  | Animation                           |
| ----------------------- | ------------- | ----------------------------------- |
| idle / waiting          | Tavern Rest   | Idle + Zzz                          |
| executing / tool.use    | Boss Arena    | Attack (facing Boss)                |
| planning / thinking     | Merchant Shop | Idle (facing Witch, item orb shown) |
| researching / reviewing | Church        | Idle                                |
| delegating              | Corridor      | Idle + talk bubble                  |
| done                    | Tavern Rest   | Idle + Zzz                          |

## Agent Role → Class Mapping

| Orchestra Agent Role | Hero Class | Description                                     |
| -------------------- | ---------- | ----------------------------------------------- |
| sisyphus             | warrior    | Persistent executor focused on completing tasks |
| prometheus           | mage       | Strategic planning and memory management        |
| oracle               | mage       | Knowledge management expert                     |
| explore              | rogue      | Exploration specialist for codebase discovery   |
| librarian            | cleric     | Documentation and resource organizer            |
| hephaestus           | craftsman  | Code engineering and implementation specialist  |
| atlas                | scholar    | Navigation and architecture specialist          |
| momus                | advisor    | Evaluation and criticism agent                  |
| metis                | strategist | Planning and tactical intelligence              |

## Using the Producer Script

The `bridge/omo-orchestra-bridge.mjs` script is designed to receive JSON events from the Oh My OpenCode Orchestra and forward them to Claude Dungeon:

### Setup

```bash
# Run the bridge with environment variables
ORCHESTRA_DUNGEON_SERVER=http://localhost:3000 \
ORCHESTRA_DUNGEON_API_KEY=your_api_key_here \
node bridge/omo-orchestra-bridge.mjs
```

### Send Events

```bash
# Generate sample events
cat << 'EOF' | node bridge/omo-orchestra-bridge.mjs
{"timestamp": 1730582439000, "type": "agent.state", "role": "sisyphus", "state": "executing", "description": "Executing task"}
{"timestamp": 1730582440000, "type": "tool.use", "role": "prometheus", "toolName": "bash", "description": "Using Bash tool"}
EOF
```

## API Endpoints

### POST `/api/bridge/events`

Receives a batch of Orchestra events:

```bash
curl -X POST http://localhost:5173/api/bridge/events \
  -H "Content-Type: application/json" \
  -H "x-bridge-api-key: your_api_key_here" \
  -d '{
    "runId": "session_123",
    "events": [
      {
        "schemaVersion": 1,
        "eventId": "01JC2Y05J0378M71FQ8J1NFK5M",
        "eventType": "agent.spawned",
        "occurredAt": 1730582439000,
        "runId": "session_123",
        "agentInstanceId": "my_agent",
        "agentRole": "sisyphus"
      }
    ]
  }'
```

### GET `/api/bridge/events`

Replay events for a specific runId with cursor-based pagination:

```
GET /api/bridge/events?runId=session_123&sinceCursor=0&limit=100
```

### GET `/api/bridge/key`

Retrieve your API key (only accessible from localhost):

```
GET /api/bridge/key
```

Response:

```
{ "apiKey": "cpab_abc123def456" }
```

## Tech Stack

| Layer       | Technology                             |
| ----------- | -------------------------------------- |
| Frontend    | React 19, Tailwind CSS 4, Canvas API   |
| Backend     | Express 4, tRPC 11, Node.js            |
| Real-time   | WebSocket (ws)                         |
| Sprites     | Another Metroidvania Asset Pack Vol. 1 |
| Pathfinding | BFS on tile grid (wall-aware)          |

## Claude Compatibility (Deprecated)

Previous Claude Code transcript watching functionality has been deprecated in favor of the flexible Orchestra event system. The event-based system provides better support for multi-agent orchestration frameworks.

## Contributing

Contributions are welcome!

Ideas for contributions:

- Sound effects (Web Audio API)
- Mobile-responsive layout
- More sophisticated projection rules
- Enhanced visualization options
- Support for custom agent types

## License

MIT — see [LICENSE](LICENSE).

## Credits

- Pixel art sprites: [Another Metroidvania Asset Pack Vol. 1](https://itch.io) by the original artist
- Built with [Claude](https://claude.ai) by Anthropic
