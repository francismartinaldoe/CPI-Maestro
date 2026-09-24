// src/agents/gatekeeperAgent.ts — Gatekeeper-Goofy: real Claude agent
//
// Gatekeeper is a Claude-powered agent that reasons about SAP CPI health.
// It has a persona, a set of CPI_MCP + JIRA_MCP tools, and runs its own agentic loop.
// Maestro tells it WHAT to do; Gatekeeper decides HOW to do it.

import Anthropic from '@anthropic-ai/sdk';
import type { AgentResponse, AgentTarget, McpTransportConfig, HttpTransportConfig } from '../orchestrator/types.js';
import { BaseAgent }     from './baseAgent.js';
import { McpClientPool } from '../transport/mcpClientPool.js';
import { HttpClient }    from '../transport/httpClient.js';
import { GUARDIAN_TOOLS }  from '../tools/cpi/guardianTools.js';
import { JIRA_TOOLS }      from '../tools/jira/jiraTools.js';
import { isJiraTool, callJiraTool } from '../services/jiraService.js';
import { logger }        from '../utils/logger.js';
import * as fs           from 'node:fs';

// ── Gatekeeper persona ──────────────────────────────────────────────────────

const GATEKEEPER_SYSTEM = `You are Gatekeeper-Goofy, an expert SAP CPI health-check and monitoring agent.

Your responsibilities:
- Run GUARDIAN spot-checks: verify iFlow activation, config parameters, message errors, credentials, keystores, endpoints, JMS queues, and design-time artifacts.
- Run MIRROR comparisons: diff iFlows across DEV, TEST, and PROD environments.
- Run cross-tenant comparisons: compare the same iFlow across multiple named tenant profiles simultaneously.
- Query CPI resources: packages, artifacts, runtime status, failed messages, security artifacts, monitoring data.
- Create and manage JIRA issues: when health checks reveal failures or problems, raise JIRA issues to track remediation. Link CPI findings directly to JIRA tickets.

How to work:
1. Read the task carefully and decide which tool(s) to call.
2. Call CPI tools to gather health data. If failures are found, optionally create a JIRA issue.
3. Synthesise the tool results into a clear, structured answer for the user.
4. Use markdown tables for structured data. Lead with the verdict (PASS/FAIL/DRIFT/IN SYNC).
5. If a tool fails, try an alternative approach or explain clearly what was not available.
6. When raising JIRA issues: include the iFlow name, environment, check that failed, and recommended action in the description.

Multi-tenant profile rules:
- When the user asks to compare an iFlow "across tenants", "across profiles", or "across environments" using named profiles, use multi_profile_spotcheck.
- Always call list_profiles first if the user has not specified which profiles to compare — it shows all configured tenant names and IDs.
- Pass profile IDs or names in the profileIds array to target specific tenants. Omit profileIds to run against all configured profiles.
- Any single-tenant tool (spotcheck_iflow, list_packages, etc.) also accepts an optional profileId arg to target a specific named tenant instead of the default env-var credentials.

Environment rules:
- Default environment is DEV unless the user specifies otherwise.
- Valid env values: DEV, TEST, PROD.
- Named profiles take precedence over environment labels when both are available.`.trim();

// Combined tool list presented to Claude
const ALL_TOOLS: Anthropic.Tool[] = [...GUARDIAN_TOOLS, ...JIRA_TOOLS];

export class GatekeeperAgent extends BaseAgent {
  readonly name: AgentTarget = 'gatekeeper';
  protected readonly agentLabel  = 'gatekeeper';
  protected readonly systemPrompt = GATEKEEPER_SYSTEM;

  private httpClient:    HttpClient | null = null;
  private transport:     'mcp' | 'http';
  private mcpServerPath: string | null = null;

  constructor(config: McpTransportConfig | HttpTransportConfig) {
    super();
    this.transport = config.type;
    if (config.type === 'mcp') {
      this.mcpServerPath = config.serverScriptPath;
      // Register with McpClientPool so credentials can be hot-reloaded
      McpClientPool.get(config.serverScriptPath);
    } else {
      this.httpClient = new HttpClient(config.baseUrl, config.headers);
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.transport === 'mcp') {
      return typeof this.mcpServerPath === 'string' && fs.existsSync(this.mcpServerPath);
    }
    return this.httpClient?.ping() ?? false;
  }

  async invoke(action: string, params: Record<string, unknown>): Promise<AgentResponse> {
    const start = Date.now();
    const task  = buildTask(action, params);

    logger.info(`[gatekeeper] starting agent loop for action=${action}`);
    logger.debug(`[gatekeeper] task="${task}"`);

    try {
      const answer = await this.runAgentLoop(
        task,
        ALL_TOOLS,
        (toolName, input) => this.dispatchTool(toolName, input),
      );
      return this.makeResponse(true, answer, Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[gatekeeper] action=${action} error: ${msg}`);
      return this.makeResponse(false, '', Date.now() - start, { error: msg });
    }
  }

  disconnect(): void {
    // Pool manages lifecycle — McpClientPool.disconnectAll() called on shutdown
  }

  // ── Private: dispatch to CPI_MCP or JIRA_MCP ─────────────────────────────

  private async dispatchTool(name: string, args: Record<string, unknown>): Promise<string> {
    const normalised = normaliseParams(args);
    if (isJiraTool(name)) return callJiraTool(name, normalised);
    return this.callCpiTool(name, normalised);
  }

  // ── Private: call CPI_MCP via pool (hot credential reload support) ────────

  private async callCpiTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (this.transport === 'mcp') {
      if (!this.mcpServerPath) throw new Error('MCP server path not set');
      // Always get from pool — after credentials update, pool is cleared so a new
      // McpClient is returned that inherits updated process.env at spawn time
      const client = McpClientPool.get(this.mcpServerPath);
      return client.callTool(name, args);
    }

    if (!this.httpClient) throw new Error('HTTP client not initialised');
    const result = await this.httpClient.post<{ content: string }>(
      `/api/tools/${name}`, args,
    );
    return result?.content ?? JSON.stringify(result);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildTask(action: string, params: Record<string, unknown>): string {
  const env  = (params.environment as string | undefined) ?? 'DEV';
  const name = (params.iflowName   as string | undefined) ??
               (params.iflow       as string | undefined) ??
               (params.iflowId     as string | undefined) ?? '';

  switch (action) {
    case 'spotcheck_iflow':
      return `Run a full GUARDIAN spot-check on iFlow "${name}" in ${env}. Check all 8 dimensions and give a clear PASS/WARN/FAIL verdict with details.`;
    case 'list_profiles':
      return 'List all configured CPI tenant profiles so the user can see which tenants are available for comparison.';
    case 'multi_profile_spotcheck': {
      const profiles = params.profileIds as string[] | undefined;
      const scope = profiles && profiles.length > 0 ? `profiles: ${profiles.join(', ')}` : 'all configured profiles';
      return `Run a multi-tenant GUARDIAN spot-check on iFlow "${name}" across ${scope}. Show a side-by-side comparison and highlight any drift between tenants.`;
    }
    case 'compare_iflow': {
      const src = (params.sourceEnv as string | undefined) ?? 'DEV';
      const tgt = (params.targetEnv as string | undefined) ?? 'TEST';
      return `Run a MIRROR comparison for iFlow "${name}" between ${src} and ${tgt}. Report MATCH / DRIFT / MISSING per dimension.`;
    }
    case 'batch_compare': {
      const src = (params.sourceEnv as string | undefined) ?? 'DEV';
      const tgt = (params.targetEnv as string | undefined) ?? 'TEST';
      return `Run a batch MIRROR comparison for all watchlist iFlows between ${src} and ${tgt}. Summarise MATCH/DRIFT/MISSING counts.`;
    }
    case 'get_failed_messages':
      return `List failed messages from CPI${name ? ` for iFlow "${name}"` : ''}${params.fromDate ? ` since ${params.fromDate}` : ''}. Summarise the errors.`;
    case 'get_system_status':
      return 'Get the overall CPI system status — how many iFlows are started, stopped, or in error.';
    case 'get_todays_deployments':
      return `List all iFlows deployed today in ${env} and summarise their deployment status.`;
    case 'list_packages':
      return 'List all integration packages in the CPI tenant.';
    case 'list_artifacts':
      return `List all artifacts in package "${params.packageId ?? ''}"`;
    case 'list_keystores':
      return 'List all keystore entries. Highlight any certificates expiring within 30 days.';
    case 'list_credentials':
      return 'List all user credential aliases configured in the CPI tenant.';
    case 'list_oauth_credentials':
      return 'List all OAuth2 client credential configurations.';
    case 'list_service_endpoints':
      return `List runtime service endpoints${params.protocol ? ` filtered to protocol ${params.protocol}` : ''}.`;
    case 'list_jms_queues':
      return 'List all JMS queues with their current depth and capacity.';
    case 'list_data_store_entries':
      return `List data store entries${name ? ` for iFlow "${name}"` : ''}.`;
    case 'list_variables':
      return `List integration variables${name ? ` for iFlow "${name}"` : ''}.`;
    case 'get_iflow_content':
      return `Inspect the design-time content of iFlow "${params.artifactId ?? name}". List files and externalized parameters.`;
    case 'get_message_details':
      return `Get full details for message ID "${params.messageId ?? ''}".`;
    case 'run_todays_spot_checks':
      return `Run GUARDIAN spot-checks on all iFlows deployed today in ${env}.`;
    default:
      return `Perform the following CPI task: action=${action} params=${JSON.stringify(params)}`;
  }
}

function normaliseParams(params: Record<string, unknown>): Record<string, unknown> {
  const out = { ...params };
  if (!out.iflowName && out.iflow)   out.iflowName = out.iflow;
  if (!out.iflowName && out.iflowId) out.iflowName = out.iflowId;
  if (typeof out.environment  === 'string') out.environment  = out.environment.toUpperCase();
  if (typeof out.sourceEnv    === 'string') out.sourceEnv    = out.sourceEnv.toUpperCase();
  if (typeof out.targetEnv    === 'string') out.targetEnv    = out.targetEnv.toUpperCase();
  return out;
}
