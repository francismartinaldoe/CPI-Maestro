// src/mcp/index.ts — Central MCP registry
//
// Every MCP server in Maestro is declared here.
// Agents import from here instead of hard-coding paths.
//
// Registered servers:
//   CPI_MCP      — internal 18-tool OData server (health checks, MIRROR)
//   SAP_CPI_MCP  — external 65-tool server from mcp-sap-cpi (monitoring, design, deploy, etc.)
//   JIRA_MCP     — JIRA issue management

import * as path    from 'node:path';
import * as url     from 'node:url';
import * as fs      from 'node:fs';
import { McpClientPool } from '../transport/mcpClientPool.js';
import type { McpClient } from '../transport/mcpClient.js';
import { logger }         from '../utils/logger.js';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function mcpPath(name: string): string {
  const jsPath = path.join(ROOT, 'mcp', name, 'index.js');
  const tsPath = path.join(ROOT, 'mcp', name, 'index.ts');
  if (fs.existsSync(jsPath)) return jsPath;
  if (fs.existsSync(tsPath)) return tsPath;
  return jsPath;
}

// ── MCP server registry ───────────────────────────────────────────────────────

export const MCP_SERVERS = {
  /**
   * CPI_MCP — internal SAP CPI OData tools (18 tools)
   * Used by Gatekeeper for GUARDIAN health checks and MIRROR comparisons.
   * Credentials injected via env at spawn time (McpClientPool.getWithEnv).
   */
  CPI_MCP: {
    name:    'CPI_MCP',
    path:    (): string => process.env.GATEKEEPER_MCP_PATH ?? mcpPath('CPI_MCP'),
    envVars: ['CPI_TENANT_URL', 'CPI_TOKEN_URL', 'CPI_CLIENT_ID', 'CPI_CLIENT_SECRET'],
    description: 'SAP CPI OData — health checks, GUARDIAN, MIRROR comparisons',
  },

  /**
   * SAP_CPI_MCP — external mcp-sap-cpi server (65 tools)
   * Used by FlowLens and Integration Detective.
   * Credentials injected as X-CPI-* env vars per spawn so each agent call
   * targets the correct tenant profile selected in the UI.
   */
  SAP_CPI_MCP: {
    name:    'SAP_CPI_MCP',
    path:    (): string =>
      process.env.SAP_CPI_MCP_PATH ??
      'C:/Users/C5418929/Downloads/GIT mcp-sap-cpi-main/mcp-sap-cpi-main/dist/index.js',
    envVars: ['CPI_TENANT_URL', 'CPI_TOKEN_URL', 'CPI_CLIENT_ID', 'CPI_CLIENT_SECRET'],
    description: 'mcp-sap-cpi — 65 tools: monitoring, design, deploy, Groovy, Hub, security, partners',
  },

  /**
   * JIRA_MCP — JIRA issue management (7 tools)
   */
  JIRA_MCP: {
    name:    'JIRA_MCP',
    path:    (): string => process.env.JIRA_MCP_PATH ?? mcpPath('JIRA_MCP'),
    envVars: ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
    description: 'JIRA — issue creation, search, comments, status transitions',
  },
} as const;

export type McpServerName = keyof typeof MCP_SERVERS;

// ── Credential shapes for per-request injection ───────────────────────────────

export interface CpiCredentialEnv {
  CPI_TENANT_URL:    string;
  CPI_TOKEN_URL?:    string;
  CPI_CLIENT_ID?:    string;
  CPI_CLIENT_SECRET?: string;
  CPI_USERNAME?:     string;
  CPI_PASSWORD?:     string;
}

// ── McpRegistry — central client accessor ────────────────────────────────────

export const McpRegistry = {
  /**
   * Returns a shared McpClient for the named server.
   * The process is spawned on first use and shared across all callers.
   * Use getWithCredentials() when the tool call must target a specific tenant profile.
   */
  get(name: McpServerName): McpClient {
    const server   = MCP_SERVERS[name];
    const resolved = server.path();

    if (!fs.existsSync(resolved)) {
      throw new Error(
        `MCP server "${name}" not found at: ${resolved}\n` +
        `Run "npm run build" or set ${name}_PATH in .env`,
      );
    }

    logger.debug(`[McpRegistry] get ${name} → ${resolved}`);
    return McpClientPool.get(resolved);
  },

  /**
   * Returns a McpClient for the named server spawned with specific tenant credentials.
   * Each unique credential set gets its own process — this is the correct pattern
   * for multi-profile tool calls where each call targets a different tenant.
   *
   * The key is (serverPath + tenantUrl) so two agents using the same tenant
   * share one process, but DEV and PROD are kept separate.
   */
  getWithCredentials(name: McpServerName, creds: CpiCredentialEnv): McpClient {
    const resolved = MCP_SERVERS[name].path();

    if (!fs.existsSync(resolved)) {
      throw new Error(`MCP server "${name}" not found at: ${resolved}`);
    }

    // Key on tenantUrl so each tenant gets its own process
    const poolKey = `${resolved}::${creds.CPI_TENANT_URL}`;
    logger.debug(`[McpRegistry] getWithCredentials ${name} tenant=${creds.CPI_TENANT_URL}`);

    return McpClientPool.getKeyed(poolKey, resolved, {
      CPI_TENANT_URL:    creds.CPI_TENANT_URL,
      CPI_TOKEN_URL:     creds.CPI_TOKEN_URL    ?? '',
      CPI_CLIENT_ID:     creds.CPI_CLIENT_ID    ?? '',
      CPI_CLIENT_SECRET: creds.CPI_CLIENT_SECRET ?? '',
      CPI_USERNAME:      creds.CPI_USERNAME      ?? '',
      CPI_PASSWORD:      creds.CPI_PASSWORD      ?? '',
    });
  },

  isAvailable(name: McpServerName): boolean {
    try {
      return fs.existsSync(MCP_SERVERS[name].path());
    } catch {
      return false;
    }
  },

  status(): Record<McpServerName, { available: boolean; path: string; description: string }> {
    const result = {} as Record<McpServerName, { available: boolean; path: string; description: string }>;
    for (const [name, server] of Object.entries(MCP_SERVERS) as [McpServerName, typeof MCP_SERVERS[McpServerName]][]) {
      const resolved = server.path();
      result[name] = {
        available:   fs.existsSync(resolved),
        path:        resolved,
        description: server.description,
      };
    }
    return result;
  },

  disconnectAll(): void {
    McpClientPool.disconnectAll();
  },
};
