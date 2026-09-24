// src/mcp/CPI_MCP/server.ts — MCP wire layer: server init + request handlers
//
// No business logic here — delegates everything to toolRegistry and toolRouter.
// Set MCP_TRANSPORT=http to run as a hosted HTTP server (Cloud Foundry).
// Default (no env var) keeps the existing stdio mode for local Claude Desktop use.

import { Server }                        from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport }          from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
}                                        from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFINITIONS }              from './toolRegistry.js';
import { routeTool }                     from './toolRouter.js';
import express                           from 'express';

const server = new Server(
  { name: 'CPI_MCP', version: '1.0.0' },
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

export async function startMcpServer(): Promise<void> {
  if (process.env.MCP_TRANSPORT === 'http') {
    const app = express();
    app.use(express.json());

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — each request is independent
    });

    await server.connect(transport);

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', server: 'CPI_MCP', version: '1.0.0' });
    });

    app.all('/mcp', (req, res) => {
      transport.handleRequest(req, res, req.body);
    });

    const port = parseInt(process.env.PORT ?? '3000', 10);
    app.listen(port, () => {
      process.stderr.write(`[CPI_MCP] HTTP server listening on port ${port}\n`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
