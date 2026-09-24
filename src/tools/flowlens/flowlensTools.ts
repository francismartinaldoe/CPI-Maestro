// src/tools/flowlens/flowlensTools.ts — FlowLens AI tool definitions

import type Anthropic from '@anthropic-ai/sdk';

export const FLOWLENS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'analyze_iflow',
    description: 'Fetch and analyse an SAP CPI iFlow. Returns metadata, file list, adapters, scripts, and externalized parameters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        iflowId:  { type: 'string', description: 'iFlow artifact ID or name' },
        question: { type: 'string', description: 'Specific question about the iFlow (optional)' },
      },
      required: ['iflowId'],
    },
  },
  {
    name: 'groovy',
    description: 'Generate, modify, explain, or simulate a Groovy script for SAP CPI.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action:      { type: 'string', enum: ['generate', 'modify', 'explain', 'simulate'], description: 'What to do with the script' },
        description: { type: 'string', description: 'What the script should do (for generate/modify)' },
        script:      { type: 'string', description: 'Existing Groovy script (for modify/explain/simulate)' },
        payload:     { type: 'string', description: 'Sample JSON/XML payload (for simulate)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_runtime_status',
    description: 'Get runtime status of all deployed iFlows.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_failed_messages',
    description: 'List failed messages from CPI message processing logs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        artifactName: { type: 'string', description: 'Filter by iFlow name (optional)' },
        fromDate:     { type: 'string', description: 'ISO date string (optional)' },
        top:          { type: 'number', description: 'Max results (default: 20)' },
      },
    },
  },
  {
    name: 'list_owners',
    description: 'Look up the owner, email, and team for one or all iFlows.',
    input_schema: {
      type: 'object' as const,
      properties: {
        iflowName: { type: 'string', description: 'iFlow name to look up (omit for full list)' },
      },
    },
  },
];
