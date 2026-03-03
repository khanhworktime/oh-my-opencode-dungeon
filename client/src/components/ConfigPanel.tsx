/**
 * ConfigPanel - Bridge configuration and connection status
 * Shows the Bridge API Key and instructions for running the local bridge script
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface ConfigPanelProps {
  onClose: () => void;
}

export default function ConfigPanel({ onClose }: ConfigPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const { data: bridgeData, isLoading: keyLoading } =
    trpc.agents.bridgeApiKey.useQuery();

  const serverUrl = window.location.origin;
  const wsUrl = serverUrl.replace(/^http/, "ws") + "/api/ws/agents";
  const eventsUrl = `${serverUrl}/api/bridge/events`;

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const bridgeCommand = bridgeData?.apiKey
    ? `CLAUDE_DUNGEON_SERVER=${serverUrl} CLAUDE_DUNGEON_API_KEY=${bridgeData.apiKey} node claude-dungeon-bridge.mjs`
    : "Loading...";

  const curlCommand = bridgeData?.apiKey
    ? `curl -X POST ${eventsUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-bridge-api-key: ${bridgeData.apiKey}" \\
  -d '{
    "runId": "test-run",
    "events": [{
      "eventType": "agent.spawned",
      "timestamp": ${Math.floor(Date.now() / 1000)},
      "agentInstanceId": "agent-1",
      "agentRole": "warrior"
    }]
  }'`
    : "Loading...";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[680px] max-h-[85vh] overflow-y-auto rounded border-2 border-[#4B0082] bg-[#0d0a1a] text-white"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#4B0082]">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <h2 className="text-base font-bold text-[#FFD700] uppercase tracking-widest">
              Bridge Configuration
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-8">
          {/* Bridge API Key */}
          <section>
            <h3 className="text-xs font-bold text-[#AA88FF] uppercase tracking-widest mb-3">
              🔑 Bridge API Key
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Use this key to authenticate your agents or the bridge script.
            </p>
            {keyLoading ? (
              <div className="text-xs text-gray-500 animate-pulse">
                Generating key...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#0a0a18] border border-[#4B0082] px-3 py-2 text-xs text-[#FFD700] rounded font-mono break-all">
                  {bridgeData?.apiKey || "Loading..."}
                </code>
                <button
                  onClick={() =>
                    bridgeData?.apiKey &&
                    copyToClipboard(bridgeData.apiKey, "key")
                  }
                  className="shrink-0 px-3 py-2 text-xs border border-[#4B0082] text-[#AA88FF] hover:bg-[#4B0082] hover:text-white rounded transition-colors"
                >
                  {copied === "key" ? "✓ Copied!" : "Copy"}
                </button>
              </div>
            )}
          </section>

          {/* Orchestra Endpoints */}
          <section>
            <h3 className="text-xs font-bold text-[#AA88FF] uppercase tracking-widest mb-3">
              📡 Orchestra Endpoints
            </h3>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">
                  HTTP Events API (POST):
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#0a0a18] border border-[#1a1a2e] px-3 py-2 text-xs text-green-300 rounded font-mono">
                    {eventsUrl}
                  </code>
                  <button
                    onClick={() => copyToClipboard(eventsUrl, "events-url")}
                    className="shrink-0 px-3 py-2 text-xs border border-[#4B0082] text-[#AA88FF] hover:bg-[#4B0082] hover:text-white rounded transition-colors"
                  >
                    {copied === "events-url" ? "✓" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">
                  WebSocket Feed:
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#0a0a18] border border-[#1a1a2e] px-3 py-2 text-xs text-blue-300 rounded font-mono">
                    {wsUrl}
                  </code>
                  <button
                    onClick={() => copyToClipboard(wsUrl, "ws-url")}
                    className="shrink-0 px-3 py-2 text-xs border border-[#4B0082] text-[#AA88FF] hover:bg-[#4B0082] hover:text-white rounded transition-colors"
                  >
                    {copied === "ws-url" ? "✓" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Integration Examples */}
          <section>
            <h3 className="text-xs font-bold text-[#AA88FF] uppercase tracking-widest mb-3">
              🛠️ Integration Examples
            </h3>

            <div className="space-y-6">
              {/* Curl Example */}
              <div>
                <div className="text-xs text-gray-400 mb-2">
                  <span className="text-[#FFD700]">Option A:</span> Post events
                  via Curl
                </div>
                <div className="relative group">
                  <pre className="bg-[#0a0a18] border border-[#1a1a2e] p-3 rounded text-xs text-gray-300 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">
                    {curlCommand}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(curlCommand, "curl")}
                    className="absolute top-2 right-2 px-2 py-1 text-[10px] border border-[#4B0082] text-[#AA88FF] bg-[#0d0a1a] hover:bg-[#4B0082] hover:text-white rounded transition-colors opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {copied === "curl" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Bridge Script */}
              <div>
                <div className="text-xs text-gray-400 mb-2">
                  <span className="text-[#FFD700]">Option B:</span> Run local
                  bridge script
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] text-gray-500 mb-1">
                      1. Download script:
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-[#0a0a18] border border-[#1a1a2e] px-3 py-2 text-xs text-green-300 rounded">
                        curl -O {serverUrl}/bridge/claude-dungeon-bridge.mjs
                      </code>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `curl -O ${serverUrl}/bridge/claude-dungeon-bridge.mjs`,
                            "download"
                          )
                        }
                        className="shrink-0 px-3 py-2 text-xs border border-[#4B0082] text-[#AA88FF] hover:bg-[#4B0082] hover:text-white rounded transition-colors"
                      >
                        {copied === "download" ? "✓" : "Copy"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-gray-500 mb-1">
                      2. Run with Node.js:
                    </div>
                    <div className="relative group">
                      <code className="block bg-[#0a0a18] border border-[#1a1a2e] px-3 py-2 text-xs text-green-300 rounded break-all leading-relaxed">
                        {bridgeCommand}
                      </code>
                      <button
                        onClick={() => copyToClipboard(bridgeCommand, "cmd")}
                        className="absolute top-2 right-2 px-2 py-1 text-[10px] border border-[#4B0082] text-[#AA88FF] bg-[#0d0a1a] hover:bg-[#4B0082] hover:text-white rounded transition-colors opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {copied === "cmd" ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section>
            <h3 className="text-xs font-bold text-[#AA88FF] uppercase tracking-widest mb-3">
              ℹ️ How It Works
            </h3>
            <div className="text-xs text-gray-400 space-y-2 leading-relaxed">
              <div className="flex gap-2">
                <span className="text-[#4B0082] shrink-0">▶</span>
                <span>
                  The system receives <strong>Orchestra Events</strong>{" "}
                  (spawned, tool calls, state changes)
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#4B0082] shrink-0">▶</span>
                <span>
                  Events can be pushed from any source (local bridge, cloud
                  agents, CI/CD pipelines)
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#4B0082] shrink-0">▶</span>
                <span>
                  Events are projected into Hero States: Bash → ⚔️ Fighting,
                  WebSearch → 🔮 Casting
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#4B0082] shrink-0">▶</span>
                <span>
                  The web app animates heroes in real-time via WebSocket
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#4B0082] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold uppercase border border-[#4B0082] text-[#AA88FF] hover:bg-[#4B0082] hover:text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
