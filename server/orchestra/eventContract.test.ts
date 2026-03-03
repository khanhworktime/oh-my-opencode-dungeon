import { describe, expect, it } from "vitest";
import {
  OrchestraEventSchema,
  ValidatedOrchestraEventSchema,
  projectEventToHeroDelta,
} from "../../shared/orchestraEvent";

describe("OrchestraEvent contract", () => {
  describe("schema validation", () => {
    it("accepts valid run.started event", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000000",
        eventType: "run.started",
        occurredAt: Date.now(),
        runId: "run-demo-001",
      };

      expect(() => ValidatedOrchestraEventSchema.parse(event)).not.toThrow();
    });

    it("accepts valid agent.state.changed event", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000001",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        agentState: "planning",
        message: "Planning: build event contract",
      };

      expect(() => ValidatedOrchestraEventSchema.parse(event)).not.toThrow();
    });

    it("accepts valid tool.call.started event", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000002",
        eventType: "tool.call.started",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        toolCallId: "tool-call-1",
        toolName: "bash",
        message: "Running: npm install",
      };

      expect(() => ValidatedOrchestraEventSchema.parse(event)).not.toThrow();
    });

    it("rejects agent.state.changed without agentInstanceId", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000001",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        // missing agentInstanceId
        agentRole: "prometheus",
        agentState: "planning",
      };

      expect(() => ValidatedOrchestraEventSchema.parse(event)).toThrow();
    });

    it("rejects tool.call.started without toolCallId", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000002",
        eventType: "tool.call.started",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        // missing toolCallId
        toolName: "bash",
        message: "Running: npm install",
      };

      expect(() => ValidatedOrchestraEventSchema.parse(event)).toThrow();
    });

    it("truncates message to 200 chars max", () => {
      const longMessage = "x".repeat(250);
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000001",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        agentState: "planning",
        message: longMessage,
      };

      expect(() => ValidatedOrchestraEventSchema.parse(event)).toThrow();
    });

    it("accepts message exactly 200 chars", () => {
      const exactMessage = "x".repeat(200);
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000001",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        agentState: "planning",
        message: exactMessage,
      };

      expect(() => ValidatedOrchestraEventSchema.parse(event)).not.toThrow();
    });
  });

  describe("projection rules", () => {
    it("maps planning state to shopping hero state and church room", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000001",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        agentState: "planning",
        message: "Planning: build event contract",
      };

      const delta = projectEventToHeroDelta(event);
      expect(delta.state).toBe("shopping");
      expect(delta.room).toBe("church");
    });

    it("maps executing state to fighting hero state and boss_arena room", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000001",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        agentState: "executing",
        message: "Executing: build event contract",
      };

      const delta = projectEventToHeroDelta(event);
      expect(delta.state).toBe("fighting");
      expect(delta.room).toBe("boss_arena");
    });

    it("maps researching state to casting hero state and shop room", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000001",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        agentState: "researching",
        message: "Researching: build event contract",
      };

      const delta = projectEventToHeroDelta(event);
      expect(delta.state).toBe("casting");
      expect(delta.room).toBe("shop");
    });

    it("maps reviewing/waiting state to resting hero state and rest_area room", () => {
      const event1 = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000001",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        agentState: "reviewing",
        message: "Reviewing: build event contract",
      };

      const delta1 = projectEventToHeroDelta(event1);
      expect(delta1.state).toBe("resting");
      expect(delta1.room).toBe("rest_area");

      const event2 = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000002",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        agentState: "waiting",
        message: "Waiting: for response",
      };

      const delta2 = projectEventToHeroDelta(event2);
      expect(delta2.state).toBe("resting");
      expect(delta2.room).toBe("rest_area");
    });

    it("maps delegating/idle/done state to idle hero state", () => {
      const states = ["delegating", "idle", "done"];
      for (const state of states) {
        const event = {
          schemaVersion: 1,
          eventId: "01J0TESTEVENT00000000000001",
          eventType: "agent.state.changed",
          occurredAt: Date.now(),
          runId: "run-demo-001",
          agentInstanceId: "prometheus-1",
          agentRole: "prometheus",
          agentState: state,
          message: `${state}: build event contract`,
        };

        const delta = projectEventToHeroDelta(event);
        expect(delta.state).toBe("idle");
        expect(delta.room).toBe("rest_area");
      }
    });

    it("adds active tool on tool.call.started", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000002",
        eventType: "tool.call.started",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        toolCallId: "tool-call-1",
        toolName: "bash",
        message: "Running: npm install",
      };

      const delta = projectEventToHeroDelta(event);
      expect(delta.activeTools).toHaveLength(1);
      expect(delta.activeTools?.[0]).toEqual({
        id: "tool-call-1",
        name: "bash",
        status: "Running: npm install",
        startedAt: expect.any(Number),
      });
    });

    it("truncates long tool message to 50 chars", () => {
      const longMessage = "Running: " + "x".repeat(100);
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000002",
        eventType: "tool.call.started",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        toolCallId: "tool-call-1",
        toolName: "bash",
        message: longMessage,
      };
      const delta = projectEventToHeroDelta(event);
      expect(delta.activeTools?.[0].status).toBe(
        "Running: " + "x".repeat(38) + "..."
      );
    });

    it("removes active tool on tool.call.finished", () => {
      const existingActiveTools = [
        {
          id: "tool-call-1",
          name: "bash",
          status: "Running",
          startedAt: Date.now() - 1000,
        },
        {
          id: "tool-call-2",
          name: "web",
          status: "Searching",
          startedAt: Date.now() - 500,
        },
      ];

      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000003",
        eventType: "tool.call.finished",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        toolCallId: "tool-call-1",
        toolName: "bash",
        message: "Finished: npm install",
      };

      const delta = projectEventToHeroDelta(event, {
        activeTools: existingActiveTools,
      });
      expect(delta.activeTools).toHaveLength(1);
      expect(delta.activeTools?.[0].id).toBe("tool-call-2");
    });

    it("adds 5 exp on tool.call.started", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000002",
        eventType: "tool.call.started",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        toolCallId: "tool-call-1",
        toolName: "bash",
        message: "Running: npm install",
      };

      const delta = projectEventToHeroDelta(event, { exp: 10, level: 1 });
      expect(delta.exp).toBe(15);
    });

    it("levels up when exp >= level*100", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000002",
        eventType: "tool.call.started",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        toolCallId: "tool-call-1",
        toolName: "bash",
        message: "Running: npm install",
      };

      // At 95 exp, level 1, adding 5 should reach 100 and trigger level up
      const delta = projectEventToHeroDelta(event, { exp: 95, level: 1 });
      expect(delta.exp).toBe(100);
      expect(delta.level).toBe(2);
    });

    it("sets heroClass from agentRole", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000001",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        agentState: "planning",
        message: "Planning: build event contract",
      };

      const delta = projectEventToHeroDelta(event);
      expect(delta.heroClass).toBe("prometheus");
    });

    it("sets name from agentRole and agentInstanceId", () => {
      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000001",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-12345",
        agentRole: "prometheus",
        agentState: "planning",
        message: "Planning: build event contract",
      };

      const delta = projectEventToHeroDelta(event);
      expect(delta.name).toBe("prometheus #2345");
    });

    it("clears active tools when agentState is done", () => {
      const existingActiveTools = [
        {
          id: "tool-call-1",
          name: "bash",
          status: "Running",
          startedAt: Date.now() - 1000,
        },
      ];

      const event = {
        schemaVersion: 1,
        eventId: "01J0TESTEVENT00000000000001",
        eventType: "agent.state.changed",
        occurredAt: Date.now(),
        runId: "run-demo-001",
        agentInstanceId: "prometheus-1",
        agentRole: "prometheus",
        agentState: "done",
        message: "Done: build event contract",
      };

      const delta = projectEventToHeroDelta(event, {
        activeTools: existingActiveTools,
      });
      expect(delta.activeTools).toHaveLength(0);
    });
  });
});
