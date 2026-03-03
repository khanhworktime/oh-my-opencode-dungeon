import { z } from "zod";

// ─── Orchestra Event Envelope Schema (schemaVersion=1) ─────────────────────────

export const OrchestraEventSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().min(1), // ULID recommended for sortability
  eventType: z.enum([
    "run.started",
    "run.ended",
    "agent.spawned",
    "agent.state.changed",
    "tool.call.started",
    "tool.call.finished",
    "agent.message.appended",
    "delegation",
  ]),
  occurredAt: z.number(), // epoch ms
  workspaceId: z.string().default("local"),
  runId: z.string().min(1),
  agentInstanceId: z.string().optional(), // required for agent/tool/message/delegation events
  agentRole: z.string().optional(), // required for agent/tool/message events
  agentState: z.string().optional(), // required for agent.state.changed
  toolCallId: z.string().optional(), // required for tool.call.*
  toolName: z.string().optional(), // required for tool.call.*
  message: z.string().max(200).optional(), // redacted/truncated to 200 chars
  parentAgentInstanceId: z.string().optional(), // for delegation
  payload: z.record(z.string(), z.unknown()).optional(), // optional, MUST be small; never include secrets
});

// Ensure required fields are present based on eventType
export const ValidatedOrchestraEventSchema = OrchestraEventSchema.superRefine(
  (event, ctx) => {
    switch (event.eventType) {
      case "run.started":
      case "run.ended":
        // Only runId is required beyond base fields
        break;
      case "agent.spawned":
      case "agent.state.changed":
      case "agent.message.appended":
        if (!event.agentInstanceId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "agentInstanceId is required for agent events",
            path: ["agentInstanceId"],
          });
        }
        if (!event.agentRole) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "agentRole is required for agent events",
            path: ["agentRole"],
          });
        }
        if (event.eventType === "agent.state.changed" && !event.agentState) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "agentState is required for agent.state.changed events",
            path: ["agentState"],
          });
        }
        break;
      case "tool.call.started":
      case "tool.call.finished":
        if (!event.agentInstanceId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "agentInstanceId is required for tool events",
            path: ["agentInstanceId"],
          });
        }
        if (!event.agentRole) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "agentRole is required for tool events",
            path: ["agentRole"],
          });
        }
        if (!event.toolCallId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "toolCallId is required for tool call events",
            path: ["toolCallId"],
          });
        }
        if (!event.toolName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "toolName is required for tool call events",
            path: ["toolName"],
          });
        }
        break;
      case "delegation":
        if (!event.agentInstanceId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "agentInstanceId is required for delegation events",
            path: ["agentInstanceId"],
          });
        }
        if (!event.parentAgentInstanceId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "parentAgentInstanceId is required for delegation events",
            path: ["parentAgentInstanceId"],
          });
        }
        break;
    }
  }
);

export type OrchestraEventInput = z.input<typeof ValidatedOrchestraEventSchema>;
export type OrchestraEvent = z.output<typeof ValidatedOrchestraEventSchema>;

// ─── Hero Types (extended from existing) ──────────────────────────────────────

export type HeroClass =
  | "warrior"
  | "mage"
  | "cleric"
  | "sisyphus"
  | "prometheus"
  | "oracle"
  | "explore"
  | "librarian"
  | "hephaestus"
  | "atlas"
  | "momus"
  | "metis";

export type HeroState =
  | "idle"
  | "walking"
  | "fighting"
  | "casting"
  | "resting"
  | "shopping"
  | "hurt";

export type DungeonRoom =
  | "boss_arena"
  | "church"
  | "shop"
  | "rest_area"
  | "corridor";

// ─── Projection Rules ─────────────────────────────────────────────────────────

/**
 * Maps orchestra agent states to hero states
 */
const AGENT_STATE_TO_HERO_STATE: Record<string, HeroState> = {
  executing: "fighting",
  planning: "shopping",
  researching: "casting",
  reviewing: "resting",
  waiting: "resting",
  delegating: "idle",
  idle: "idle",
  done: "idle",
};

/**
 * Maps hero rooms to dungeon locations
 */
const HERO_ROOM_TO_DUNGEON_LOCATION: Record<string, DungeonRoom> = {
  church: "church",
  corridor: "corridor",
  boss_arena: "boss_arena",
  shop: "shop",
  rest_area: "rest_area",
};

/**
 * Maps hero states to dungeon rooms
 */
const HERO_STATE_TO_ROOM: Record<HeroState, DungeonRoom> = {
  shopping: "shop", // Planning chamber
  fighting: "boss_arena", // Forge (execution)
  casting: "shop", // Library (research)
  resting: "rest_area", // Review / idle
  idle: "rest_area",
  walking: "corridor", // Command center / transit
  hurt: "rest_area",
};

/**
 * Creates a hero name from agent role and instance ID
 */
function createHeroName(agentRole: string, agentInstanceId: string): string {
  return `${agentRole} #${agentInstanceId.slice(-4)}`;
}

/**
 * Projects an orchestra event to hero field updates
 */
export function projectEventToHeroDelta(
  event: OrchestraEvent,
  existingHeroFields: Partial<{
    activeTools: Array<{
      id: string;
      name: string;
      status: string;
      startedAt: number;
    }>;
    exp: number;
    level: number;
  }> = {}
): Partial<{
  heroClass: HeroClass;
  projectPath: string;
  state: HeroState;
  room: DungeonRoom;
  name: string;
  activeTools: Array<{
    id: string;
    name: string;
    status: string;
    startedAt: number;
  }>;
  exp: number;
  level: number;
}> {
  const delta: ReturnType<typeof projectEventToHeroDelta> = {};

  // Set runId as projectPath
  if (event.runId) {
    delta.projectPath = event.runId;
  }

  // Set hero class from agent role
  if (event.agentRole) {
    // Type assertion since we know agent roles map to extended HeroClass
    delta.heroClass = event.agentRole as HeroClass;

    // Set hero name
    if (event.agentInstanceId) {
      delta.name = createHeroName(event.agentRole, event.agentInstanceId);
    }
  }

  // Handle state changes
  if (event.agentState && event.eventType === "agent.state.changed") {
    const heroState = AGENT_STATE_TO_HERO_STATE[event.agentState] || "idle";
    delta.state = heroState;
    delta.room = HERO_STATE_TO_ROOM[heroState];
  }

  // Handle tool calls
  if (
    event.eventType === "tool.call.started" &&
    event.toolCallId &&
    event.toolName
  ) {
    const currentActiveTools = existingHeroFields.activeTools || [];
    const truncatedMessage = event.message
      ? event.message.length > 47
        ? event.message.substring(0, 47) + "..."
        : event.message
      : `Running ${event.toolName}`;

    delta.activeTools = [
      ...currentActiveTools,
      {
        id: event.toolCallId,
        name: event.toolName,
        status: truncatedMessage,
        startedAt: Date.now(),
      },
    ];

    // Add experience for tool call started
    const currentExp = existingHeroFields.exp || 0;
    const currentLevel = existingHeroFields.level || 1;
    const newExp = currentExp + 5;
    delta.exp = newExp;

    // Check for level up
    if (newExp >= currentLevel * 100) {
      delta.level = currentLevel + 1;
    }
  }

  if (event.eventType === "tool.call.finished" && event.toolCallId) {
    const currentActiveTools = existingHeroFields.activeTools || [];
    delta.activeTools = currentActiveTools.filter(
      tool => tool.id !== event.toolCallId
    );
  }

  // Handle agent done state - clear tools
  if (
    event.agentState === "done" &&
    event.eventType === "agent.state.changed"
  ) {
    delta.activeTools = [];
  }

  return delta;
}
