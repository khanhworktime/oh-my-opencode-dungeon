import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { EventStore, EventRecord } from "./eventStore";
import { OrchestraEvent } from "../../shared/orchestraEvent";

describe("EventStore", () => {
  let eventStore: EventStore;
  const mockRunId = "test-run-123";

  // Create valid test events
  const createTestEvent = (
    eventId: string,
    eventType: OrchestraEvent["eventType"] = "run.started"
  ): OrchestraEvent => ({
    schemaVersion: 1,
    eventId,
    eventType,
    occurredAt: Date.now(),
    runId: mockRunId,
    message: `Test event ${eventId}`,
  });

  beforeEach(() => {
    eventStore = new EventStore({ maxEventsPerRun: 5 });
  });

  afterEach(() => {
    eventStore.clearAll();
  });

  describe("appendEvents", () => {
    it("throws error for invalid input", () => {
      expect(() => eventStore.appendEvents("", [])).toThrow("Invalid input");
      expect(() => eventStore.appendEvents(mockRunId, null as any)).toThrow(
        "Invalid input"
      );
      expect(() =>
        eventStore.appendEvents(mockRunId, undefined as any)
      ).toThrow("Invalid input");
    });

    it("appends events with sequential cursors per runId", () => {
      const event1 = createTestEvent("event-1");
      const event2 = createTestEvent("event-2");

      const result1 = eventStore.appendEvents(mockRunId, [event1]);
      const result2 = eventStore.appendEvents(mockRunId, [event2]);

      expect(result1.appendedCount).toBe(1);
      expect(result1.skippedCount).toBe(0);
      expect(result1.newCursor).toBe(1);

      expect(result2.appendedCount).toBe(1);
      expect(result2.skippedCount).toBe(0);
      expect(result2.newCursor).toBe(2);

      const events = eventStore.getEvents(mockRunId);
      expect(events).toHaveLength(2);
      expect(events[0].cursor).toBe(1);
      expect(events[1].cursor).toBe(2);
      expect(events[0].eventId).toBe("event-1");
      expect(events[1].eventId).toBe("event-2");
    });

    it("handles multiple runIds independently", () => {
      const runId1 = "run-1";
      const runId2 = "run-2";

      const event1 = createTestEvent("event-1");
      event1.runId = runId1;
      const event2 = createTestEvent("event-2");
      event2.runId = runId2;

      eventStore.appendEvents(runId1, [event1]);
      eventStore.appendEvents(runId2, [event2]);

      const events1 = eventStore.getEvents(runId1);
      const events2 = eventStore.getEvents(runId2);

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
      expect(events1[0].cursor).toBe(1);
      expect(events2[0].cursor).toBe(1);
    });

    it("deduplicates by eventId (idempotency)", () => {
      const event1 = createTestEvent("event-1");
      const duplicateEvent1 = createTestEvent("event-1");

      const result1 = eventStore.appendEvents(mockRunId, [event1]);
      const result2 = eventStore.appendEvents(mockRunId, [duplicateEvent1]);

      expect(result1.appendedCount).toBe(1);
      expect(result1.skippedCount).toBe(0);

      expect(result2.appendedCount).toBe(0);
      expect(result2.skippedCount).toBe(1);

      const events = eventStore.getEvents(mockRunId);
      expect(events).toHaveLength(1);
      expect(events[0].eventId).toBe("event-1");
    });

    it("handles mixed new and duplicate events", () => {
      const event1 = createTestEvent("event-1");
      const event2 = createTestEvent("event-2");
      const duplicateEvent1 = createTestEvent("event-1");
      const event3 = createTestEvent("event-3");

      // First append
      const result1 = eventStore.appendEvents(mockRunId, [event1, event2]);
      expect(result1.appendedCount).toBe(2);
      expect(result1.skippedCount).toBe(0);

      // Second append with duplicates and new
      const result2 = eventStore.appendEvents(mockRunId, [
        duplicateEvent1,
        event3,
      ]);
      expect(result2.appendedCount).toBe(1);
      expect(result2.skippedCount).toBe(1);

      const events = eventStore.getEvents(mockRunId);
      expect(events).toHaveLength(3);
      expect(events.map(e => e.eventId)).toEqual([
        "event-1",
        "event-2",
        "event-3",
      ]);
    });

    it("adds ingestedAt timestamp to stored events", () => {
      const before = Date.now();
      const event = createTestEvent("event-1");
      eventStore.appendEvents(mockRunId, [event]);
      const after = Date.now();

      const events = eventStore.getEvents(mockRunId);
      expect(events[0].ingestedAt).toBeGreaterThanOrEqual(before);
      expect(events[0].ingestedAt).toBeLessThanOrEqual(after);
    });
  });

  describe("getEvents", () => {
    it("throws error for missing runId", () => {
      expect(() => eventStore.getEvents("")).toThrow("runId is required");
    });

    it("returns empty array for non-existent runId", () => {
      const events = eventStore.getEvents("non-existent-run");
      expect(events).toHaveLength(0);
    });

    it("returns all events when no sinceCursor provided", () => {
      const event1 = createTestEvent("event-1");
      const event2 = createTestEvent("event-2");
      eventStore.appendEvents(mockRunId, [event1, event2]);

      const events = eventStore.getEvents(mockRunId);
      expect(events).toHaveLength(2);
      expect(events.map(e => e.eventId)).toEqual(["event-1", "event-2"]);
    });

    it("returns events after sinceCursor (exclusive)", () => {
      const event1 = createTestEvent("event-1");
      const event2 = createTestEvent("event-2");
      const event3 = createTestEvent("event-3");
      eventStore.appendEvents(mockRunId, [event1, event2, event3]);

      const events = eventStore.getEvents(mockRunId, 1);
      expect(events).toHaveLength(2);
      expect(events.map(e => e.eventId)).toEqual(["event-2", "event-3"]);
      expect(events[0].cursor).toBe(2);
      expect(events[1].cursor).toBe(3);
    });

    it("respects limit parameter", () => {
      const eventsToAppend = Array.from({ length: 5 }, (_, i) =>
        createTestEvent(`event-${i + 1}`)
      );
      eventStore.appendEvents(mockRunId, eventsToAppend);

      const events = eventStore.getEvents(mockRunId, undefined, 3);
      expect(events).toHaveLength(3);
      expect(events.map(e => e.eventId)).toEqual([
        "event-1",
        "event-2",
        "event-3",
      ]);
    });

    it("combines sinceCursor and limit correctly", () => {
      const eventsToAppend = Array.from({ length: 5 }, (_, i) =>
        createTestEvent(`event-${i + 1}`)
      );
      eventStore.appendEvents(mockRunId, eventsToAppend);

      const events = eventStore.getEvents(mockRunId, 1, 2);
      expect(events).toHaveLength(2);
      expect(events.map(e => e.eventId)).toEqual(["event-2", "event-3"]);
    });
  });

  describe("ring buffer retention", () => {
    it("maintains maxEventsPerRun limit", () => {
      // Append more events than the limit (5)
      const eventsToAppend = Array.from({ length: 7 }, (_, i) =>
        createTestEvent(`event-${i + 1}`)
      );
      eventStore.appendEvents(mockRunId, eventsToAppend);

      const events = eventStore.getEvents(mockRunId);
      expect(events).toHaveLength(5);
      // Should keep the last 5 events (event-3 through event-7)
      expect(events.map(e => e.eventId)).toEqual([
        "event-3",
        "event-4",
        "event-5",
        "event-6",
        "event-7",
      ]);

      // Current cursor should be 7 (from the last appended event)
      expect(eventStore.getCurrentCursor(mockRunId)).toBe(7);
    });

    it("works with single appends exceeding limit", () => {
      // First append 3 events
      const firstBatch = Array.from({ length: 3 }, (_, i) =>
        createTestEvent(`event-${i + 1}`)
      );
      eventStore.appendEvents(mockRunId, firstBatch);

      // Then append 4 more (total would be 7, should keep last 5)
      const secondBatch = Array.from({ length: 4 }, (_, i) =>
        createTestEvent(`event-${i + 4}`)
      );
      eventStore.appendEvents(mockRunId, secondBatch);

      const events = eventStore.getEvents(mockRunId);
      expect(events).toHaveLength(5);
      expect(events.map(e => e.eventId)).toEqual([
        "event-3",
        "event-4",
        "event-5",
        "event-6",
        "event-7",
      ]);
    });

    it("handles duplicates correctly with ring buffer", () => {
      // Fill up to limit
      const initialEvents = Array.from({ length: 5 }, (_, i) =>
        createTestEvent(`event-${i + 1}`)
      );
      eventStore.appendEvents(mockRunId, initialEvents);

      // Try to append with duplicates and new events
      const newEvents = [
        createTestEvent("event-3"), // duplicate
        createTestEvent("event-6"), // new
        createTestEvent("event-7"), // new
      ];
      eventStore.appendEvents(mockRunId, newEvents);

      const events = eventStore.getEvents(mockRunId);
      expect(events).toHaveLength(5);
      // Should have: event-3 (original), event-4, event-5, event-6, event-7
      expect(events.map(e => e.eventId)).toEqual([
        "event-3",
        "event-4",
        "event-5",
        "event-6",
        "event-7",
      ]);
    });
  });

  describe("utility methods", () => {
    it("getCurrentCursor returns correct cursor", () => {
      expect(eventStore.getCurrentCursor(mockRunId)).toBe(0);

      const event1 = createTestEvent("event-1");
      eventStore.appendEvents(mockRunId, [event1]);
      expect(eventStore.getCurrentCursor(mockRunId)).toBe(1);

      const event2 = createTestEvent("event-2");
      eventStore.appendEvents(mockRunId, [event2]);
      expect(eventStore.getCurrentCursor(mockRunId)).toBe(2);
    });

    it("clearRun removes specific run data", () => {
      const event1 = createTestEvent("event-1");
      eventStore.appendEvents(mockRunId, [event1]);

      const otherRunId = "other-run";
      const event2 = createTestEvent("event-2");
      event2.runId = otherRunId;
      eventStore.appendEvents(otherRunId, [event2]);

      expect(eventStore.getEvents(mockRunId)).toHaveLength(1);
      expect(eventStore.getEvents(otherRunId)).toHaveLength(1);

      eventStore.clearRun(mockRunId);

      expect(eventStore.getEvents(mockRunId)).toHaveLength(0);
      expect(eventStore.getEvents(otherRunId)).toHaveLength(1);
      expect(eventStore.getCurrentCursor(mockRunId)).toBe(0);
    });

    it("clearAll removes all data", () => {
      const event1 = createTestEvent("event-1");
      eventStore.appendEvents(mockRunId, [event1]);

      const otherRunId = "other-run";
      const event2 = createTestEvent("event-2");
      event2.runId = otherRunId;
      eventStore.appendEvents(otherRunId, [event2]);

      expect(eventStore.getEvents(mockRunId)).toHaveLength(1);
      expect(eventStore.getEvents(otherRunId)).toHaveLength(1);

      eventStore.clearAll();

      expect(eventStore.getEvents(mockRunId)).toHaveLength(0);
      expect(eventStore.getEvents(otherRunId)).toHaveLength(0);
    });
  });
});
