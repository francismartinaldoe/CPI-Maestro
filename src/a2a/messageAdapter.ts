// src/a2a/messageAdapter.ts — Bidirectional conversion between A2A and Maestro types

import type { A2AMessage, A2ATask, A2AArtifact, TextPart } from './types.js';
import type { OrchestratorResponse } from '../orchestrator/types.js';

/**
 * Extract plain text from an A2A message by concatenating all TextPart values.
 * Non-text parts (file, data) are silently skipped.
 */
export function extractText(message: A2AMessage): string {
  return message.parts
    .filter((p): p is TextPart => p.type === 'text')
    .map(p => p.text)
    .join('\n')
    .trim();
}

/**
 * Convert a completed OrchestratorResponse into an A2ATask ready to return
 * to the A2A client. The synthesized answer becomes the sole artifact.
 */
export function orchestratorResponseToTask(
  response: OrchestratorResponse,
  taskId: string,
): A2ATask {
  const artifact: A2AArtifact = {
    name: 'response',
    parts: [{ type: 'text', text: response.synthesizedAnswer }],
    index: 0,
    lastChunk: true,
  };

  // OrchestratorResponse.taskState values are identical to A2ATaskState strings
  const state = response.taskState === 'completed' ? 'completed' : 'failed';

  return {
    id: taskId,
    status: {
      state,
      timestamp: response.completedAt,
    },
    artifacts: [artifact],
    history: [
      {
        role: 'user',
        parts: [{ type: 'text', text: response.userMessage }],
      },
      {
        role: 'agent',
        parts: [{ type: 'text', text: response.synthesizedAnswer }],
      },
    ],
  };
}
