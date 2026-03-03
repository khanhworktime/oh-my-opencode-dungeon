/**
 * Oh My OpenCode Dungeon Bridge Plugin
 *
 * Forwards OpenCode session events to the dungeon visualization in real time.
 *
 * INSTALL (global — works for every OpenCode session):
 *   mkdir -p ~/.config/opencode/plugins
 *   cp plugins/dungeon-bridge.js ~/.config/opencode/plugins/dungeon-bridge.js
 *
 *   Then add to ~/.config/opencode/opencode.json:
 *   { "plugin": ["dungeon-bridge"] }
 *
 * CONFIGURE:
 *   export ORCHESTRA_DUNGEON_SERVER=http://localhost:3001
 *   export ORCHESTRA_DUNGEON_API_KEY=cpab_...
 *
 * How it works:
 *   OpenCode calls the `event` hook on every session event.
 *   This plugin maps them to Orchestra events and POSTs to /api/bridge/events.
 */

import https from "https";
import http from "http";
import { URL } from "url";

export const DungeonBridgePlugin = async ({ project }) => {
  const server = process.env.ORCHESTRA_DUNGEON_SERVER;
  const apiKey = process.env.ORCHESTRA_DUNGEON_API_KEY;

  if (!server || !apiKey) {
    // Plugin silently does nothing if env vars not set — no noise for users
    // who don't use the dungeon.
    return {};
  }

  const eventsUrl = new URL("/api/bridge/events", server);

  /**
   * Fire-and-forget POST to the dungeon server.
   * Errors are logged but never propagate to OpenCode.
   */
  function postEvents(runId, events) {
    const body = JSON.stringify({ runId, events });
    const protocol = eventsUrl.protocol === "https:" ? https : http;
    const options = {
      hostname: eventsUrl.hostname,
      port: eventsUrl.port || (eventsUrl.protocol === "https:" ? 443 : 80),
      path: eventsUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "x-bridge-api-key": apiKey,
      },
      timeout: 5000,
    };

    const req = protocol.request(options, res => {
      res.resume(); // drain the response body
    });
    req.on("error", err => {
      console.error("[dungeon-bridge] POST error:", err.message);
    });
    req.on("timeout", () => {
      req.destroy();
    });
    req.write(body);
    req.end();
  }

  // Per-session state: track active sessions so we can emit run.started once.
  const activeSessions = new Set();
  // Counter for unique eventIds
  let eventCounter = 0;
  const nextId = () => `oc-plugin-${Date.now()}-${++eventCounter}`;

  /**
   * Map an OpenCode event to one or more Orchestra events.
   * Returns an array of Orchestra event objects (may be empty if unmappable).
   */
  function mapEvent(sessionId, raw) {
    const now = Date.now();
    const base = {
      schemaVersion: 1,
      occurredAt: now,
      runId: sessionId,
      agentInstanceId: sessionId,
      agentRole: "sisyphus",
      workspaceId: "local",
    };

    const events = [];

    // Emit run.started + agent.spawned the first time we see a session
    if (!activeSessions.has(sessionId)) {
      activeSessions.add(sessionId);
      events.push({ ...base, eventId: nextId(), eventType: "run.started" });
      events.push({ ...base, eventId: nextId(), eventType: "agent.spawned" });
    }

    const type = raw.type;

    switch (type) {
      case "session.idle":
        events.push({
          ...base,
          eventId: nextId(),
          eventType: "agent.state.changed",
          agentState: "idle",
        });
        break;

      case "session.status":
        if (raw.status) {
          events.push({
            ...base,
            eventId: nextId(),
            eventType: "agent.state.changed",
            agentState: raw.status === "running" ? "executing" : raw.status,
          });
        }
        break;

      case "tool.execute.before": {
        const toolName = raw.tool?.id || raw.toolId || "unknown";
        events.push({
          ...base,
          eventId: nextId(),
          eventType: "tool.call.started",
          toolCallId: `${sessionId}-${toolName}-${eventCounter}`,
          toolName,
        });
        break;
      }

      case "tool.execute.after": {
        const toolName = raw.tool?.id || raw.toolId || "unknown";
        events.push({
          ...base,
          eventId: nextId(),
          eventType: "tool.call.finished",
          toolCallId: `${sessionId}-${toolName}-${eventCounter}`,
          toolName,
        });
        // Return to executing state after tool finishes
        events.push({
          ...base,
          eventId: nextId(),
          eventType: "agent.state.changed",
          agentState: "executing",
        });
        break;
      }

      case "message.part.updated":
        // Reasoning / thinking update → planning state
        if (raw.part?.type === "reasoning" || raw.part?.type === "thinking") {
          events.push({
            ...base,
            eventId: nextId(),
            eventType: "agent.state.changed",
            agentState: "planning",
          });
        }
        break;

      case "message.updated":
        events.push({
          ...base,
          eventId: nextId(),
          eventType: "agent.state.changed",
          agentState: "executing",
        });
        break;

      case "session.deleted":
      case "session.error":
        events.push({
          ...base,
          eventId: nextId(),
          eventType: "run.ended",
        });
        activeSessions.delete(sessionId);
        break;

      default:
        // Unknown event types are silently ignored
        break;
    }

    return events;
  }

  return {
    /**
     * OpenCode calls this for every event in a session.
     * https://opencode.ai/docs/plugins/#events
     */
    event: async ({ event }) => {
      try {
        const sessionId = event.sessionID || event.sessionId || event.runId;
        if (!sessionId) return;

        const orchestra = mapEvent(sessionId, event);
        if (orchestra.length > 0) {
          postEvents(sessionId, orchestra);
        }
      } catch (err) {
        console.error("[dungeon-bridge] event handler error:", err.message);
      }
    },
  };
};
