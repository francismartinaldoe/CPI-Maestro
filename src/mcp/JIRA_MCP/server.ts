// src/mcp/JIRA_MCP/server.ts — MCP wire layer for JIRA

import { Server }               from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
}                               from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFINITIONS }     from './toolRegistry.js';
import { routeTool }            from './toolRouter.js';

const server = new Server(
  { name: 'JIRA_MCP', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  return routeTool(name, args);
});

export async function startJiraMcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
