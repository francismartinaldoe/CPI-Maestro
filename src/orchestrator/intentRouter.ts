// src/orchestrator/intentRouter.ts — LLM-powered intent classifier
// Parses natural language input and decides which sub-agent to invoke
// with what parameters.

import Anthropic from '@anthropic-ai/sdk';
import type { ClassifiedIntent, SessionContext } from './types.js';
import { createAnthropicClient } from '../utils/config.js';

const INTENT_SYSTEM_PROMPT = `You are the intent router for Maestro, an AI orchestrator for SAP CPI (Cloud Integration).
You receive a user message and must classify it into a structured routing decision.

## Sub-agents available

### Gatekeeper-Goofy  (target: "gatekeeper")
SAP CPI deployment health and cross-tenant comparison agent. Use it for:
- GUARDIAN — health check / spot-check / verify / is X running → tool: "spotcheck_iflow", params: { iflowName, environment? }
- MIRROR — compare / diff / drift / promote / what's different between DEV and TEST → tool: "compare_iflow", params: { iflowName, sourceEnv?, targetEnv? }
- Batch compare all watchlist iFlows → tool: "batch_compare", params: { sourceEnv?, targetEnv? }
- Compare iFlow across multiple tenant profiles simultaneously → tool: "multi_profile_spotcheck", params: { iflowName, profileIds? }
- List configured tenant profiles → tool: "list_profiles", params: {}

### FlowLens AI  (target: "flowlens")
iFlow design analysis and Groovy scripting. Use it for:
- Explain / analyse / understand / how is X built / what does X do / read iFlow X → action: "analyze_iflow", params: { iflowId, question? }
- What scripts / adapters / parameters does X have → action: "analyze_iflow"
- Generate a Groovy script → action: "generate_groovy", params: { description, payload? }
- Modify / update / change a Groovy script → action: "modify_groovy", params: { script, description }
- Explain a Groovy script / what does this Groovy do → action: "explain_groovy", params: { script }
- Simulate / test / dry-run a Groovy script → action: "simulate_groovy", params: { script, payload? }
- Show iFlow owners / who owns X → action: "list_owners", params: { iflowName? }

### Integration Detective  (target: "detective")
CPI operations, monitoring, security, and content management. Use it for:
- System status / how many errors / what's running / tenant health → action: "get_system_status"
- Failed messages / what failed / message errors / errors today → action: "get_failed_messages", params: { artifactName?, fromDate?, top? }
- Message details / show me message GUID → action: "get_message_details", params: { messageId }
- Keystores / certificates / expiring certs / security audit → action: "list_keystores" or "security_audit"
- Credentials / OAuth / secure parameters / SSH keys → action: "list_credentials" or "list_oauth_credentials"
- List packages / artifacts / what's deployed / deployment status → action: "list_packages" or "list_artifacts"
- JMS queues / queue depth / data stores / variables → action: "list_jms_queues" or "list_data_store_entries"
- Today's deployments / what was deployed today → action: "get_todays_deployments"
- Deploy X / undeploy X / redeploy X → action: "deploy_artifact" or "undeploy_artifact"
- Trading partners / partner directory / B2B partners → action: "list_partners"
- Find standard content / SAP Hub / accelerator hub → action: "hub_search", params: { query }
- Service endpoints / log files / log archives → action: "list_service_endpoints" or "list_log_files"

### Both gatekeeper + detective  (target: "both")
Use only when the question genuinely needs both:
- "Health check AND list failed messages for X" (health=gatekeeper, messages=detective)

### Orchestrator only  (target: "orchestrator")
General questions about Maestro itself, capability queries, help requests.

## Routing rules
- "explain iFlow" / "how is it built" → ALWAYS flowlens (not gatekeeper, not detective)
- "list packages" / "list artifacts" / "what's deployed" → detective (not gatekeeper)
- "failed messages" / "what failed" → detective (not gatekeeper)
- "health check" / "spot check" / "verify" → gatekeeper
- "compare DEV and TEST" / "diff iFlow across envs" → gatekeeper
- "certificates" / "keystores" / "credentials" → detective
- "Groovy" / "script" → flowlens

## Context awareness
If the user says "it", "that iFlow", "same one", "the above", substitute from session context.

## Environment defaults
Default to "DEV" if no environment mentioned. Valid: DEV, TEST, PROD.

## Output format — return ONLY valid JSON, no markdown fences:
{
  "target": "gatekeeper" | "flowlens" | "detective" | "both" | "orchestrator",
  "gatekeeperTool":  string | null,
  "flowlensAction":  string | null,
  "detectiveAction": string | null,
  "params": { ...extracted key-value pairs... },
  "reasoning": "one sentence",
  "confidence": 0.0-1.0
}`;

export class IntentRouter {
  private client: Anthropic;

  constructor() {
    this.client = createAnthropicClient();
  }

  async classify(userMessage: string, context: SessionContext): Promise<ClassifiedIntent> {
    const contextSummary = buildContextSummary(context);
    const userContent = contextSummary
      ? `Session context:\n${contextSummary}\n\nUser message: ${userMessage}`
      : `User message: ${userMessage}`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: INTENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}';

    // Strip markdown code fences — Claude sometimes wraps JSON in ```json ... ```
    const cleaned = raw
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/\s*```\s*$/im, '')
      .trim();

    try {
      // Try direct parse first
      let jsonStr = cleaned;
      if (!jsonStr.startsWith('{')) {
        // Find outermost { } block
        const start = jsonStr.indexOf('{');
        const end   = jsonStr.lastIndexOf('}');
        if (start !== -1 && end > start) jsonStr = jsonStr.slice(start, end + 1);
      }
      const parsed = JSON.parse(jsonStr) as ClassifiedIntent;
      // Ensure required fields have defaults
      return {
        target:          parsed.target          ?? 'orchestrator',
        gatekeeperTool:  parsed.gatekeeperTool  ?? undefined,
        flowlensAction:  parsed.flowlensAction  ?? undefined,
        detectiveAction: parsed.detectiveAction ?? undefined,
        params:          parsed.params          ?? {},
        reasoning:       parsed.reasoning       ?? 'Classification failed',
        confidence:      parsed.confidence      ?? 0.5,
      };
    } catch {
      return {
        target: 'orchestrator',
        params: {},
        reasoning: `Could not parse routing decision. Raw: ${cleaned.slice(0, 120)}`,
        confidence: 0,
      };
    }
  }
}

function buildContextSummary(ctx: SessionContext): string {
  const parts: string[] = [];
  if (ctx.lastIflow)       parts.push(`Last iFlow discussed: ${ctx.lastIflow}`);
  if (ctx.lastEnvironment) parts.push(`Last environment: ${ctx.lastEnvironment}`);
  if (ctx.lastPackage)     parts.push(`Last package: ${ctx.lastPackage}`);
  if (ctx.lastGroovyScript) parts.push(`A Groovy script was recently generated/modified`);
  if (ctx.turns.length > 0) {
    const recent = ctx.turns.slice(-3).map(t => `${t.role}: ${t.content.slice(0, 80)}`).join('\n');
    parts.push(`Recent conversation:\n${recent}`);
  }
  return parts.join('\n');
}
