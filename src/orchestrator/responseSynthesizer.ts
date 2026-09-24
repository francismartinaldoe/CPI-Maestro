// src/orchestrator/responseSynthesizer.ts — Merges outputs from multiple agents
// into a single coherent natural-language answer for the user.

import Anthropic from '@anthropic-ai/sdk';
import type { AgentResponse, ClassifiedIntent } from './types.js';
import { createAnthropicClient } from '../utils/config.js';

const SYNTHESIS_SYSTEM = `You are Maestro, an AI orchestrator for SAP Cloud Integration (CPI).
Your job is to synthesize results from one or more specialized sub-agents into a clear,
helpful answer for the user.

Rules:
- Write in a direct, professional tone — no fluff.
- Lead with the most important fact (status, verdict, key finding).
- Use markdown tables or bullet lists when presenting structured data.
- If a check failed or an error occurred, say so clearly.
- If results come from multiple agents, integrate them into one coherent response.
- Keep responses concise — do not repeat raw JSON or logs unless specifically asked.
- Use PASS/FAIL/DRIFT/IN SYNC/MISSING/MATCH vocabulary from the source data.`;

export class ResponseSynthesizer {
  private client: Anthropic;

  constructor() {
    this.client = createAnthropicClient();
  }

  async synthesize(
    userMessage: string,
    intent: ClassifiedIntent,
    responses: AgentResponse[],
  ): Promise<string> {
    // If only one response and it's short, return it verbatim
    if (responses.length === 1 && responses[0].content.length < 800) {
      if (responses[0].success) return responses[0].content;
    }

    const agentOutputs = responses
      .map(r => {
        const header = `## ${r.agent.toUpperCase()} (${r.success ? 'OK' : 'ERROR'}, ${r.durationMs}ms)`;
        const body   = r.success ? r.content : `Error: ${r.error}`;
        return `${header}\n${body}`;
      })
      .join('\n\n---\n\n');

    const prompt = `User asked: "${userMessage}"\nIntent: ${intent.reasoning}\n\nAgent outputs:\n${agentOutputs}`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      system: SYNTHESIS_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : agentOutputs;
  }
}
