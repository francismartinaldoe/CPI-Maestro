// src/mcp/CPI_MCP/toolRegistry.ts — All tool definitions (schemas only, no logic)
//
// Every tool is audience: 'direct' — this MCP server is designed for orchestrators.
// Wizard/interactive tools do not belong here.

export interface ToolDefinition {
  name:        string;
  description: string;
  inputSchema: {
    type:        'object';
    properties:  Record<string, unknown>;
    required?:   string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [

  // ── GUARDIAN health check ────────────────────────────────────────────────
  {
    name: 'spotcheck_iflow',
    description:
      'Run an 8-dimension GUARDIAN health check on a named iFlow: activation status, config parameters, ' +
      'message errors (7d), credentials, keystores/certificates, service endpoints, JMS queues, design-time artifact. ' +
      'Use for "spot-check", "health-check", "verify", "is this iFlow healthy".',
    inputSchema: {
      type: 'object',
      properties: {
        iflowName:   { type: 'string', description: 'Full or partial iFlow name (case-insensitive search)' },
        environment: { type: 'string', enum: ['DEV', 'TEST', 'PROD'], description: 'Environment to check (default: DEV)' },
      },
      required: ['iflowName'],
    },
  },

  // ── Artifacts ────────────────────────────────────────────────────────────
  {
    name: 'list_packages',
    description: 'List all integration packages in the CPI tenant.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_artifacts',
    description: 'List all artifacts (iFlows, value mappings, scripts) inside a specific integration package.',
    inputSchema: {
      type: 'object',
      properties: { packageId: { type: 'string', description: 'Integration package ID' } },
      required: ['packageId'],
    },
  },
  {
    name: 'get_iflow_content',
    description:
      'Download and inspect an iFlow design-time artifact. ' +
      'Returns the ZIP file list (BPMN2, Groovy scripts, properties) and all externalized parameters.',
    inputSchema: {
      type: 'object',
      properties: { artifactId: { type: 'string', description: 'iFlow artifact ID' } },
      required: ['artifactId'],
    },
  },
  {
    name: 'get_runtime_artifacts',
    description: 'List all deployed runtime artifacts with status (STARTED / STOPPED / ERROR).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_system_status',
    description: 'Get overall CPI system health — total, started, error, and stopped artifact counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_todays_deployments',
    description: 'List all iFlows deployed today from CPI runtime.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Message processing logs ───────────────────────────────────────────────
  {
    name: 'get_failed_messages',
    description: 'List failed messages from CPI message processing logs.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactName: { type: 'string', description: 'Filter by iFlow name (optional)' },
        fromDate:     { type: 'string', description: 'ISO 8601 date string (optional), e.g. 2026-06-01T00:00:00Z' },
        top:          { type: 'number', description: 'Max results to return (default: 20)' },
      },
    },
  },
  {
    name: 'get_message_details',
    description: 'Get full details for a specific CPI message processing log entry.',
    inputSchema: {
      type: 'object',
      properties: { messageId: { type: 'string', description: 'CPI message GUID' } },
      required: ['messageId'],
    },
  },

  // ── Security ──────────────────────────────────────────────────────────────
  {
    name: 'list_keystores',
    description: 'List all keystore entries in the CPI tenant including alias, type, and expiry date.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_credentials',
    description: 'List all user credential (Basic Auth) aliases configured in the CPI tenant.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_oauth_credentials',
    description: 'List all OAuth2 client credential configurations in the CPI tenant.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Monitoring resources ──────────────────────────────────────────────────
  {
    name: 'list_service_endpoints',
    description: 'List runtime service endpoints exposed by deployed iFlows.',
    inputSchema: {
      type: 'object',
      properties: { protocol: { type: 'string', description: 'Filter by protocol e.g. HTTPS, SOAP (optional)' } },
    },
  },
  {
    name: 'list_jms_queues',
    description: 'List JMS queue resources with current depth, capacity, and consumer count.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_data_store_entries',
    description: 'List data store entries persisted by iFlows.',
    inputSchema: {
      type: 'object',
      properties: {
        dataStoreName:   { type: 'string', description: 'Filter by data store name (optional)' },
        integrationFlow: { type: 'string', description: 'Filter by iFlow name (optional)' },
        top:             { type: 'number', description: 'Max results (default: 50)' },
      },
    },
  },
  {
    name: 'list_variables',
    description: 'List integration flow variables — runtime values persisted between executions.',
    inputSchema: {
      type: 'object',
      properties: { integrationFlow: { type: 'string', description: 'Filter by iFlow name (optional)' } },
    },
  },
  {
    name: 'ping_endpoint',
    description: 'Check if a CPI service endpoint URL is reachable. Returns status code and reachability.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Full URL to ping' } },
      required: ['url'],
    },
  },
];
