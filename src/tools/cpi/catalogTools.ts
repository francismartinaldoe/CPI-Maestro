// src/tools/cpi/catalogTools.ts — Integration Detective content catalog tools

import type Anthropic from '@anthropic-ai/sdk';

export const CATALOG_TOOLS: Anthropic.Tool[] = [
  { name: 'list_packages',          description: 'All integration packages in the tenant.',                                                                input_schema: { type: 'object' as const, properties: {} } },
  {
    name: 'list_artifacts',
    description: 'All artifacts in an integration package.',
    input_schema: { type: 'object' as const, properties: { packageId: { type: 'string' } }, required: ['packageId'] },
  },
  {
    name: 'get_artifact',
    description: 'Metadata for a specific artifact.',
    input_schema: { type: 'object' as const, properties: { artifactId: { type: 'string' }, artifactType: { type: 'string' } }, required: ['artifactId','artifactType'] },
  },
  {
    name: 'get_iflow_configurations',
    description: 'All externalized parameters for an iFlow.',
    input_schema: { type: 'object' as const, properties: { artifactId: { type: 'string' } }, required: ['artifactId'] },
  },
  {
    name: 'list_service_endpoints',
    description: 'Runtime service endpoints exposed by deployed iFlows.',
    input_schema: { type: 'object' as const, properties: { protocol: { type: 'string' } } },
  },
  {
    name: 'list_value_mappings',
    description: 'Value mapping lookup table artifacts.',
    input_schema: { type: 'object' as const, properties: { packageId: { type: 'string' } } },
  },
  {
    name: 'list_message_mappings',
    description: 'Message mapping artifacts.',
    input_schema: { type: 'object' as const, properties: { packageId: { type: 'string' } } },
  },
  {
    name: 'list_script_collections',
    description: 'Reusable Groovy/JavaScript script collections.',
    input_schema: { type: 'object' as const, properties: { packageId: { type: 'string' } } },
  },
  {
    name: 'get_deploy_status',
    description: 'Check status of a build/deploy task by taskId.',
    input_schema: { type: 'object' as const, properties: { taskId: { type: 'string' } }, required: ['taskId'] },
  },
];
