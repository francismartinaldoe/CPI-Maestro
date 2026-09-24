// mcp/toolRegistry.ts — All tool definitions for ListTools (no business logic)
//
// audience field marks who should call each tool:
//   'interactive' — stateful wizard steps; human sessions only; NOT safe to call from an orchestrator
//   'direct'      — stateless; safe to call from an orchestrator or in parallel
//   'session'     — session management utilities; human sessions only

export const TOOL_DEFINITIONS = [
  // ── Mode selection ──────────────────────────────────────────────────────────
  {
    name: 'select_mode',
    audience: 'interactive',
    description:
      'Show the GUARDIAN / MIRROR mode selection menu and record the user\'s choice. ' +
      'ALWAYS call this first when starting a new session or when the user says "start", "begin", "menu", or replies 1/2 to the startup menu.',
    inputSchema: {
      type: 'object',
      properties: {
        choice: { type: 'string', enum: ['1', '2', 'GUARDIAN', 'MIRROR'], description: 'User\'s mode selection (optional — omit to show menu).' },
      },
      required: [],
    },
  },

  // ── GUARDIAN wizard steps ───────────────────────────────────────────────────
  {
    name: 'guardian_set_environment',
    audience: 'interactive',
    description: 'GUARDIAN Step 1 of 4 — record which environment the user selected (DEV/TEST/PROD).',
    inputSchema: {
      type: 'object',
      properties: { environment: { type: 'string', enum: ['DEV', 'TEST', 'PROD'] } },
      required: ['environment'],
    },
  },
  {
    name: 'guardian_discover_by_date',
    audience: 'interactive',
    description: 'GUARDIAN Step 3 of 4 (scope branch B) — fetch iFlows deployed on a specific date in the selected GUARDIAN environment.',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'Deployment date YYYY-MM-DD' } },
      required: ['date'],
    },
  },
  {
    name: 'guardian_set_iflow_list',
    audience: 'interactive',
    description: 'GUARDIAN Step 3 of 4 (scope branch A) — store the comma-separated list of iFlow IDs/names the user provided.',
    inputSchema: {
      type: 'object',
      properties: { iflowList: { type: 'string', description: 'Comma-separated iFlow names or IDs' } },
      required: ['iflowList'],
    },
  },
  {
    name: 'guardian_run',
    audience: 'interactive',
    description:
      'GUARDIAN Step 4 of 4 — execute spot-checks on all iFlows in the pending scope. ' +
      'Call after the user confirms with "yes" / "proceed" following the discovery table.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── MIRROR wizard steps ─────────────────────────────────────────────────────
  {
    name: 'mirror_set_source_env',
    audience: 'interactive',
    description: 'MIRROR Step 1 of 6 — record the source environment the user is promoting FROM.',
    inputSchema: {
      type: 'object',
      properties: { environment: { type: 'string', enum: ['DEV', 'TEST', 'PROD'] } },
      required: ['environment'],
    },
  },
  {
    name: 'mirror_set_target_env',
    audience: 'interactive',
    description: 'MIRROR Step 2 of 6 — record the target environment the user is promoting TO. Must differ from source.',
    inputSchema: {
      type: 'object',
      properties: { environment: { type: 'string', enum: ['DEV', 'TEST', 'PROD'] } },
      required: ['environment'],
    },
  },
  {
    name: 'mirror_discover_by_date',
    audience: 'interactive',
    description: 'MIRROR Step 5 of 6 (scope branch B) — fetch iFlows deployed on a given date in the SOURCE environment.',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'Deployment date YYYY-MM-DD' } },
      required: ['date'],
    },
  },
  {
    name: 'mirror_set_iflow_list',
    audience: 'interactive',
    description: 'MIRROR Step 5 of 6 (scope branch A) — store the comma-separated list of iFlow names/IDs to compare.',
    inputSchema: {
      type: 'object',
      properties: { iflowList: { type: 'string' } },
      required: ['iflowList'],
    },
  },
  {
    name: 'mirror_run',
    audience: 'interactive',
    description:
      'MIRROR Step 6 of 6 — execute the comparison across all iFlows in the pending scope. ' +
      'Call after the user confirms with "yes" / "proceed".',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Session utilities ───────────────────────────────────────────────────────
  {
    name: 'get_spot_check_status',
    audience: 'session',
    description: 'Quick activation status for a deployed iFlow without running full checks.',
    inputSchema: {
      type: 'object',
      properties: { iflowId: { type: 'string' } },
      required: [],
    },
  },
  {
    name: 'open_reports',
    audience: 'session',
    description: 'Open the latest PPTX and/or Excel report files on the user\'s machine.',
    inputSchema: {
      type: 'object',
      properties: { file: { type: 'string', enum: ['excel', 'pptx', 'both'] } },
      required: [],
    },
  },
  {
    name: 'get_session_context',
    audience: 'session',
    description: 'Return the full session history — all runs since the server started.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'clear_session',
    audience: 'session',
    description: 'Wipe the in-memory session history for this chat window.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Legacy compatibility ────────────────────────────────────────────────────
  {
    name: 'run_spot_check',
    audience: 'direct',
    description: 'Direct GUARDIAN run by iFlow name or ID (skips the step-by-step wizard). Uses credentials already in .env.',
    inputSchema: {
      type: 'object',
      properties: {
        iflowName:    { type: 'string' },
        iflowId:      { type: 'string' },
        packageId:    { type: 'string' },
        environment:  { type: 'string', enum: ['DEV', 'TEST', 'PRE-PROD', 'PROD'] },
        generatePptx: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'get_todays_deployments',
    audience: 'direct',
    description: 'Fetch all iFlows deployed today from CPI runtime.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'run_todays_spot_checks',
    audience: 'direct',
    description: 'Run spot-checks on all iFlows deployed today (after get_todays_deployments).',
    inputSchema: {
      type: 'object',
      properties: { environment: { type: 'string', enum: ['DEV', 'TEST', 'PRE-PROD', 'PROD'] } },
      required: [],
    },
  },

  // ── High-level agent tools — PRIMARY ENTRY POINTS FOR ORCHESTRATORS ─────────
  {
    name: 'batch_compare',
    audience: 'direct',
    description:
      'Run a MIRROR comparison for all iFlows in iflow-watchlist.json and generate a combined HTML report. ' +
      'Use when the user says "batch compare", "compare all", "run watchlist", or "generate batch report". ' +
      'ORCHESTRATOR: safe to call directly; reads watchlist from disk; returns per-iFlow MATCH/DRIFT/INCOMPLETE verdicts.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceEnv: { type: 'string', enum: ['DEV', 'TEST', 'PROD'], description: 'Source environment (default: from watchlist or DEV)' },
        targetEnv: { type: 'string', enum: ['DEV', 'TEST', 'PROD'], description: 'Target environment (default: from watchlist or TEST)' },
      },
      required: [],
    },
  },
  {
    name: 'compare_iflow',
    audience: 'direct',
    description:
      'Run a full MIRROR comparison report for a named iFlow between two environments (DEV, TEST, or PROD). ' +
      'Returns a 4-section report: iFlow Identity, Adapter Channels, Externalized Parameters, Summary. ' +
      'Use this when asked to "compare", "diff", "mirror", or "check differences" of an iFlow between environments. ' +
      'ORCHESTRATOR: primary MIRROR entry point — stateless, parallel-safe.',
    inputSchema: {
      type: 'object',
      properties: {
        iflowName:  { type: 'string', description: 'Full or partial iFlow name (case-insensitive search)' },
        sourceEnv:  { type: 'string', enum: ['DEV', 'TEST', 'PROD'], description: 'Source environment (default: DEV)' },
        targetEnv:  { type: 'string', enum: ['DEV', 'TEST', 'PROD'], description: 'Target environment (default: TEST)' },
      },
      required: ['iflowName'],
    },
  },
  {
    name: 'spotcheck_iflow',
    audience: 'direct',
    description:
      'Run a full GUARDIAN spot-check on a named iFlow in a single environment. ' +
      'Returns an 8-check health report: activation, endpoint, credentials, value mappings, smoke test, config parity, security, log level. ' +
      'Use this when asked to "spot check", "health check", "verify", or "check status" of an iFlow. ' +
      'ORCHESTRATOR: primary GUARDIAN entry point — stateless, parallel-safe.',
    inputSchema: {
      type: 'object',
      properties: {
        iflowName:   { type: 'string', description: 'Full or partial iFlow name (case-insensitive search)' },
        environment: { type: 'string', enum: ['DEV', 'TEST', 'PROD'], description: 'Environment to check (default: DEV)' },
      },
      required: ['iflowName'],
    },
  },

  // ── Direct CPI query tools ──────────────────────────────────────────────────
  {
    name: 'list_packages',
    audience: 'direct',
    description: 'List all integration packages in the CPI tenant.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_artifacts',
    audience: 'direct',
    description: 'List all artifacts (iFlows, mappings, scripts) in a specific integration package.',
    inputSchema: {
      type: 'object',
      properties: { packageId: { type: 'string', description: 'Integration package ID' } },
      required: ['packageId'],
    },
  },
  {
    name: 'get_iflow_content',
    audience: 'direct',
    description: 'Download and extract an iFlow design-time artifact. Returns BPMN2 flow XML, adapter configurations, externalized parameters, and resource list.',
    inputSchema: {
      type: 'object',
      properties: { artifactId: { type: 'string', description: 'iFlow artifact ID' } },
      required: ['artifactId'],
    },
  },
  {
    name: 'get_runtime_artifacts',
    audience: 'direct',
    description: 'List all deployed runtime artifacts with their deployment status (STARTED, STOPPED, ERROR).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_artifact',
    audience: 'direct',
    description: 'Get metadata and configuration details for a specific artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId:   { type: 'string' },
        artifactType: { type: 'string', description: 'IntegrationFlow | MessageMapping | ScriptCollection | ValueMapping' },
      },
      required: ['artifactId', 'artifactType'],
    },
  },
  {
    name: 'get_failed_messages',
    audience: 'direct',
    description: 'List failed messages from CPI message processing logs.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactName: { type: 'string', description: 'Filter by iFlow name (optional)' },
        fromDate:     { type: 'string', description: 'ISO date string (optional)' },
        top:          { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_message_details',
    audience: 'direct',
    description: 'Get full message processing log details for a specific CPI message ID.',
    inputSchema: {
      type: 'object',
      properties: { messageId: { type: 'string', description: 'CPI message GUID' } },
      required: ['messageId'],
    },
  },
  {
    name: 'get_system_status',
    audience: 'direct',
    description: 'Get overall CPI system health — total/started/error/stopped artifact counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_service_endpoints',
    audience: 'direct',
    description: 'List runtime service endpoints exposed by deployed iFlows.',
    inputSchema: {
      type: 'object',
      properties: { protocol: { type: 'string', description: 'Filter by protocol e.g. HTTPS, SOAP (optional)' } },
      required: [],
    },
  },
  {
    name: 'list_jms_queues',
    audience: 'direct',
    description: 'List JMS queue resources with current depth, capacity, and consumer status.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_data_store_entries',
    audience: 'direct',
    description: 'List data store entries persisted by iFlows.',
    inputSchema: {
      type: 'object',
      properties: {
        dataStoreName:   { type: 'string', description: 'Filter by data store name (optional)' },
        integrationFlow: { type: 'string', description: 'Filter by iFlow name (optional)' },
        top:             { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'list_variables',
    audience: 'direct',
    description: 'List integration flow variables — runtime variables persisted between executions.',
    inputSchema: {
      type: 'object',
      properties: { integrationFlow: { type: 'string', description: 'Filter by iFlow name (optional)' } },
      required: [],
    },
  },
  {
    name: 'list_keystores',
    audience: 'direct',
    description: 'List all keystore entries in CPI including alias and expiry date.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_credentials',
    audience: 'direct',
    description: 'List all user credential (basic auth) aliases configured in CPI.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_oauth_credentials',
    audience: 'direct',
    description: 'List all OAuth2 client credential configurations in CPI.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── Convenience filter — use in HTTP transport mode to hide wizard tools from orchestrators
export const DIRECT_TOOLS  = TOOL_DEFINITIONS.filter(t => t.audience === 'direct');
export const WIZARD_TOOLS  = TOOL_DEFINITIONS.filter(t => t.audience === 'interactive');
export const SESSION_TOOLS = TOOL_DEFINITIONS.filter(t => t.audience === 'session');

