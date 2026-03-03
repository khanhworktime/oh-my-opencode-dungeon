import { OrchestraEvent } from "../../shared/orchestraEvent";
import * as fs from "fs";
import * as path from "path";
import os from "os";

/**
 * EventRecord extends OrchestraEvent with metadata for storage
 */
export interface EventRecord extends OrchestraEvent {
  cursor: number;
  ingestedAt: number;
}

export interface AppendResult {
  appendedCount: number;
  skippedCount: number;
  newCursor: number;
}

/**
 * EventStore maintains in-memory event storage with optional JSONL persistence
 * Features:
 * - Cursor ordering per runId
 * - Idempotency by eventId
 * - Ring buffer retention (default 500 events per run)
 * - Optional JSONL persistence to ~/.claude-dungeon/events/<runId>.jsonl
 */
export class EventStore {
  private events: Map<string, EventRecord[]> = new Map();
  private nextCursor: Map<string, number> = new Map();
  private readonly maxEventsPerRun: number;
  private readonly persistenceDir: string;

  constructor(options: { maxEventsPerRun?: number; enablePersistence?: boolean } = {}) {
    this.maxEventsPerRun = options.maxEventsPerRun ?? 500;
    this.persistenceDir = path.join(os.homedir(), ".claude-dungeon", "events");
    
    if (options.enablePersistence !== false) {
      // Ensure persistence directory exists
      try {
        fs.mkdirSync(this.persistenceDir, { recursive: true });
      } catch (error) {
        console.warn(`Failed to create persistence directory: ${error}`);
      }
    }
  }

  /**
   * Append events to a run's event stream
   * - Assigns sequential cursor per runId
   * - Deduplicates by eventId (skips if already exists)
   * - Maintains ring buffer (drops oldest when exceeding maxEventsPerRun)
   * - Optionally persists to JSONL (best-effort, fire-and-forget)
   */
  appendEvents(runId: string, events: OrchestraEvent[]): AppendResult {
    if (!runId || !Array.isArray(events)) {
      throw new Error("Invalid input: runId and events array are required");
    }

    let runEvents = this.events.get(runId) || [];
    let currentCursor = this.nextCursor.get(runId) || 0;
    let appendedCount = 0;
    let skippedCount = 0;

    // Track existing eventIds for deduplication
    const existingEventIds = new Set(runEvents.map(e => e.eventId));

    const newRecords: EventRecord[] = [];
    
    for (const event of events) {
      if (existingEventIds.has(event.eventId)) {
        skippedCount++;
        continue;
      }

      currentCursor++;
      const record: EventRecord = {
        ...event,
        cursor: currentCursor,
        ingestedAt: Date.now(),
      };
      
      newRecords.push(record);
      existingEventIds.add(event.eventId);
      appendedCount++;
    }

    if (newRecords.length > 0) {
      // Add new records to the run's events
      runEvents = [...runEvents, ...newRecords];
      
      // Apply ring buffer: keep only the most recent events
      if (runEvents.length > this.maxEventsPerRun) {
        const startIndex = runEvents.length - this.maxEventsPerRun;
        runEvents = runEvents.slice(startIndex);
        // Update cursor to reflect the new starting point
        currentCursor = runEvents[runEvents.length - 1].cursor;
      }
      
      this.events.set(runId, runEvents);
      this.nextCursor.set(runId, currentCursor);
      
      // Persist to JSONL (best-effort, fire-and-forget)
      this.persistEvents(runId, newRecords).catch(error => {
        console.warn(`Failed to persist events for run ${runId}:`, error);
      });
    }

    return {
      appendedCount,
      skippedCount,
      newCursor: currentCursor,
    };
  }

  /**
   * Get events for a runId with cursor-based pagination
   * @param runId - The run identifier
   * @param sinceCursor - Return events with cursor > sinceCursor (exclusive)
   * @param limit - Maximum number of events to return (default: all available)
   */
  getEvents(runId: string, sinceCursor?: number, limit?: number): EventRecord[] {
    if (!runId) {
      throw new Error("runId is required");
    }

    const runEvents = this.events.get(runId) || [];
    
    if (runEvents.length === 0) {
      return [];
    }

    // Filter events by cursor if sinceCursor is provided
    let filteredEvents = sinceCursor !== undefined
      ? runEvents.filter(event => event.cursor > sinceCursor)
      : runEvents;

    // Apply limit if specified
    if (limit !== undefined && limit > 0) {
      filteredEvents = filteredEvents.slice(0, limit);
    }

    return filteredEvents;
  }

  /**
   * Get the current cursor for a runId
   */
  getCurrentCursor(runId: string): number {
    return this.nextCursor.get(runId) || 0;
  }

  /**
   * Persist events to JSONL file (best-effort, fire-and-forget)
   */
  private async persistEvents(runId: string, records: EventRecord[]): Promise<void> {
    if (!this.persistenceDir) {
      return;
    }

    const safeRunId = runId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
    const filePath = path.join(this.persistenceDir, `${safeRunId}.jsonl`);
    const lines = records.map(record => JSON.stringify(record) + "\n");
    const data = lines.join("");

    // Append to file (create if doesn't exist)
    await fs.promises.appendFile(filePath, data, { encoding: "utf8" });
  }

  /**
   * Clear all events for a specific runId
   */
  clearRun(runId: string): void {
    this.events.delete(runId);
    this.nextCursor.delete(runId);
  }

  /**
   * Clear all stored events
   */
  clearAll(): void {
    this.events.clear();
    this.nextCursor.clear();
  }
}

// Export default instance for convenience
export const eventStore = new EventStore();
