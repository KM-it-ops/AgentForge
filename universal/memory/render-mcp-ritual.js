"use strict";

/**
 * Render the cross-agent memory-mcp ritual block from spec/memory.yaml mcp_ritual.
 * Used by AgentForge adapters when emitting identity files.
 */
function buildMcpRitualBlock(memory) {
  const r = memory && memory.mcp_ritual;
  if (!r || r.enabled === false) return "";
  const brain = r.brain_path || "C:\\AI\\brain";
  return `\n- On-demand shared vault: \`${brain}\` via MCP \`${r.mcp_server_name || "memory"}\` when the task needs durable recall or a receipt.`;
}

module.exports = { buildMcpRitualBlock };
