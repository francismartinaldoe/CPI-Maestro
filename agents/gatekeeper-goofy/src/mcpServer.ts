// mcpServer.ts — Entry point shim.
// All logic has been moved to:
//   src/mcp/     — MCP wire layer (server init, tool registry, tool router)
//   src/agent/   — Agent logic (handlers, formatters, menus, session manager)
//   src/core/    — Business logic (unchanged: cpiClient, spotCheckOrchestrator, compassEngine, checks/)

import { startMcpServer } from './mcp/mcpServer';

startMcpServer().catch(console.error);
