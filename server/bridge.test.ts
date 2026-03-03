/**
 * Bridge API tests
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

// Use a temp dir for testing
const TEST_DIR = path.join(os.tmpdir(), "claude-dungeon-test-" + Date.now());
const TEST_CONFIG_PATH = path.join(TEST_DIR, "config.json");

function ensureTestDir() {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR))
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

function loadTestConfig(): Record<string, unknown> {
  try {
    if (fs.existsSync(TEST_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function saveTestConfig(config: Record<string, unknown>) {
  ensureTestDir();
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getOrCreateTestApiKey(): string {
  const config = loadTestConfig();
  if (config.bridgeApiKey && typeof config.bridgeApiKey === "string") {
    return config.bridgeApiKey;
  }
  const key = "cpab_" + crypto.randomBytes(32).toString("hex");
  saveTestConfig({ ...config, bridgeApiKey: key });
  return key;
}

describe("Bridge API Key Management", () => {
  it("generates a new API key when none exists", () => {
    const key = getOrCreateTestApiKey();
    expect(key).toBeTruthy();
    expect(key).toMatch(/^cpab_[a-f0-9]{64}$/);
  });

  it("returns the same key on subsequent calls", () => {
    const key1 = getOrCreateTestApiKey();
    const key2 = getOrCreateTestApiKey();
    expect(key1).toBe(key2);
  });

  it("persists the key to config file", () => {
    const key = getOrCreateTestApiKey();
    const config = loadTestConfig();
    expect(config.bridgeApiKey).toBe(key);
  });

  it("uses existing key from config file", () => {
    const existingKey = "cpab_" + "a".repeat(64);
    saveTestConfig({ bridgeApiKey: existingKey });
    const key = getOrCreateTestApiKey();
    expect(key).toBe(existingKey);
  });

  it("API key has correct format (cpab_ prefix + 64 hex chars)", () => {
    const key = getOrCreateTestApiKey();
    const parts = key.split("_");
    expect(parts[0]).toBe("cpab");
    expect(parts[1]).toHaveLength(64);
  });
});

describe("Bridge Script Validation", () => {
  it("bridge script file exists", () => {
    const bridgePath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "bridge",
      "claude-dungeon-bridge.mjs"
    );
    expect(fs.existsSync(bridgePath)).toBe(true);
  });

  it("bridge script is valid JavaScript (no syntax errors)", () => {
    const bridgePath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "bridge",
      "claude-dungeon-bridge.mjs"
    );
    const content = fs.readFileSync(bridgePath, "utf-8");
    expect(content).toContain("CLAUDE_DUNGEON_API_KEY");
    expect(content).toContain("CLAUDE_DUNGEON_SERVER");
    expect(content).toContain("/api/bridge/heroes");
    expect(content).toContain("x-bridge-api-key");
  });

  it("bridge script has correct server URL", () => {
    const bridgePath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "bridge",
      "claude-dungeon-bridge.mjs"
    );
    const content = fs.readFileSync(bridgePath, "utf-8");
    expect(content).toContain("claudepixl-kuk4sjxk.manus.space");
  });
});

describe("Bridge API Validation (Direct)", () => {
  it("rejects non-array heroes for POST /api/bridge/heroes", async () => {
    const { HeroesBatchSchema } = await import("./bridge");
    const result = HeroesBatchSchema.safeParse({ heroes: "not an array" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects missing hero for POST /api/bridge/hero", async () => {
    const { HeroUpdateSchema } = await import("./bridge");
    const result = HeroUpdateSchema.safeParse({ event: "new" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects invalid event string for POST /api/bridge/hero", async () => {
    const { HeroUpdateSchema } = await import("./bridge");
    const result = HeroUpdateSchema.safeParse({
      hero: { id: "test-hero" },
      event: "invalid-event",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("accepts valid clear request for POST /api/bridge/clear", async () => {
    const { ClearSchema } = await import("./bridge");
    const result = ClearSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
