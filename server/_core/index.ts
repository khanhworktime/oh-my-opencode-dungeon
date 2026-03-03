import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initializeWebSocket, getBroadcastCallbacks } from "../websocket";
import { createBridgeRouter } from "../bridge";
import { eventStore } from "../orchestra/eventStore";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Initialize WebSocket for real-time agent monitoring
  initializeWebSocket(server);

  // Bridge API — receives data from local Claude Code bridge script
  const { onHeroUpdate, onHeroNew, onHeroesBatch, onHeroClear, onOrchestraEventsAppended } = getBroadcastCallbacks();
  
  // Rehydrate from persisted events before starting the bridge
  await rehydrateFromPersistence(eventStore, onOrchestraEventsAppended);
  
  app.use("/api/bridge", createBridgeRouter(onHeroUpdate, onHeroNew, onHeroesBatch, onHeroClear, onOrchestraEventsAppended));
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`WebSocket server available at ws://localhost:${port}/api/ws/agents`);
  });
}

startServer().catch(console.error);

async function rehydrateFromPersistence(eventStore: any, onOrchestraEventsAppended: (events: any[]) => void) {
  const os = await import("os");
  const fs = await import("fs/promises");
  const path = await import("path");
  
  try {
    const persistenceDir = path.join(os.homedir(), ".claude-dungeon", "events");
    
    // Check if persistence directory exists
    try {
      await fs.access(persistenceDir);
    } catch {
      console.log("No persistence directory found, starting clean");
      return;
    }
    
    // Read all files in the persistence directory
    const files = await fs.readdir(persistenceDir);
    
    // Filter for .jsonl files and get their stats
    const jsonlFiles = await Promise.all(
      files
        .filter(file => file.endsWith('.jsonl'))
        .map(async (file) => {
          const filePath = path.join(persistenceDir, file);
          const stats = await fs.stat(filePath);
          const runId = path.basename(file, '.jsonl');
          return { file, filePath, mtime: stats.mtime, runId };
        })
    );
    
    // Sort by modification time (most recent first) and take last 5
    jsonlFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const recentFiles = jsonlFiles.slice(0, 5);
    
    console.log(`Rehydrating from ${recentFiles.length} recent event files...`);
    
    // Process each file in chronological order (oldest first)
    // Process each file in chronological order (oldest first)
    for (let i = 0; i < recentFiles.length; i++) {
      const { filePath, runId } = recentFiles[i];
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        const events: any[] = [];
        for (const line of lines) {
          try {
            const eventRecord = JSON.parse(line);
            // Extract the original OrchestraEvent by removing metadata
            const { cursor, ingestedAt, ...orchestraEvent } = eventRecord;
            events.push(orchestraEvent);
          } catch (parseError) {
            console.warn(`Skipping invalid event line in ${filePath}:`, parseError);
            continue;
          }
        }
        
        if (events.length > 0) {
          // Append events to store
          const result = eventStore.appendEvents(runId, events);
          console.log(`Rehydrated ${result.appendedCount} events for run ${runId}`);
          
          // Project to heroes
          onOrchestraEventsAppended(events);
        }
      } catch (fileError) {
        console.warn(`Failed to process event file ${filePath}:`, fileError);
        // Continue with next file
        continue;
      }
    }
    
    console.log("Rehydration completed successfully");
  } catch (error) {
    console.warn("Failed to rehydrate from persistence:", error);
    // Don't crash - start clean as requested
  }
}
