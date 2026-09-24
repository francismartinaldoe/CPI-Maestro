// src/utils/config.ts — Load and validate environment configuration

import 'dotenv/config';
import * as fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import type { AgentConfig, McpTransportConfig, HttpTransportConfig } from '../orchestrator/types.js';

/**
 * Resolve the best available Anthropic credential in priority order:
 *   1. ANTHROPIC_API_KEY   — explicit API key
 *   2. ANTHROPIC_AUTH_TOKEN — Claude CLI OAuth session token
 *
 * The Claude CLI uses ANTHROPIC_AUTH_TOKEN with Bearer auth.
 * When using it, the Authorization header must be `Bearer <token>`
 * and the `anthropic-beta: oauth-2025-04-20` header is required.
 */
function resolveAnthropicCredential(): { apiKey?: string; authToken?: string } {
  const apiKey    = process.env.ANTHROPIC_API_KEY;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;

  const isPlaceholder = (v: string | undefined) =>
    !v || v === 'REPLACE_WITH_YOUR_KEY' || v.length < 20;

  if (!isPlaceholder(apiKey))    return { apiKey };
  if (!isPlaceholder(authToken)) return { authToken };

  return {};
}

/**
 * Shared Anthropic client factory.
 * Uses ANTHROPIC_API_KEY if set, falls back to ANTHROPIC_AUTH_TOKEN
 * (the Claude CLI OAuth session) so no manual key setup is needed.
 */
export function createAnthropicClient(): Anthropic {
  const { apiKey, authToken } = resolveAnthropicCredential();

  if (authToken) {
    // Claude CLI OAuth token — use Bearer auth with oauth beta header
    return new Anthropic({
      apiKey:         'oauth-token',   // SDK requires a non-empty string; overridden below
      defaultHeaders: {
        Authorization:     `Bearer ${authToken}`,
        'anthropic-beta':  'oauth-2025-04-20',
      },
      ...(process.env.ANTHROPIC_BASE_URL
        ? { baseURL: process.env.ANTHROPIC_BASE_URL }
        : {}),
    });
  }

  if (apiKey) {
    const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    if (baseUrl) {
      opts.baseURL        = baseUrl;
      opts.defaultHeaders = { Authorization: `Bearer ${apiKey}` };
    }
    return new Anthropic(opts);
  }

  throw new Error(
    'No Anthropic credential found.\n' +
    'Set ANTHROPIC_API_KEY in .env, or run `claude` once to create a CLI session (ANTHROPIC_AUTH_TOKEN).'
  );
}

export function requireAnthropicKey(): void {
  const { apiKey, authToken } = resolveAnthropicCredential();
  if (!apiKey && !authToken) {
    throw new Error(
      'No Anthropic credential found.\n' +
      'Set ANTHROPIC_API_KEY in .env, or ensure the Claude CLI session is active (ANTHROPIC_AUTH_TOKEN).'
    );
  }
}

export function loadAgentConfig(): AgentConfig {
  const gatekeeperTransport = (process.env.GATEKEEPER_TRANSPORT ?? 'mcp').toLowerCase();

  let gatekeeper: McpTransportConfig | HttpTransportConfig;

  if (gatekeeperTransport === 'http') {
    const baseUrl = process.env.GATEKEEPER_HTTP_URL;
    if (!baseUrl) throw new Error('GATEKEEPER_HTTP_URL must be set when GATEKEEPER_TRANSPORT=http');
    gatekeeper = { type: 'http', baseUrl };
  } else {
    const mcpPath = process.env.GATEKEEPER_MCP_PATH;
    if (!mcpPath) {
      throw new Error(
        'GATEKEEPER_MCP_PATH must be set to the compiled CPI_MCP entry point.\n' +
        'Example: GATEKEEPER_MCP_PATH=C:/Users/<YOUR-USERNAME>/maestro/dist/mcp/CPI_MCP/index.js'
      );
    }
    if (!fs.existsSync(mcpPath)) {
      throw new Error(
        `CPI_MCP server not found at: ${mcpPath}\n` +
        'Run "npm run build" first.'
      );
    }
    gatekeeper = { type: 'mcp', serverScriptPath: mcpPath };
  }

  const flowlensUrl = process.env.FLOWLENS_HTTP_URL ?? 'http://localhost:3001';

  const sapCpiMcpPath =
    process.env.SAP_CPI_MCP_PATH ??
    'C:/Users/C5418929/Downloads/GIT mcp-sap-cpi-main/mcp-sap-cpi-main/dist/index.js';

  return {
    gatekeeper,
    flowlens:  { type: 'http', baseUrl: flowlensUrl },
    detective: { type: 'mcp', serverScriptPath: sapCpiMcpPath },
  };
}
