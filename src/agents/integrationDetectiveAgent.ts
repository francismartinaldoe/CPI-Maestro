// src/agents/integrationDetectiveAgent.ts — Integration Detective AI
//
// Covers the full operational surface of a single CPI tenant using the
// 65-tool mcp-sap-cpi MCP server: message monitoring, failed messages,
// runtime status, keystores/certificates, credentials, JMS queues,
// data stores, partner directory, SAP Hub, deploy/undeploy, log files.
//
// Credentials are injected per-request from the active UI profile via
// McpRegistry.getWithCredentials() — no baked-in env vars.

import Anthropic from '@anthropic-ai/sdk';
import * as fs   from 'node:fs';
import type { AgentResponse, AgentTarget, HttpTransportConfig, McpTransportConfig } from '../orchestrator/types.js';
import { BaseAgent }    from './baseAgent.js';
import { McpRegistry, type CpiCredentialEnv }  from '../mcp/index.js';
import { getProfiles }  from '../services/credentialService.js';
import { logger }       from '../utils/logger.js';
import { MONITORING_TOOLS } from '../tools/cpi/monitoringTools.js';
import { SECURITY_TOOLS }   from '../tools/cpi/securityTools.js';
import { CATALOG_TOOLS }    from '../tools/cpi/catalogTools.js';
import { DEPLOY_TOOLS }     from '../tools/cpi/deployTools.js';
import { PARTNER_TOOLS }    from '../tools/cpi/partnerTools.js';
import { HUB_TOOLS }        from '../tools/cpi/hubTools.js';

// ── Persona (mirrors integration-detective.md) ────────────────────────────────

const SYSTEM = `You are Integration Detective AI — the SAP CPI Operations and Monitoring Intelligence agent.

You connect to a single SAP CPI tenant and give a complete operational picture: message health,
security posture, runtime state, store usage, and content inventory.

Your responsibilities:
- Message monitoring: failed messages, message details, trace logs, idempotent entries, message stores
- Runtime status: deployed artifacts, system health, today's deployments, log level changes
- Security audit: keystores with expiry analysis, credentials, OAuth configs, SSH keys, access policies
- Store management: JMS queues, data stores, variables, number ranges
- Content catalog: packages, artifacts, value mappings, message mappings, script collections, endpoints
- Deployment: deploy/undeploy artifacts, check deploy status
- Partner directory: trading partners, parameters, alternative IDs
- SAP Hub: search standard SAP integration content
- Log files: system and audit logs

Output rules:
- Always show counts/summary before detail tables
- Certificate expiry: flag 🔴 EXPIRED, ⚠️ <30d, 🟡 <90d, ✅ OK
- Failed messages: group by error pattern, give root-cause diagnosis
- Always end with the what-next menu
- Never truncate error text or certificate details
- For iFlow code analysis → say "Ask FlowLens AI"
- For cross-tenant comparison → say "Ask Gatekeeper Goofy"
- Confirm before deploy/undeploy unless user explicitly said to proceed`.trim();


// ── Tool list composed from src/tools/ ───────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  ...MONITORING_TOOLS,
  ...SECURITY_TOOLS,
  ...CATALOG_TOOLS,
  ...DEPLOY_TOOLS,
  ...PARTNER_TOOLS,
  ...HUB_TOOLS,
];


export class IntegrationDetectiveAgent extends BaseAgent {
  readonly name: AgentTarget = 'detective';
  protected readonly agentLabel  = 'integration-detective';
  protected readonly systemPrompt = SYSTEM;

  async isAvailable(): Promise<boolean> {
    return McpRegistry.isAvailable('SAP_CPI_MCP');
  }

  async invoke(action: string, params: Record<string, unknown>): Promise<AgentResponse> {
    const start = Date.now();
    const task  = buildTask(action, params);

    logger.info(`[integration-detective] action=${action}`);

    try {
      const answer = await this.runAgentLoop(
        task,
        TOOLS,
        (toolName, input) => this.callTool(toolName, input, params),
      );
      return this.makeResponse(true, answer, Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[integration-detective] error: ${msg}`);
      return this.makeResponse(false, '', Date.now() - start, { error: msg });
    }
  }

  private async callTool(
    name: string,
    args: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<string> {
    // Resolve credentials from active profile
    const creds = resolveCredentials(params);
    if (!creds) {
      return '⚠️ No CPI tenant profile is configured. Please open Settings → SAP CPI Tenants, add a profile with your tenant URL and credentials, then try again.';
    }
    const client = McpRegistry.getWithCredentials('SAP_CPI_MCP', creds);
    return client.callTool(name, args);
  }

  disconnect(): void {
    // Pool manages lifecycle
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveCredentials(params: Record<string, unknown>): CpiCredentialEnv | null {
  // Prefer explicit profileId in params
  const profileId = params.profileId as string | undefined;
  const profiles  = getProfiles();

  if (profiles.length === 0) return null;

  if (profileId) {
    const p = profiles.find(
      x => x.id === profileId || x.name.toLowerCase() === profileId.toLowerCase(),
    );
    if (p) return profileToCreds(p);
  }

  // Default to first configured profile
  return profileToCreds(profiles[0]);
}

function profileToCreds(p: { tenantUrl: string; tokenUrl: string; clientId: string; clientSecret: string; username?: string; password?: string }): CpiCredentialEnv {
  return {
    CPI_TENANT_URL:    p.tenantUrl,
    CPI_TOKEN_URL:     p.tokenUrl,
    CPI_CLIENT_ID:     p.clientId,
    CPI_CLIENT_SECRET: p.clientSecret,
    CPI_USERNAME:      p.username,
    CPI_PASSWORD:      p.password,
  };
}

function buildTask(action: string, params: Record<string, unknown>): string {
  const name = (params.artifactName ?? params.iflowName ?? params.iflowId ?? '') as string;
  switch (action) {
    case 'get_system_status':       return 'Get the overall CPI system status — how many iFlows are started, stopped, or in error. Show a summary table.';
    case 'get_failed_messages':     return `List failed messages from CPI${name ? ` for iFlow "${name}"` : ''}. Group by error pattern and suggest root causes.`;
    case 'list_keystores':          return 'List all keystore entries. Highlight certificates expiring within 30 days and any already expired.';
    case 'security_audit':          return 'Run a full security audit: keystores, credentials, OAuth configs, SSH keys, secure parameters. Produce a security posture verdict.';
    case 'list_jms_queues':         return 'List all JMS queues with depth, capacity, and consumer count. Flag any queues over 80% full.';
    case 'list_packages':           return 'List all integration packages in the CPI tenant.';
    case 'list_artifacts':          return `List all artifacts in package "${params.packageId ?? ''}"`;
    case 'deploy_artifact':         return `Deploy artifact "${params.artifactId ?? name}" to the CPI runtime. Then check the deploy status and report the outcome.`;
    case 'get_todays_deployments':  return 'List all iFlows deployed today with their status.';
    case 'list_partners':           return 'List all trading partners in the partner directory.';
    case 'hub_search':              return `Search SAP Hub for: ${params.query ?? name}`;
    default:                        return `Perform CPI operation: action=${action} params=${JSON.stringify(params)}`;
  }
}
