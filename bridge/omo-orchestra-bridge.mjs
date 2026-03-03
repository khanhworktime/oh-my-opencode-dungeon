#!/usr/bin/env node

/**
 * Oh My OpenCode Orchestra Bridge Producer
 * Reads JSON lines from stdin and POSTs batches to Orchestra Dungeon API
 */

import { createInterface } from "readline";
import { URL } from "url";
import https from "https";
import http from "http";

// Configuration from environment variables
const ORCHESTRA_DUNGEON_SERVER = process.env.ORCHESTRA_DUNGEON_SERVER;
const ORCHESTRA_DUNGEON_API_KEY = process.env.ORCHESTRA_DUNGEON_API_KEY;

// Constants
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 second base delay for exponential backoff

// Stable runId for this bridge session
const SESSION_RUN_ID = `omo-bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Validate required environment variables
if (!ORCHESTRA_DUNGEON_SERVER) {
  console.error(
    "Error: ORCHESTRA_DUNGEON_SERVER environment variable is required"
  );
  process.exit(1);
}

if (!ORCHESTRA_DUNGEON_API_KEY) {
  console.error(
    "Error: ORCHESTRA_DUNGEON_API_KEY environment variable is required"
  );
  process.exit(1);
}

// Ensure server URL ends with /api/bridge/events
const serverUrl = new URL("/api/bridge/events", ORCHESTRA_DUNGEON_SERVER);
const serverBaseUrl = new URL(ORCHESTRA_DUNGEON_SERVER);

// Global state for graceful shutdown
let shutdownRequested = false;
let pendingBatches = [];

/**
 * Validates an event object
 * @param {any} event - The event to validate
 * @returns {boolean} - Whether the event is valid
 */
/**
 * Transforms a raw input event into a valid OrchestraEvent envelope.
 * Accepts both already-valid Orchestra events and raw legacy events.
 * @param {any} raw - The raw event from stdin
 * @param {number} index - Line index for eventId fallback
 * @returns {object|null} - A valid OrchestraEvent or null if untransformable
 */
function transformEvent(raw, index) {
  if (typeof raw !== 'object' || raw === null) return null;

  // Already a valid Orchestra event — pass through, ensure runId is set
  if (raw.schemaVersion === 1 && raw.eventId && raw.eventType && raw.occurredAt) {
    return { ...raw, runId: raw.runId || SESSION_RUN_ID };
  }

  // ── OpenCode native --format json output ─────────────────────────────
  // Formats: { type, timestamp, sessionID, part: { tool, state, text, ... } }
  if (raw.sessionID && raw.type) {
    const sessionId = raw.sessionID;
    const ts = typeof raw.timestamp === 'number' ? raw.timestamp : Date.now();
    const base = {
      schemaVersion: 1,
      eventId: `bridge-oc-${SESSION_RUN_ID}-${index}-${Date.now()}`,
      occurredAt: ts,
      runId: sessionId,
      agentInstanceId: sessionId,
      agentRole: 'sisyphus',
      workspaceId: 'local',
    };

    switch (raw.type) {
      case 'step_start':
        return { ...base, eventType: 'agent.state.changed', agentState: 'executing' };

      case 'tool_use': {
        const part = raw.part || {};
        const toolName = part.tool || 'unknown';
        const status = part.state?.status;
        if (status === 'completed' || status === 'error') {
          return { ...base, eventType: 'tool.call.finished', toolCallId: `${sessionId}-tool-${index}`, toolName };
        }
        return { ...base, eventType: 'tool.call.started', toolCallId: `${sessionId}-tool-${index}`, toolName };
      }

      case 'text': {
        const text = raw.part?.text || '';
        return { ...base, eventType: 'agent.message.appended', message: String(text).slice(0, 200) };
      }

      case 'step_finish':
        return { ...base, eventType: 'agent.state.changed', agentState: 'idle' };

      // 'message.part.updated' = thinking/reasoning — map to planning state
      case 'message.part.updated': {
        const partType = raw.part?.type;
        if (partType === 'tool-invocation') {
          const toolName = raw.part?.toolInvocation?.toolName || 'unknown';
          return { ...base, eventType: 'tool.call.started', toolCallId: `${sessionId}-tool-${index}`, toolName };
        }
        return { ...base, eventType: 'agent.state.changed', agentState: 'planning' };
      }

      default:
        return { ...base, eventType: 'agent.message.appended', message: raw.type };
    }
  }

  // ── Legacy / generic format ──────────────────────────────────────────
  const eventType = raw.eventType || raw.type;
  if (!eventType || typeof eventType !== 'string') return null;

  const validEventTypes = [
    'run.started', 'run.ended', 'agent.spawned', 'agent.state.changed',
    'tool.call.started', 'tool.call.finished', 'agent.message.appended', 'delegation'
  ];
  const mappedType = validEventTypes.includes(eventType) ? eventType : 'agent.message.appended';

  return {
    schemaVersion: 1,
    eventId: raw.eventId || `bridge-${SESSION_RUN_ID}-${index}-${Date.now()}`,
    eventType: mappedType,
    occurredAt: typeof raw.occurredAt === 'number' ? raw.occurredAt
              : typeof raw.timestamp === 'number' ? raw.timestamp
              : Date.now(),
    workspaceId: raw.workspaceId || 'local',
    runId: raw.runId || SESSION_RUN_ID,
    agentInstanceId: raw.agentInstanceId || raw.instanceId || undefined,
    agentRole: raw.agentRole || raw.role || undefined,
    agentState: raw.agentState || raw.state || undefined,
    toolCallId: raw.toolCallId || undefined,
    toolName: raw.toolName || undefined,
    message: raw.message ? String(raw.message).slice(0, 200) : undefined,
    parentAgentInstanceId: raw.parentAgentInstanceId || undefined,
    payload: raw.payload || undefined,
  };
}

/**
 * Makes an HTTP request with proper error handling
 * @param {string} method - HTTP method
 * @param {URL} url - Target URL
 * @param {string} data - Request body as JSON string
 * @param {Object} headers - Request headers
 * @returns {Promise<{statusCode: number, headers: Object, body: string}>}
 */
function makeRequest(method, url, data, headers) {
  return new Promise((resolve, reject) => {
    const protocol = url.protocol === "https:" ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "x-bridge-api-key": ORCHESTRA_DUNGEON_API_KEY,
      },
      timeout: 30000, // 30 seconds timeout
    };

    const req = protocol.request(options, res => {
      let body = "";
      res.on("data", chunk => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on("error", error => {
      reject(error);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.write(data);
    req.end();
  });
}

/**
 * Sends a batch of events with retry logic
 * @param {Array} batch - Array of validated events
 * @param {number} attempt - Current retry attempt (1-based)
 * @returns {Promise<boolean>} - Whether the batch was sent successfully
 */
async function sendBatch(batch, attempt = 1) {
  if (shutdownRequested) {
    return false;
  }

  try {
    // Use the runId from the first event (all events in a batch share the same run)
    const runId = batch[0]?.runId || SESSION_RUN_ID;
    const requestData = JSON.stringify({ runId, events: batch });
    const response = await makeRequest("POST", serverUrl, requestData, {});

    // Handle successful response (2xx status codes)
    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log(`Successfully sent batch of ${batch.length} events`);
      return true;
    }

    // Handle rate limiting (429 status code)
    if (response.statusCode === 429) {
      const retryAfter = response.headers["retry-after"];
      if (retryAfter) {
        const delayMs = parseInt(retryAfter, 10) * 1000;
        if (!isNaN(delayMs) && delayMs > 0) {
          console.log(`Rate limited. Retrying after ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return sendBatch(batch, attempt);
        }
      }
    }

    // Handle server errors (5xx status codes) or client errors that might be retryable
    if (response.statusCode >= 500 || response.statusCode === 408) {
      throw new Error(`Server error: ${response.statusCode}`);
    }

    // Other client errors (4xx except 429, 408) are not retryable
    console.error(
      `Failed to send batch: ${response.statusCode} ${response.body}`
    );
    return false;
  } catch (error) {
    console.error(`Network error on attempt ${attempt}:`, error.message);

    // Check if we should retry
    if (attempt < MAX_RETRIES && !shutdownRequested) {
      // Exponential backoff with jitter
      const delayMs = Math.min(
        BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 1000,
        30000 // Max 30 seconds
      );
      console.log(
        `Retrying in ${Math.round(delayMs)}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return sendBatch(batch, attempt + 1);
    }

    console.error(`Failed to send batch after ${MAX_RETRIES} attempts`);
    return false;
  }
}

/**
 * Processes pending batches during shutdown
 */
async function processPendingBatches() {
  if (pendingBatches.length === 0) {
    return;
  }

  console.log(
    `Processing ${pendingBatches.length} pending batches before shutdown...`
  );
  const results = await Promise.all(
    pendingBatches.map(batch => sendBatch(batch))
  );

  const failedCount = results.filter(result => !result).length;
  if (failedCount > 0) {
    console.error(`${failedCount} batches failed to send before shutdown`);
  }
}

// Set up graceful shutdown handling
process.on("SIGINT", async () => {
  console.log("\nGraceful shutdown requested...");
  shutdownRequested = true;

  // Process any pending batches
  await processPendingBatches();

  console.log("Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nGraceful shutdown requested (SIGTERM)...");
  shutdownRequested = true;

  // Process any pending batches
  await processPendingBatches();

  console.log("Shutting down...");
  process.exit(0);
});

// Main execution
async function main() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  let currentBatch = [];
  let lineCount = 0;

  rl.on("line", line => {
    if (shutdownRequested) {
      return;
    }

    lineCount++;

    try {
      const raw = JSON.parse(line);
      const event = transformEvent(raw, lineCount);

      if (event) {
        currentBatch.push(event);

        // Send batch when it reaches the maximum size
        if (currentBatch.length >= BATCH_SIZE) {
          pendingBatches.push([...currentBatch]);
          currentBatch = [];
        }
      } else {
        console.error(`Skipping untransformable event on line ${lineCount}: ${line}`);
      }
    } catch (error) {
      console.error(`Invalid JSON on line ${lineCount}: ${line}`);
    }
  });

  rl.on("close", async () => {
    // Send any remaining events in the current batch
    if (currentBatch.length > 0) {
      pendingBatches.push([...currentBatch]);
    }

    // Process all pending batches
    if (pendingBatches.length > 0) {
      console.log(`Sending ${pendingBatches.length} final batch(es)...`);
      const results = await Promise.all(
        pendingBatches.map(batch => sendBatch(batch))
      );

      const failedCount = results.filter(result => !result).length;
      if (failedCount > 0) {
        console.error(`${failedCount} batches failed to send`);
        process.exitCode = 1;
      }
    }

    console.log("Finished processing all events");
  });
}

// Start the main process
main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
