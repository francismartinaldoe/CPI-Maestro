// src/tools/cpi/monitoringTools.ts — Integration Detective runtime + message tools

import type Anthropic from '@anthropic-ai/sdk';

export const MONITORING_TOOLS: Anthropic.Tool[] = [
  // Runtime
  { name: 'get_system_status',          description: 'Overall CPI tenant health — total/started/error/stopped counts.',          input_schema: { type: 'object' as const, properties: {} } },
  { name: 'get_runtime_artifacts',      description: 'All deployed artifacts with status (STARTED/STOPPED/ERROR).',               input_schema: { type: 'object' as const, properties: {} } },
  { name: 'get_todays_deployments',     description: 'iFlows deployed today.',                                                     input_schema: { type: 'object' as const, properties: {} } },
  {
    name: 'set_iflow_log_level',
    description: 'Set log level on a deployed iFlow (TRACE auto-reverts after ~10 min).',
    input_schema: { type: 'object' as const, properties: { artifactId: { type: 'string' }, logLevel: { type: 'string', enum: ['TRACE','DEBUG','INFO','WARN','ERROR'] } }, required: ['artifactId'] },
  },
  // Messages
  {
    name: 'get_failed_messages',
    description: 'List failed messages, optionally filtered by iFlow name and date.',
    input_schema: { type: 'object' as const, properties: { artifactName: { type: 'string' }, fromDate: { type: 'string' }, top: { type: 'number' } } },
  },
  {
    name: 'get_message_details',
    description: 'Full details for a specific message GUID.',
    input_schema: { type: 'object' as const, properties: { messageId: { type: 'string' } }, required: ['messageId'] },
  },
  {
    name: 'get_trace_log',
    description: 'Step-by-step trace for a message (requires TRACE level enabled).',
    input_schema: { type: 'object' as const, properties: { messageId: { type: 'string' } }, required: ['messageId'] },
  },
  {
    name: 'list_message_store_entries',
    description: 'Messages persisted by Persist steps.',
    input_schema: { type: 'object' as const, properties: { messageStoreId: { type: 'string' }, top: { type: 'number' } } },
  },
  {
    name: 'get_message_store_entry',
    description: 'Full content of a stored message.',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'list_idempotent_entries',
    description: 'Duplicate-check records for exactly-once processing.',
    input_schema: { type: 'object' as const, properties: { top: { type: 'number' } } },
  },
  {
    name: 'get_api_analytics',
    description: 'API call counts, latency, error rates.',
    input_schema: { type: 'object' as const, properties: { filter: { type: 'string' }, top: { type: 'number' } } },
  },
  // Stores
  {
    name: 'list_data_store_entries',
    description: 'Data store entries, optionally filtered by store name or iFlow.',
    input_schema: { type: 'object' as const, properties: { dataStoreName: { type: 'string' }, integrationFlow: { type: 'string' }, top: { type: 'number' } } },
  },
  {
    name: 'delete_data_store_entry',
    description: 'Delete a specific data store entry.',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' }, dataStoreName: { type: 'string' }, integrationFlow: { type: 'string' }, type: { type: 'string' } }, required: ['id','dataStoreName','integrationFlow','type'] },
  },
  {
    name: 'list_variables',
    description: 'Runtime iFlow variables.',
    input_schema: { type: 'object' as const, properties: { integrationFlow: { type: 'string' } } },
  },
  { name: 'list_jms_queues',    description: 'JMS queues with depth, capacity, consumer count.',    input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_jms_brokers',   description: 'JMS broker capacity and queue count.',                input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_number_ranges', description: 'Auto-increment number range counters.',               input_schema: { type: 'object' as const, properties: {} } },
  // Logs
  {
    name: 'list_log_files',
    description: 'System log files (HTTP, trace, audit).',
    input_schema: { type: 'object' as const, properties: { application: { type: 'string' }, logFileType: { type: 'string' } } },
  },
  { name: 'list_log_archives', description: 'Compressed log archive bundles.', input_schema: { type: 'object' as const, properties: {} } },
];
