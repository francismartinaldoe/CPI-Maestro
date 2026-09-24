// mcp/mcpServer.ts — MCP wire layer: server init, transport, and request handlers
// Contains NO business logic — delegates everything to toolRegistry and toolRouter.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFINITIONS } from './toolRegistry';
import { routeTool } from './toolRouter';

const server = new Server(
  { name: 'sap-cpi-guardian-mirror', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args     = (request.params.arguments ?? {}) as Record<string, unknown>;
  return routeTool(toolName, args);
});

export async function startMcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
