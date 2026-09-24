// src/mcp/CPI_MCP/toolRouter.ts — Routes MCP tool calls to the correct handler
//
// Credential resolution priority per request:
//   1. profileId arg  → named profile from MAESTRO_PROFILES (set by Web UI)
//   2. environment arg → per-env env vars (CPI_TENANT_URL_DEV etc.)
//   3. default         → CPI_DEFAULT_ENV env var (falls back to DEV)

import { CpiClient } from './cpiClient.js';
import {
  loadCredentials,
  loadProfileCredentials,
  getProfiles,
  defaultEnvironment,
} from './config.js';
import type { Environment, ToolResult } from './types.js';

import {
  handleListPackages,
  handleListArtifacts,
  handleGetIflowContent,
  handleGetRuntimeArtifacts,
  handleGetSystemStatus,
  handleGetTodaysDeployments,
} from './tools/artifacts.js';

import {
  handleGetFailedMessages,
  handleGetMessageDetails,
} from './tools/messages.js';

import {
  handleListKeystores,
  handleListCredentials,
  handleListOAuthCredentials,
} from './tools/security.js';

import {
  handleListServiceEndpoints,
  handleListJmsQueues,
  handleListDataStoreEntries,
  handleListVariables,
  handlePingEndpoint,
} from './tools/monitoring.js';

import {
  handleSpotcheckIflow,
  handleMultiProfileSpotcheck,
} from './tools/healthcheck.js';

// ── Credential resolution ────────────────────────────────────────────────────

function resolveClient(args: Record<string, unknown>): { client: CpiClient; label: string } {
  const profileId = args.profileId as string | undefined;

  if (profileId) {
    const creds = loadProfileCredentials(profileId);
    if (!creds) {
      throw new Error(
        `Profile "${profileId}" not found. ` +
        `Use list_profiles to see available profiles.`,
      );
    }
    return { client: new CpiClient(creds), label: profileId };
  }

  const env: Environment =
    ((args.environment as string | undefined)?.toUpperCase() as Environment) ??
    defaultEnvironment();

  return { client: new CpiClient(loadCredentials(env)), label: env };
}

// ── Router ───────────────────────────────────────────────────────────────────

export async function routeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {

  // ── Profile-management tools (no CpiClient needed) ───────────────────────
  if (name === 'list_profiles') {
    const profiles = getProfiles();
    if (profiles.length === 0) {
      return text(
        'No CPI profiles configured yet.\n' +
        'Open Settings in the Web UI and add at least one profile under **SAP CPI Tenants**.',
      );
    }
    const rows = profiles.map((p, i) => {
      const configured = !!(p.tenantUrl && p.clientId && p.clientSecret);
      const dot = configured ? '🟢' : '🔴';
      return `| ${i + 1} | ${dot} | ${p.name} | \`${p.id}\` | ${p.tenantUrl || '—'} |`;
    });
    return text([
      `## CPI Tenant Profiles (${profiles.length})`,
      '',
      '| # | Status | Name | ID | Tenant URL |',
      '|---|--------|------|----|-----------|',
      ...rows,
      '',
      'Pass the **ID** or **Name** as `profileId` to any tool to target that tenant.',
      'Use `multi_profile_spotcheck` to compare an iFlow across multiple tenants at once.',
    ].join('\n'));
  }

  // ── Multi-profile spotcheck (handled before resolveClient) ───────────────
  if (name === 'multi_profile_spotcheck') {
    return handleMultiProfileSpotcheck(args);
  }

  // ── All other tools: resolve a single client ─────────────────────────────
  const env: Environment =
    ((args.environment as string | undefined)?.toUpperCase() as Environment) ??
    defaultEnvironment();

  let client: CpiClient;
  try {
    const resolved = resolveClient(args);
    client = resolved.client;
  } catch (err) {
    return text(`❌ ${(err as Error).message}`);
  }

  switch (name) {
    // ── GUARDIAN ─────────────────────────────────────────────────────────
    case 'spotcheck_iflow':
      return handleSpotcheckIflow(client, args, env);

    // ── Artifacts ────────────────────────────────────────────────────────
    case 'list_packages':           return handleListPackages(client);
    case 'list_artifacts':          return handleListArtifacts(client, args);
    case 'get_iflow_content':       return handleGetIflowContent(client, args);
    case 'get_runtime_artifacts':   return handleGetRuntimeArtifacts(client);
    case 'get_system_status':       return handleGetSystemStatus(client);
    case 'get_todays_deployments':  return handleGetTodaysDeployments(client);

    // ── Messages ─────────────────────────────────────────────────────────
    case 'get_failed_messages':     return handleGetFailedMessages(client, args);
    case 'get_message_details':     return handleGetMessageDetails(client, args);

    // ── Security ─────────────────────────────────────────────────────────
    case 'list_keystores':          return handleListKeystores(client);
    case 'list_credentials':        return handleListCredentials(client);
    case 'list_oauth_credentials':  return handleListOAuthCredentials(client);

    // ── Monitoring ────────────────────────────────────────────────────────
    case 'list_service_endpoints':  return handleListServiceEndpoints(client, args);
    case 'list_jms_queues':         return handleListJmsQueues(client);
    case 'list_data_store_entries': return handleListDataStoreEntries(client, args);
    case 'list_variables':          return handleListVariables(client, args);
    case 'ping_endpoint':           return handlePingEndpoint(client, args);

    default:
      return text(`Unknown tool: ${name}`);
  }
}

function text(t: string): ToolResult {
  return { content: [{ type: 'text', text: t }] };
}
