// src/tools/cpi/deployTools.ts — Integration Detective deployment tools

import type Anthropic from '@anthropic-ai/sdk';

export const DEPLOY_TOOLS: Anthropic.Tool[] = [
  {
    name: 'deploy_artifact',
    description: 'Deploy an artifact version to the CPI runtime. Returns a taskId — use get_deploy_status to confirm outcome.',
    input_schema: { type: 'object' as const, properties: { artifactId: { type: 'string' }, artifactType: { type: 'string' } }, required: ['artifactId'] },
  },
  {
    name: 'undeploy_artifact',
    description: 'Remove an artifact from the CPI runtime.',
    input_schema: { type: 'object' as const, properties: { artifactId: { type: 'string' } }, required: ['artifactId'] },
  },
];
