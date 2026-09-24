#!/usr/bin/env node
// src/mcp/CPI_MCP/index.ts — Entry point for the shared CPI MCP server
//
// Usage (stdio):
//   node dist/mcp/CPI_MCP/index.js
//
// Required env vars (per environment):
//   CPI_TENANT_URL        (or CPI_TENANT_URL_DEV / _TEST / _PROD)
//   CPI_TOKEN_URL         (OAuth2) — or CPI_USERNAME + CPI_PASSWORD for Basic
//   CPI_CLIENT_ID
//   CPI_CLIENT_SECRET
//   CPI_DEFAULT_ENV       (optional: DEV | TEST | PROD, default DEV)

import 'dotenv/config';
import { startMcpServer } from './server.js';

startMcpServer().catch((err: Error) => {
  process.stderr.write(`[CPI_MCP] Fatal: ${err.message}\n`);
  process.exit(1);
});
