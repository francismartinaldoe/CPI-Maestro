// src/agents/baseAgent.ts — Abstract base class for all sub-agents
//
// Real agents extend this and implement:
//   - name       : their AgentTarget identity
//   - systemPrompt : their persona and instructions
//   - buildTools   : the tools they can call
//   - run()        : the agentic loop entry point

import Anthropic from '@anthropic-ai/sdk';
import type { AgentResponse, AgentTarget } from '../orchestrator/types.js';
import { createAnthropicClient } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export abstract class BaseAgent {
  abstract readonly name: AgentTarget;
  protected abstract readonly systemPrompt: string;
  protected abstract readonly agentLabel: string;

  protected client: Anthropic;

  constructor() {
    this.client = createAnthropicClient();
  }

  abstract isAvailable(): Promise<boolean>;

  /** Entry point called by Maestro. Each agent implements its own reasoning loop. */
  abstract invoke(
    action: string,
    params: Record<string, unknown>,
  ): Promise<AgentResponse>;

  /**
   * Runs a Claude agentic loop with the given tools and task description.
   * Continues looping while Claude requests tool calls.
   * Returns the final text answer.
   */
  protected async runAgentLoop(
    task: string,
    tools: Anthropic.Tool[],
    toolHandler: (name: string, input: Record<string, unknown>) => Promise<string>,
    maxIterations = 10,
  ): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: task },
    ];

    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.client.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 4096,
        system:     this.systemPrompt,
        tools,
        messages,
      });

      logger.debug(`[${this.agentLabel}] iteration=${iterations} stop_reason=${response.stop_reason}`);

      // Append the assistant turn
      messages.push({ role: 'assistant', content: response.content });

      // If no tool calls — agent has finished
      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === 'text',
        );
        return textBlock?.text.trim() ?? '(no response)';
      }

      // Process all tool calls in this response
      if (response.stop_reason === 'tool_use') {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          logger.debug(`[${this.agentLabel}] calling tool=${block.name} input=${JSON.stringify(block.input).slice(0, 120)}`);

          let result: string;
          try {
            result = await toolHandler(block.name, block.input as Record<string, unknown>);
          } catch (err) {
            result = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
          }

          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     result,
          });
        }

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Any other stop reason (max_tokens, etc.) — return what we have
      const lastText = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      return lastText?.text.trim() ?? '(incomplete response)';
    }

    return `(agent did not complete within ${maxIterations} iterations)`;
  }

  protected makeResponse(
    success: boolean,
    content: string,
    durationMs: number,
    opts: { error?: string; rawData?: unknown } = {},
  ): AgentResponse {
    return {
      agent:     this.name,
      success,
      content,
      durationMs,
      error:     opts.error,
      rawData:   opts.rawData,
    };
  }
}
