// src/orchestrator/maestro.ts — Core orchestration engine
//
// Maestro is the top-level controller that:
//  1. Classifies the user's natural-language intent (IntentRouter)
//  2. Dispatches to the correct sub-agent(s) (Gatekeeper-Goofy / FlowLens)
//  3. Synthesizes the results into a coherent response (ResponseSynthesizer)
//  4. Maintains session context across turns (ContextManager)

import { randomUUID } from 'node:crypto';
import { IntentRouter } from './intentRouter.js';
import { ContextManager } from './contextManager.js';
import { ResponseSynthesizer } from './responseSynthesizer.js';
import { GatekeeperAgent } from '../agents/gatekeeperAgent.js';
import { FlowLensAgent } from '../agents/flowlensAgent.js';
import { IntegrationDetectiveAgent } from '../agents/integrationDetectiveAgent.js';
import { McpRegistry }   from '../mcp/index.js';
import type {
  AgentResponse,
  ClassifiedIntent,
  OrchestratorResponse,
  AgentConfig,
} from './types.js';
import { logger } from '../utils/logger.js';

const CAPABILITY_HELP = `
**Maestro — SAP CPI Intelligence Orchestrator**

I route your requests to two specialised sub-agents:

| Agent | What it does |
|-------|-------------|
| **Gatekeeper-Goofy** | Health checks (GUARDIAN), cross-tenant comparisons (MIRROR) |
| **FlowLens AI** | iFlow design analysis & explanation, Groovy script generation & simulation |
| **Integration Detective** | Message monitoring, failed messages, keystores, packages, deploy, SAP Hub, partner directory |

**Example requests:**
- "Spot-check DuplicateOpportunityForecastExclusion in DEV"
- "Compare UpdateOpportunityInC4CPostHook between DEV and TEST"
- "List all packages"
- "What failed in the last hour?"
- "Show me expiring certificates"
- "Generate a Groovy script that reads a JSON body and sets an OData filter header"
- "Explain the UpdateInvPartyInSAPCPQ2QuoteFromC4CV2Opportunity iFlow"
- "Search SAP Hub for CPQ integration content"
`.trim();

export class Maestro {
  private router: IntentRouter;
  private context: ContextManager;
  private synthesizer: ResponseSynthesizer;
  private gatekeeper: GatekeeperAgent;
  private flowlens: FlowLensAgent;
  private detective: IntegrationDetectiveAgent;

  constructor(config: AgentConfig) {
    this.router      = new IntentRouter();
    this.context     = new ContextManager(
      parseInt(process.env.MAESTRO_MAX_HISTORY ?? '20', 10),
    );
    this.synthesizer = new ResponseSynthesizer();
    this.gatekeeper  = new GatekeeperAgent(config.gatekeeper);
    this.flowlens    = new FlowLensAgent(config.flowlens);
    this.detective   = new IntegrationDetectiveAgent();
  }

  async process(userMessage: string): Promise<OrchestratorResponse> {
    const taskId = randomUUID();
    logger.info(`[maestro] task=${taskId} started`);

    try {
      return await this._processInternal(taskId, userMessage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[maestro] task=${taskId} unhandled error: ${msg}`);
      this.context.addAssistantTurn(`Error: ${msg}`);
      return this.buildResponse(taskId, 'failed', userMessage,
        { target: 'orchestrator', params: {}, reasoning: 'Internal error', confidence: 0 },
        [],
        `An internal error occurred: ${msg}`,
      );
    }
  }

  private async _processInternal(taskId: string, userMessage: string): Promise<OrchestratorResponse> {

    // Record the user turn and extract any entities
    this.context.addUserTurn(userMessage);

    // Classify intent
    const intent = await this.router.classify(userMessage, this.context.context);
    logger.info(`[maestro] task=${taskId} intent=${intent.target} tool=${intent.gatekeeperTool ?? intent.flowlensAction} confidence=${intent.confidence.toFixed(2)}`);

    // Handle orchestrator-only (help / meta) queries
    if (intent.target === 'orchestrator') {
      const answer = CAPABILITY_HELP;
      this.context.addAssistantTurn(answer, ['orchestrator']);
      return this.buildResponse(taskId, 'completed', userMessage, intent, [], answer);
    }

    // Dispatch to sub-agents — run in parallel when both are needed
    const agentResponses: AgentResponse[] = [];

    const gatekeeperNeeded = intent.target === 'gatekeeper' || intent.target === 'both';
    const flowlensNeeded   = intent.target === 'flowlens'   || intent.target === 'both';
    const detectiveNeeded  = intent.target === 'detective';

    const tasks: Promise<void>[] = [];

    if (gatekeeperNeeded) {
      if (!intent.gatekeeperTool) {
        agentResponses.push({
          agent: 'gatekeeper', success: false, content: '',
          durationMs: 0, error: 'No Gatekeeper tool resolved for this intent',
        });
      } else {
        tasks.push(
          this.gatekeeper.invoke(intent.gatekeeperTool, intent.params)
            .then(resp => { agentResponses.push(resp); })
        );
      }
    }

    if (flowlensNeeded) {
      if (!intent.flowlensAction) {
        agentResponses.push({
          agent: 'flowlens', success: false, content: '',
          durationMs: 0, error: 'No FlowLens action resolved for this intent',
        });
      } else {
        tasks.push(
          this.flowlens.invoke(intent.flowlensAction, intent.params)
            .then(resp => {
              agentResponses.push(resp);
              if (intent.flowlensAction!.includes('groovy') && resp.success) {
                const match = resp.content.match(/```groovy\n([\s\S]+?)\n```/);
                if (match) this.context.updateLastGroovyScript(match[1]);
              }
            })
        );
      }
    }

    if (detectiveNeeded) {
      if (!intent.detectiveAction) {
        agentResponses.push({
          agent: 'detective', success: false, content: '',
          durationMs: 0, error: 'No Integration Detective action resolved for this intent',
        });
      } else {
        tasks.push(
          this.detective.invoke(intent.detectiveAction, intent.params)
            .then(resp => { agentResponses.push(resp); })
        );
      }
    }

    // Wait for all agent loops to complete
    await Promise.all(tasks);

    const anyFailed = agentResponses.some(r => !r.success);
    const taskState = anyFailed ? 'failed' : 'completed';

    // Synthesize final answer
    const synthesized = await this.synthesizer.synthesize(userMessage, intent, agentResponses);
    this.context.addAssistantTurn(synthesized, [intent.target]);

    logger.info(`[maestro] task=${taskId} state=${taskState}`);
    return this.buildResponse(taskId, taskState, userMessage, intent, agentResponses, synthesized);
  }

  async checkAgentAvailability(): Promise<{ gatekeeper: boolean; flowlens: boolean; detective: boolean }> {
    const [gk, fl, det] = await Promise.all([
      this.gatekeeper.isAvailable(),
      this.flowlens.isAvailable(),
      this.detective.isAvailable(),
    ]);
    return { gatekeeper: gk, flowlens: fl, detective: det };
  }

  resetSession(): void {
    this.context.reset();
  }

  shutdown(): void {
    this.gatekeeper.disconnect();
    McpRegistry.disconnectAll();
  }

  private buildResponse(
    taskId: string,
    taskState: import('./types.js').TaskState,
    userMessage: string,
    intent: ClassifiedIntent,
    agentResponses: AgentResponse[],
    synthesizedAnswer: string,
  ): OrchestratorResponse {
    return {
      taskId,
      taskState,
      userMessage,
      intent,
      agentResponses,
      synthesizedAnswer,
      sessionContext: this.context.context,
      completedAt: new Date().toISOString(),
    };
  }
}
