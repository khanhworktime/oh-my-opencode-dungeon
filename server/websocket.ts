/**
 * WebSocket Handler - Real-time Orchestra event monitoring
 *
 * Replaces Claude Code transcript watching with Orchestra event projection.
 * Events are projected to Hero states using projectEventToHeroDelta().
 */

import { WebSocket, WebSocketServer } from "ws";
import {
  Hero,
  HeroState,
  DungeonRoom,
  ActiveTool,
  ROOM_POSITIONS,
  detectHeroClass,
  } from "./routers/agents";
import { HeroClass } from "../shared/orchestraEvent";
import {
  projectEventToHeroDelta,
  OrchestraEventInput,
  ValidatedOrchestraEventSchema,
} from "../shared/orchestraEvent";

// ─── State ────────────────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;
const heroes = new Map<number, Hero>();

// Demo mode state
let demoHeroes: Hero[] | null = null;

// Stable hero ID mapping: runId + agentInstanceId → heroId
const heroIdMap = new Map<string, number>();
let nextHeroId = 1;

// ─── Persistence ──────────────────────────────────────────────────────────────

function persistHeroes() {
  // No-op in new implementation - heroes are ephemeral
}

function loadPersistedHeroes() {
  // No-op - heroes are created dynamically from events
}

// ─── Path Helpers ─────────────────────────────────────────────────────────────

function projectNameFromPath(realPath: string): string {
  const parts = realPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || realPath;
}

// ─── Tool → Room/State Mapping ────────────────────────────────────────────────

function toolNameToRoom(toolName: string): DungeonRoom {
  const lower = toolName.toLowerCase();
  // Combat actions → Boss Arena (executing, writing, building)
  if (
    lower.includes("bash") ||
    lower.includes("execute") ||
    lower.includes("run")
  )
    return "boss_arena";
  if (
    lower.includes("write") ||
    lower.includes("edit") ||
    lower.includes("create")
  )
    return "boss_arena";
  if (lower.includes("task") || lower.includes("agent")) return "boss_arena";
  // Research / scouting → Merchant Shop (gathering intel, buying potions)
  if (
    lower.includes("web") ||
    lower.includes("search") ||
    lower.includes("fetch")
  )
    return "shop";
  if (lower.includes("plan") || lower.includes("think")) return "shop";
  // Reading / studying → Dungeon Main (exploring, scouting)
  if (
    lower.includes("read") ||
    lower.includes("view") ||
    lower.includes("list") ||
    lower.includes("glob")
  )
    return "corridor";
  return "boss_arena";
}

function toolNameToState(toolName: string): HeroState {
  const lower = toolName.toLowerCase();
  // Heavy execution → fighting
  if (lower.includes("bash") || lower.includes("execute")) return "fighting";
  if (
    lower.includes("write") ||
    lower.includes("edit") ||
    lower.includes("create")
  )
    return "fighting";
  if (lower.includes("task") || lower.includes("agent")) return "fighting";
  // Research & planning → shopping (at merchant)
  if (
    lower.includes("web") ||
    lower.includes("search") ||
    lower.includes("fetch")
  )
    return "shopping";
  if (lower.includes("plan") || lower.includes("think")) return "shopping";
  // Reading → casting (studying scrolls)
  if (
    lower.includes("read") ||
    lower.includes("view") ||
    lower.includes("list") ||
    lower.includes("glob")
  )
    return "casting";
  return "fighting";
}

function formatToolStatus(
  toolName: string,
  input: Record<string, unknown>
): string {
  const lower = toolName.toLowerCase();
  if (lower.includes("bash")) {
    const cmd = (input.command as string) || "";
    return `⚔️ Running: ${cmd.slice(0, 50)}`;
  }
  if (lower.includes("read") || lower.includes("view")) {
    const file = (input.file_path ||
      input.path ||
      input.filename ||
      "") as string;
    return `📖 Reading: ${file ? file.split("/").pop() || file : "file"}`;
  }
  if (lower.includes("write") || lower.includes("edit")) {
    const file = (input.file_path || input.path || "") as string;
    return `✍️ Writing: ${file ? file.split("/").pop() || file : "file"}`;
  }
  if (lower.includes("web") || lower.includes("search")) {
    const q = (input.query || input.url || "") as string;
    return `🔍 Searching: ${String(q).slice(0, 40)}`;
  }
  if (lower.includes("task")) return `⚡ Spawning Sub-Agent`;
  return `🗡️ Using: ${toolName}`;
}

// ─── Hero Management ──────────────────────────────────────────────────────────

function createHero(heroId: number, heroData: Partial<Hero>): Hero {
  const name = heroData.name || `hero-${heroId}`;
  const hero: Hero = {
    id: heroId,
    name,
    heroClass: "warrior",
    state: "idle",
    position: { ...ROOM_POSITIONS.church },
    room: "church",
    activeTools: [],
    subAgentTools: {},
    toolCount: { bash: 0, read: 0, write: 0, web: 0 },
    isWaiting: false,
    skills: [],
    level: 1,
    exp: 0,
    hp: 100,
    maxHp: 100,
    mp: 100,
    maxMp: 100,
    projectPath: "",
    sessionFile: "",
    ...heroData,
  };
  heroes.set(heroId, hero);
  return hero;
}

function updateHeroState(hero: Hero, state: HeroState, room: DungeonRoom) {
  hero.state = state;
  hero.room = room;
  // Use exact room center position - frontend DungeonMap handles smooth movement via BFS
  hero.position = { ...ROOM_POSITIONS[room] };
}

function setHeroResting(heroId: number) {
  const hero = heroes.get(heroId);
  if (!hero) return;

  // Short idle → rest at tavern, longer idle → return to church (sanctuary)
  updateHeroState(hero, "resting", "rest_area");
  hero.isWaiting = true;
  hero.activeTools = [];
  hero.hp = Math.min(hero.maxHp, hero.hp + 10);
  hero.mp = Math.min(hero.maxMp, hero.mp + 15);
  broadcast({ type: "hero-update", payload: hero });
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

function broadcast(message: { type: string; payload: unknown }) {
  if (!wss) return;
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (error) {
        console.warn("[WebSocket] Send error:", error);
    }
  });
}

// ─── Client Message Handling ──────────────────────────────────────────────────

function createDemoHeroes(): Hero[] {
  const configs: Array<{
    name: string;
    heroClass: HeroClass;
    state: HeroState;
    room: DungeonRoom;
    projectPath: string;
    tools: Array<{ id: string; name: string; status: string }>;
  }> = [
    {
      name: "warrior-001",
      heroClass: "warrior",
      state: "fighting",
      room: "boss_arena",
      projectPath: "/demo/my-project",
      tools: [{ id: "t0", name: "Bash", status: "⚔️ Running: npm run build" }],
    },
    {
      name: "mage-002",
      heroClass: "mage",
      state: "casting",
      room: "boss_arena",
      projectPath: "/demo/web-app",
      tools: [
        {
          id: "t1",
          name: "WebSearch",
          status: "🔍 Searching: React hooks best practices",
        },
      ],
    },
    {
      name: "cleric-003",
      heroClass: "cleric",
      state: "shopping",
      room: "shop",
      projectPath: "/demo/api-service",
      tools: [
        { id: "t2", name: "Think", status: "🔮 Planning: architecture design" },
      ],
    },
    {
      name: "warrior-004",
      heroClass: "warrior",
      state: "resting",
      room: "rest_area",
      projectPath: "/demo/backend",
      tools: [],
    },
  ];
  return configs.map((d, i) => ({
    id: 9000 + i,
    name: d.name,
    heroClass: d.heroClass,
    state: d.state,
    position: { ...ROOM_POSITIONS[d.room] },
    room: d.room,
    activeTools: d.tools.map(t => ({ ...t, startedAt: Date.now() - i * 5000 })),
    subAgentTools: {},
    toolCount: { bash: 5 + i, read: 3 + i, write: 2 + i, web: 1 + i },
    isWaiting: d.state === "resting",
    skills: [],
    level: i + 1,
    exp: 50 * (i + 1),
    hp: 80 + i * 5,
    maxHp: 100,
    mp: 60 + i * 10,
    maxMp: 100,
    projectPath: d.projectPath,
    sessionFile: "",
  }));
}

function handleClientMessage(msg: Record<string, unknown>) {
  if (msg.type === "clear-heroes") {
    heroes.clear();
    heroIdMap.clear();
    nextHeroId = 1;
    broadcast({ type: "heroes-batch", payload: [] });
  }

  if (msg.type === "demo-start") {
    // Generate and broadcast demo heroes
    demoHeroes = createDemoHeroes();
    broadcast({ type: "heroes-batch", payload: demoHeroes });
  }

  if (msg.type === "demo-stop") {
    // Switch to live mode: broadcast real heroes
    broadcast({ type: "heroes-batch", payload: [...heroes.values()] });
  }

  if (msg.type === "demo-mode") {
    // Legacy: broadcast current state
    broadcast({ type: "heroes-batch", payload: [...heroes.values()] });
  }
}

// ─── Orchestra Event Handling ─────────────────────────────────────────────────

function getOrCreateHeroId(runId: string, agentInstanceId: string): number {
  const key = `${runId}:${agentInstanceId}`;
  let heroId = heroIdMap.get(key);

  if (heroId === undefined) {
    heroId = nextHeroId++;
    heroIdMap.set(key, heroId);
  }

  return heroId;
}

function onOrchestraEventsAppended(appendedEvents: OrchestraEventInput[]) {
  for (const eventInput of appendedEvents) {
    // Validate and transform input to full OrchestraEvent
    try {
      const event = ValidatedOrchestraEventSchema.parse(eventInput);

      // Only process events that have agentInstanceId (agent/tool/message events)
      if (!event.agentInstanceId) {
        // Handle run-level events (no agentInstanceId needed)
        if (event.eventType === "run.ended") {
          // Clean up all heroes belonging to this run
          for (const [key, heroId] of heroIdMap.entries()) {
            if (key.startsWith(`${event.runId}:`)) {
              heroes.delete(heroId);
              heroIdMap.delete(key);
            }
          }
          broadcast({ type: "heroes-batch", payload: [...heroes.values()] });
          console.log(`[Orchestra] Run ended: cleaned up heroes for run ${event.runId}`);
        }
        continue;
      }

      const heroId = getOrCreateHeroId(event.runId, event.agentInstanceId);
      let hero = heroes.get(heroId);

      // Create hero if it doesn't exist
      if (!hero) {
        hero = createHero(heroId, {
          name: `${event.agentRole} #${event.agentInstanceId.slice(-4)}`,
          heroClass: event.agentRole as HeroClass,
          projectPath: event.runId,
          runId: event.runId,
          agentRole: event.agentRole,
          agentState: event.agentState,
        });
        broadcast({ type: "hero-new", payload: hero });
      }

      // Project event to hero delta
      const existingFields = {
        activeTools: hero.activeTools,
        exp: hero.exp,
        level: hero.level,
      };
      const delta = projectEventToHeroDelta(event, existingFields);

      // Apply delta to hero
      Object.assign(hero, delta);

      // Handle specific event types
      if (
        event.eventType === "tool.call.started" &&
        event.toolCallId &&
        event.toolName
      ) {
        // Update tool counts based on tool name
        const lower = event.toolName.toLowerCase();
        if (lower.includes("bash") || lower.includes("execute")) {
          hero.toolCount.bash++;
          hero.heroClass = detectHeroClass(hero.toolCount);
        } else if (lower.includes("read") || lower.includes("view")) {
          hero.toolCount.read++;
          hero.heroClass = detectHeroClass(hero.toolCount);
        } else if (
          lower.includes("write") ||
          lower.includes("edit") ||
          lower.includes("create")
        ) {
          hero.toolCount.write++;
          hero.heroClass = detectHeroClass(hero.toolCount);
        } else if (
          lower.includes("web") ||
          lower.includes("search") ||
          lower.includes("fetch")
        ) {
          hero.toolCount.web++;
          hero.heroClass = detectHeroClass(hero.toolCount);
        }
      }

      // Broadcast updates
      if (
        event.eventType === "agent.spawned" ||
        event.eventType === "agent.state.changed" ||
        event.eventType === "tool.call.started"
      ) {
        broadcast({ type: "hero-update", payload: hero });
      }

      if (delta.level && delta.level > hero.level) {
        broadcast({
          type: "hero-levelup",
          payload: { heroId, level: delta.level },
        });
        hero.level = delta.level;
      }
    } catch (error) {
      console.error("Error processing orchestra event:", error);
      // Skip invalid events
      continue;
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initializeWebSocket(server: unknown) {
  wss = new WebSocketServer({ server: server as any, path: "/api/ws/agents" });

  loadPersistedHeroes();

  wss.on("connection", ws => {
    console.log("[WebSocket] Client connected");

    // Send current hero state to new client
    const currentHeroes = demoHeroes || [...heroes.values()];
    ws.send(
      JSON.stringify({
        type: "heroes-batch",
        payload: currentHeroes,
      })
    );

    ws.on("message", data => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(msg);
      } catch (error) {
        console.warn("[WebSocket] Message parse error:", error);
    });

    ws.on("close", () => console.log("[WebSocket] Client disconnected"));
    ws.on("error", e => console.error("[WebSocket] Error:", e));
  });
}

export function getHeroes(): Hero[] {
  return [...heroes.values()];
}

// ─── Bridge Callbacks ─────────────────────────────────────────────────────────

export function getBroadcastCallbacks() {
  return {
    onHeroNew: (heroData: Record<string, unknown>) => {
      const hero = heroData as unknown as Hero;
      heroes.set(hero.id, hero);
      if (hero.id >= nextHeroId) nextHeroId = hero.id + 1;
      broadcast({ type: "hero-new", payload: hero });
      console.log(`[Bridge] New hero received: ${hero.name}`);
    },

    onHeroUpdate: (heroData: Record<string, unknown>) => {
      const hero = heroData as unknown as Hero;
      heroes.set(hero.id, hero);
      broadcast({ type: "hero-update", payload: hero });
    },

    onHeroesBatch: (heroesData: Record<string, unknown>[]) => {
      // Replace all heroes with the batch from the bridge
      heroes.clear();
      heroIdMap.clear();
      nextHeroId = 1;
      for (const heroData of heroesData) {
        const hero = heroData as unknown as Hero;
        heroes.set(hero.id, hero);
        if (hero.id >= nextHeroId) nextHeroId = hero.id + 1;
      }
      broadcast({ type: "heroes-batch", payload: [...heroes.values()] });
      console.log(`[Bridge] Received batch of ${heroesData.length} heroes`);
    },

    onHeroClear: () => {
      heroes.clear();
      heroIdMap.clear();
      nextHeroId = 1;
      broadcast({ type: "heroes-batch", payload: [] });
      console.log(`[Bridge] Heroes cleared`);
    },

    // New callback for orchestra events
    onOrchestraEventsAppended,
  };
}
