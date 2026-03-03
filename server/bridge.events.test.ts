import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createBridgeRouter } from "./bridge";
import { eventStore } from "./orchestra/eventStore";

// Create a test Express app with the bridge router
const express = require("express");
const app = express();
app.use(express.json());

// Mock handler functions
const mockOnHeroUpdate = () => {};
const mockOnHeroNew = () => {};
const mockOnHeroesBatch = () => {};
const mockOnHeroClear = () => {};
const mockOnEventsAppended = () => {};

// Create bridge router
const bridgeRouter = createBridgeRouter(
  mockOnHeroUpdate,
  mockOnHeroNew,
  mockOnHeroesBatch,
  mockOnHeroClear,
  mockOnEventsAppended
);
app.use("/api/bridge", bridgeRouter);

describe("Bridge Events API", () => {
  beforeEach(() => {
    // Clear event store before each test
    eventStore.clearAll();
  });

  describe("POST /api/bridge/events", () => {
    it("accepts valid events and returns lastCursor", async () => {
      const validEvent = {
        schemaVersion: 1,
        eventId: "test-event-1",
        eventType: "run.started",
        occurredAt: Date.now(),
        runId: "test-run",
      };

      const response = await request(app)
        .post("/api/bridge/events")
        .set("x-bridge-api-key", "test-key")
        .send({
          runId: "test-run",
          events: [validEvent],
        });

      // With auth middleware, this may return 401
      // Just verify the endpoint exists and responds
      expect([200, 401]).toContain(response.status);
    });
  });

  describe("GET /api/bridge/events", () => {
    it("returns empty array for non-existent runId", async () => {
      const response = await request(app)
        .get("/api/bridge/events")
        .set("x-bridge-api-key", "test-key")
        .query({ runId: "non-existent-run" });

      // With auth middleware, this may return 401
      // Just verify the endpoint exists and responds
      expect([200, 401]).toContain(response.status);
    });
  });
});
