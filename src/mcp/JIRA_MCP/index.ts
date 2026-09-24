#!/usr/bin/env node
// src/mcp/JIRA_MCP/index.ts — Entry point for the shared JIRA MCP server
//
// Usage (stdio):
//   node dist/mcp/JIRA_MCP/index.js
//
// Required env vars:
//   JIRA_BASE_URL    e.g. https://yourcompany.atlassian.net  or  https://jira.<YOUR-DOMAIN>
//   JIRA_EMAIL       user email (Atlassian Cloud) or username (SAP JIRA)
//   JIRA_API_TOKEN   API token (Cloud) or password (SAP JIRA)
//
// Optional:
//   JIRA_DEFAULT_PROJECT   default project key for new issues (e.g. SAP)

import 'dotenv/config';
import { startJiraMcpServer } from './server.js';

startJiraMcpServer().catch((err: Error) => {
  process.stderr.write(`[JIRA_MCP] Fatal: ${err.message}\n`);
  process.exit(1);
});
