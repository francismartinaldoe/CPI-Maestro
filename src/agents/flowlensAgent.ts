// src/agents/flowlensAgent.ts — FlowLens AI: real Claude agent
//
// FlowLens is a Claude-powered agent that understands SAP CPI iFlows.
// It has a persona, tools for iFlow analysis, Groovy code, and JIRA. Runs its own loop.
// Maestro tells it WHAT to do; FlowLens decides HOW to do it.

import Anthropic from '@anthropic-ai/sdk';
import type { AgentResponse, AgentTarget, HttpTransportConfig } from '../orchestrator/types.js';
import { BaseAgent }      from './baseAgent.js';
import { HttpClient }     from '../transport/httpClient.js';
import { FLOWLENS_TOOLS }  from '../tools/flowlens/flowlensTools.js';
import { JIRA_TOOLS }      from '../tools/jira/jiraTools.js';
import { isJiraTool, callJiraTool } from '../services/jiraService.js';
import { logger }         from '../utils/logger.js';

// ── FlowLens persona ────────────────────────────────────────────────────────

const FLOWLENS_SYSTEM = `You are FlowLens AI, an expert SAP CPI iFlow analyst and Groovy developer.

Your responsibilities:
- Analyse and explain SAP CPI integration flows: adapters, mappings, scripts, configuration.
- Generate, modify, explain, and simulate Groovy scripts for SAP CPI.
- Look up iFlow ownership and runtime status.
- Query failed messages from CPI.
- Create and manage JIRA issues: when analysis reveals bugs, missing documentation, or improvement opportunities, raise JIRA issues. When an iFlow owner is identified, you can assign the JIRA issue to them.

How to work:
1. Read the task and decide which tool(s) to call.
2. For iFlow analysis: fetch the iFlow content first, then provide a thorough explanation.
3. For Groovy tasks: use the groovy tool. Always return the script in a \`\`\`groovy code block.
4. For ownership lookups: use the owners tool. Present results clearly.
5. For JIRA: include the iFlow name, issue found, and recommended fix in the description.
6. Synthesise tool results into a clear, expert answer.

Groovy coding standards:
- Always import com.sap.gateway.ip.core.customdev.util.Message.
- Handle null values defensively.
- Add a brief comment explaining what the script does.
- Use SAP CPI best practices (exchange properties, message headers, body).`.trim();
const ALL_TOOLS: Anthropic.Tool[] = [...FLOWLENS_TOOLS, ...JIRA_TOOLS];

export class FlowLensAgent extends BaseAgent {
  readonly name: AgentTarget = 'flowlens';
  protected readonly agentLabel   = 'flowlens';
  protected readonly systemPrompt = FLOWLENS_SYSTEM;

  private http: HttpClient;

  constructor(config: HttpTransportConfig) {
    super();
    this.http = new HttpClient(config.baseUrl, config.headers);
  }

  async isAvailable(): Promise<boolean> {
    return this.http.ping();
  }

  async invoke(action: string, params: Record<string, unknown>): Promise<AgentResponse> {
    const start = Date.now();
    const task  = buildTask(action, params);

    logger.info(`[flowlens] starting agent loop for action=${action}`);
    logger.debug(`[flowlens] task="${task}"`);

    try {
      const answer = await this.runAgentLoop(
        task,
        ALL_TOOLS,
        (toolName, input) => this.dispatchTool(toolName, input),
      );

      // Persist Groovy scripts in response for Maestro's context manager
      return this.makeResponse(true, answer, Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[flowlens] action=${action} error: ${msg}`);
      return this.makeResponse(false, '', Date.now() - start, { error: msg });
    }
  }

  // ── Private: dispatch to FlowLens HTTP or JIRA_MCP ───────────────────────

  private async dispatchTool(name: string, input: Record<string, unknown>): Promise<string> {
    if (isJiraTool(name)) return callJiraTool(name, input);
    return this.callFlowLensTool(name, input);
  }

  private async callFlowLensTool(name: string, input: Record<string, unknown>): Promise<string> {
    switch (name) {

      case 'analyze_iflow': {
        const iflowId  = String(input.iflowId ?? '');
        const question = String(input.question ?? 'Explain what this iFlow does, its adapters, scripts, and configuration.');
        const result   = await this.http.post<{ response?: string; answer?: string; content?: string }>(
          '/api/chat',
          { message: `Analyse iFlow "${iflowId}": ${question}`, iflowId },
        );
        return result?.response ?? result?.answer ?? result?.content ?? JSON.stringify(result);
      }

      case 'groovy': {
        const result = await this.http.post<{
          script?: string; explanation?: string; simulatedOutput?: string;
        }>('/api/groovy', {
          action:      input.action,
          description: input.description,
          script:      input.script,
          payload:     input.payload,
        });
        if (result?.script)          return `\`\`\`groovy\n${result.script}\n\`\`\``;
        if (result?.explanation)     return result.explanation;
        if (result?.simulatedOutput) return result.simulatedOutput;
        return JSON.stringify(result);
      }

      case 'get_runtime_status': {
        const result = await this.http.get<unknown>('/api/runtime');
        return JSON.stringify(result, null, 2);
      }

      case 'get_failed_messages': {
        const query: Record<string, string | number> = {};
        if (input.artifactName) query.artifactName = String(input.artifactName);
        if (input.fromDate)     query.fromDate     = String(input.fromDate);
        if (input.top)          query.top          = Number(input.top);
        const result = await this.http.get<{ messages?: unknown[] }>('/api/messages', { params: query });
        const msgs   = result?.messages ?? (Array.isArray(result) ? result : []);
        if (!msgs.length) return 'No failed messages found.';
        return JSON.stringify(msgs, null, 2);
      }

      case 'list_owners': {
        const query: Record<string, string> = {};
        if (input.iflowName) query.iflow = String(input.iflowName);
        const result = await this.http.get<unknown>('/api/owners', { params: query });
        return JSON.stringify(result, null, 2);
      }

      default:
        throw new Error(`Unknown FlowLens tool: ${name}`);
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildTask(action: string, params: Record<string, unknown>): string {
  const iflow = (params.iflowId   as string | undefined) ??
                (params.iflowName as string | undefined) ??
                (params.iflow     as string | undefined) ?? '';

  switch (action) {
    case 'analyze_iflow':
      return `Analyse iFlow "${iflow}"${params.question ? `: ${params.question}` : '. Explain what it does, its adapters, scripts, mappings, and configuration.'}`;
    case 'generate_groovy':
      return `Generate a Groovy script for SAP CPI that does the following: ${params.description ?? '(no description provided)'}${params.payload ? `\n\nSample payload:\n${params.payload}` : ''}`;
    case 'modify_groovy':
      return `Modify the following Groovy script as described.\n\nRequired changes: ${params.description ?? ''}\n\nExisting script:\n${params.script ?? ''}`;
    case 'explain_groovy':
      return `Explain what this Groovy script does step by step:\n\n${params.script ?? ''}`;
    case 'simulate_groovy':
      return `Simulate this Groovy script and show what the output would be${params.payload ? ` given this payload:\n${params.payload}` : ''}.\n\nScript:\n${params.script ?? ''}`;
    case 'get_failed_messages':
      return `List failed messages from CPI${iflow ? ` for iFlow "${iflow}"` : ''}. Summarise the errors and affected iFlows.`;
    case 'get_runtime_status':
      return 'Get the runtime status of all deployed iFlows. Highlight any that are in ERROR or STOPPED state.';
    case 'list_owners':
      return iflow
        ? `Who owns the iFlow "${iflow}"? Show their name, email, and team.`
        : 'List all iFlow owners with their names, emails, and teams.';
    default:
      return `Perform the following FlowLens task: action=${action} params=${JSON.stringify(params)}`;
  }
}
