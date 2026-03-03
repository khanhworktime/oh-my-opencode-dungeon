/**
 * Bridge API - Receives data from local Claude Code Bridge script
 *
 * The local bridge script runs on the user's machine, watches ~/.claude/projects/
 * and POSTs hero updates to this endpoint. This allows the cloud-hosted web app
 * to display real-time Claude Code activity without direct filesystem access.
 *
 * Security: protected by a shared API key stored in ~/.claude-dungeon/config.json
 */

import { z } from "zod";
import { OrchestraEventInput, ValidatedOrchestraEventSchema } from "../shared/orchestraEvent";
import { Router, Request, Response } from "express";
import { eventStore } from "./orchestra/eventStore";
import rateLimit from "express-rate-limit";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";



const DATA_DIR = path.join(os.homedir(), ".claude-dungeon");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

// ─── Config helpers ───────────────────────────────────────────────────────────

interface Config {
  bridgeApiKey?: string;
  claudeDir?: string;
}

function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function saveConfig(config: Config) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
function getOrCreateApiKey(): string {
  const config = loadConfig();
  if (config.bridgeApiKey) return config.bridgeApiKey;
  // Generate a cryptographically secure API key
  const key = "cpab_" + crypto.randomBytes(32).toString("hex");
  saveConfig({ ...config, bridgeApiKey: key });
  return key;
}


// ─── Zod schemas for bridge POST endpoints ─────────────────────────────────────

export const HeroesBatchSchema = z.object({
  heroes: z.array(z.record(z.string(), z.unknown())),
});

export const HeroUpdateSchema = z.object({
  hero: z.record(z.string(), z.unknown()),
  event: z.enum(["new", "update"]),
});

export const ClearSchema = z.object({});
export const EventsBatchSchema = z.object({
  runId: z.string().min(1),
  events: z.array(ValidatedOrchestraEventSchema),
});
// ─── Rate limiting ─────────────────────────────────────────────────────────────

const eventsRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests, please try again later",
  },
});



// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireBridgeKey(req: Request, res: Response, next: () => void) {
  const key = req.headers["x-bridge-api-key"] as string | undefined;
  const validKey = getOrCreateApiKey();
  if (!key || key !== validKey) {
    res.status(401).json({ error: "Invalid or missing bridge API key" });
    return;
  }
  next();
}

// ─── Bridge router ────────────────────────────────────────────────────────────

export function createBridgeRouter(
  onHeroUpdate: (hero: Record<string, unknown>) => void,
  onHeroNew: (hero: Record<string, unknown>) => void,
  onHeroesBatch: (heroes: Record<string, unknown>[]) => void,
  onHeroClear: () => void,
  onEventsAppended: (events: OrchestraEventInput[]) => void,
) {
  const router = Router();
  // The callback is called directly in the POST /api/bridge/events endpoint
  const eventsAppendedCallback = onEventsAppended;
  // The callback is called directly in the POST /api/bridge/events endpoint
  // The callback is called directly in the POST /api/bridge/events endpoint


  /**
   * GET /api/bridge/status
   * Returns bridge connection status and API key info
   */
  router.get("/status", (_req: Request, res: Response) => {
    const config = loadConfig();
    res.json({
      ok: true,
      hasApiKey: !!config.bridgeApiKey,
      apiKeyPrefix: config.bridgeApiKey ? config.bridgeApiKey.slice(0, 10) + "..." : null,
    });
  });

  /**
   * GET /api/bridge/key
   * Returns (or creates) the bridge API key — only accessible from localhost
   */
  router.get("/key", (req: Request, res: Response) => {
    const host = req.hostname;
    // Allow localhost access only
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      res.status(403).json({ error: "API key endpoint only accessible from localhost" });
      return;
    }
    const key = getOrCreateApiKey();
    res.json({ apiKey: key });
  });

  /**
   * POST /api/bridge/heroes
   * Receive a batch of heroes from the local bridge script
   * Body: { heroes: Hero[] }
   */
  router.post("/heroes", requireBridgeKey, (req: Request, res: Response) => {
    const parsed = HeroesBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { heroes } = parsed.data;
    onHeroesBatch(heroes);
    res.json({ ok: true, count: heroes.length });
  });

  /**
   * POST /api/bridge/hero
   * Receive a single hero update from the local bridge script
   * Body: { hero: Hero, event: "new" | "update" }
   */
  router.post("/hero", requireBridgeKey, (req: Request, res: Response) => {
    const parsed = HeroUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { hero, event } = parsed.data;
    if (event === "new") {
      onHeroNew(hero);
    } else {
      onHeroUpdate(hero);
    }
    res.json({ ok: true });
  });

  /**
   * POST /api/bridge/clear
   * Clear all heroes (e.g., when bridge disconnects)
   */
  router.post("/clear", requireBridgeKey, (req: Request, res: Response) => {
    const parsed = ClearSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    onHeroClear();
    res.json({ ok: true });
  });
  /**
   * POST /api/bridge/events
   * Receive a batch of orchestra events from the bridge
   * Body: { runId: string, events: OrchestraEventInput[] }
   */
  router.post(
    "/events",
    requireBridgeKey,
    eventsRateLimiter,
    async (req: Request, res: Response) => {
      const parsed = EventsBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        // Return detailed validation errors
        const errorMessages = parsed.error.issues.map(issue => ({
          path: issue.path.join("."),
          message: issue.message,
        }));
        res.status(400).json({
          error: "Validation failed",
          details: errorMessages,
        });
        return;
      }

      const { runId, events } = parsed.data;
      try {
        // Store events in the event store
        eventStore.appendEvents(runId, events);
        // Notify websocket server of new events
        eventsAppendedCallback(events);
        res.json({ ok: true, count: events.length });
      } catch (error) {
        console.error("[Bridge] Failed to append events:", error);
        res.status(500).json({ error: "Internal server error" });
        return;
      }
    },
  );





  /**
   * GET /api/bridge/events
   * Replay events for a specific runId with cursor-based pagination
   * Query params: runId (required), sinceCursor (optional), limit (optional, default 100)
   */
  router.get("/events", requireBridgeKey, async (req: Request, res: Response) => {
    const { runId, sinceCursor, limit } = req.query;
    
    if (!runId || typeof runId !== "string") {
      res.status(400).json({ error: "runId is required" });
      return;
    }

    const sinceCursorNum = sinceCursor ? parseInt(sinceCursor as string, 10) : 0;
    const limitNum = limit ? Math.min(parseInt(limit as string, 10), 1000) : 100; // cap at 1000
    
    if (isNaN(sinceCursorNum) || sinceCursorNum < 0) {
      res.status(400).json({ error: "sinceCursor must be a non-negative integer" });
      return;
    }
    
    if (isNaN(limitNum) || limitNum <= 0) {
      res.status(400).json({ error: "limit must be a positive integer" });
      return;
    }

    try {
      const events = eventStore.getEvents(runId, sinceCursorNum || undefined, limitNum);
      res.json({ events: events });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
    }
  });

  return router;
}

export { getOrCreateApiKey, loadConfig, saveConfig };
