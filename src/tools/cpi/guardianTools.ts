// src/tools/cpi/guardianTools.ts — Gatekeeper-Goofy CPI tool definitions
// GUARDIAN (spot-check), MIRROR (compare), multi-profile, and supporting CPI queries.

import type Anthropic from '@anthropic-ai/sdk';

export const GUARDIAN_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_profiles',
    description: 'List all configured CPI tenant profiles. Returns profile name, ID, and tenant URL. Call this first whenever the user wants to compare across tenants or hasn\'t specified which profiles to use.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'multi_profile_spotcheck',
    description: 'Run a full GUARDIAN spot-check on the same iFlow across multiple CPI tenant profiles simultaneously and return a side-by-side comparison table. Highlights drift (dimensions where tenants disagree). Use this when the user asks to compare an iFlow across tenants, profiles, or environments.',
    input_schema: {
      type: 'object' as const,
      properties: {
        iflowName:  { type: 'string', description: 'Full or partial iFlow name to check across all tenants' },
        profileIds: { type: 'array', items: { type: 'string' }, description: 'Profile IDs or names to compare. Omit to run against all configured profiles.' },
      },
      required: ['iflowName'],
    },
  },
  {
    name: 'spotcheck_iflow',
    description: 'Run an 8-dimension GUARDIAN health check on a named iFlow (activation, config params, message errors, credentials, keystores, endpoints, JMS queues, design-time artifact).',
    input_schema: {
      type: 'object' as const,
      properties: {
        iflowName:   { type: 'string', description: 'Full or partial iFlow name' },
        environment: { type: 'string', enum: ['DEV', 'TEST', 'PROD'], description: 'Environment to check (default: DEV). Used when no profileId is given.' },
        profileId:   { type: 'string', description: 'Optional named profile ID or name (from list_profiles). Takes precedence over environment.' },
      },
      required: ['iflowName'],
    },
  },
  // Supporting CPI query tools used by Gatekeeper
  { name: 'get_system_status',      description: 'Get overall CPI system health — total, started, error, and stopped artifact counts.',                                                   input_schema: { type: 'object' as const, properties: {} } },
  { name: 'get_runtime_artifacts',  description: 'List all deployed runtime artifacts with their status (STARTED / STOPPED / ERROR).',                                                    input_schema: { type: 'object' as const, properties: {} } },
  { name: 'get_todays_deployments', description: 'List all iFlows deployed today.',                                                                                                        input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_packages',          description: 'List all integration packages in the CPI tenant.',                                                                                        input_schema: { type: 'object' as const, properties: {} } },
  {
    name: 'list_artifacts',
    description: 'List all artifacts inside a specific integration package.',
    input_schema: { type: 'object' as const, properties: { packageId: { type: 'string', description: 'Integration package ID' } }, required: ['packageId'] },
  },
  {
    name: 'get_iflow_content',
    description: 'Download and inspect an iFlow design-time artifact — file list and externalized parameters.',
    input_schema: { type: 'object' as const, properties: { artifactId: { type: 'string', description: 'iFlow artifact ID' } }, required: ['artifactId'] },
  },
  {
    name: 'get_failed_messages',
    description: 'List failed messages from CPI message processing logs.',
    input_schema: { type: 'object' as const, properties: { artifactName: { type: 'string', description: 'Filter by iFlow name (optional)' }, fromDate: { type: 'string', description: 'ISO date string (optional)' }, top: { type: 'number', description: 'Max results (default: 20)' } } },
  },
  {
    name: 'get_message_details',
    description: 'Get full details for a specific CPI message processing log entry.',
    input_schema: { type: 'object' as const, properties: { messageId: { type: 'string', description: 'CPI message GUID' } }, required: ['messageId'] },
  },
  { name: 'list_keystores',         description: 'List all keystore entries including alias, type, and expiry date.',                                                                      input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_credentials',       description: 'List all user credential (Basic Auth) aliases in the CPI tenant.',                                                                       input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_oauth_credentials', description: 'List all OAuth2 client credential configurations.',                                                                                      input_schema: { type: 'object' as const, properties: {} } },
  {
    name: 'list_service_endpoints',
    description: 'List runtime service endpoints exposed by deployed iFlows.',
    input_schema: { type: 'object' as const, properties: { protocol: { type: 'string', description: 'Filter by protocol e.g. HTTPS, SOAP (optional)' } } },
  },
  { name: 'list_jms_queues',        description: 'List JMS queue resources with current depth, capacity, and consumer count.',                                                             input_schema: { type: 'object' as const, properties: {} } },
  {
    name: 'list_data_store_entries',
    description: 'List data store entries persisted by iFlows.',
    input_schema: { type: 'object' as const, properties: { dataStoreName: { type: 'string', description: 'Filter by data store name (optional)' }, integrationFlow: { type: 'string', description: 'Filter by iFlow name (optional)' }, top: { type: 'number', description: 'Max results (default: 50)' } } },
  },
  {
    name: 'list_variables',
    description: 'List integration flow variables — runtime values persisted between executions.',
    input_schema: { type: 'object' as const, properties: { integrationFlow: { type: 'string', description: 'Filter by iFlow name (optional)' } } },
  },
  {
    name: 'ping_endpoint',
    description: 'Check if a CPI service endpoint URL is reachable.',
    input_schema: { type: 'object' as const, properties: { url: { type: 'string', description: 'Full URL to ping' } }, required: ['url'] },
  },
];
