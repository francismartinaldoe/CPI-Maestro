// src/orchestrator/types.ts — Shared type definitions for the Maestro orchestrator

// ── Intent classification ──────────────────────────────────────────────────

export type AgentTarget = 'gatekeeper' | 'flowlens' | 'detective' | 'both' | 'orchestrator';

export type GatekeeperAction =
  | 'spotcheck_iflow'       // GUARDIAN: health check a single iFlow
  | 'compare_iflow'         // MIRROR: diff an iFlow across environments
  | 'batch_compare'         // MIRROR: compare all watchlist iFlows
  | 'multi_profile_spotcheck' // GUARDIAN: compare iFlow across multiple tenant profiles
  | 'list_profiles'         // list configured tenant profiles
  | 'get_failed_messages'   // message monitoring
  | 'get_message_details'   // message monitoring
  | 'get_system_status'     // system health
  | 'get_todays_deployments'
  | 'run_todays_spot_checks';

export type FlowLensAction =
  | 'analyze_iflow'         // AI-powered iFlow analysis
  | 'generate_groovy'       // Groovy Studio: generate script
  | 'modify_groovy'         // Groovy Studio: modify existing script
  | 'explain_groovy'        // Groovy Studio: explain script
  | 'simulate_groovy'       // Groovy Studio: simulate script
  | 'list_owners';          // iFlow ownership lookup

export type DetectiveAction =
  | 'get_system_status'
  | 'get_runtime_artifacts'
  | 'get_failed_messages'
  | 'get_message_details'
  | 'list_keystores'
  | 'security_audit'
  | 'list_packages'
  | 'list_artifacts'
  | 'list_jms_queues'
  | 'list_data_store_entries'
  | 'list_variables'
  | 'list_credentials'
  | 'list_oauth_credentials'
  | 'list_service_endpoints'
  | 'get_todays_deployments'
  | 'deploy_artifact'
  | 'undeploy_artifact'
  | 'list_partners'
  | 'hub_search'
  | 'list_log_files';

export interface ClassifiedIntent {
  target: AgentTarget;
  gatekeeperTool?:  GatekeeperAction;
  flowlensAction?:  FlowLensAction;
  detectiveAction?: DetectiveAction;
  params: Record<string, unknown>;
  reasoning: string;
  confidence: number;
}

// ── Conversation context ────────────────────────────────────────────────────

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Which agent(s) were invoked for this turn */
  agentsInvoked?: AgentTarget[];
}

export interface SessionContext {
  turns: ConversationTurn[];
  /** Last iFlow name mentioned in conversation */
  lastIflow?: string;
  /** Last environment mentioned */
  lastEnvironment?: 'DEV' | 'TEST' | 'PROD';
  /** Last package ID mentioned */
  lastPackage?: string;
  /** Last Groovy script generated */
  lastGroovyScript?: string;
}

// ── Agent response types ────────────────────────────────────────────────────

export interface AgentResponse {
  agent: AgentTarget;
  success: boolean;
  content: string;
  rawData?: unknown;
  error?: string;
  durationMs: number;
}

// A2A task lifecycle states (A2A spec §4.1)
export type TaskState = 'submitted' | 'working' | 'completed' | 'failed' | 'input-required' | 'canceled';

export interface OrchestratorResponse {
  /** A2A-compatible stable task identifier */
  taskId: string;
  /** A2A task state */
  taskState: TaskState;
  userMessage: string;
  intent: ClassifiedIntent;
  agentResponses: AgentResponse[];
  synthesizedAnswer: string;
  sessionContext: SessionContext;
  /** ISO-8601 timestamp when the task completed */
  completedAt: string;
}

// ── CPI tenant profiles ─────────────────────────────────────────────────────

/** A named SAP CPI tenant configuration. Stored as an array in MAESTRO_PROFILES. */
export interface CpiProfile {
  /** Stable unique identifier (UUID or user-supplied slug, never changes) */
  id: string;
  /** Human-readable display name, e.g. "EU Production", "Customer X Dev" */
  name: string;
  tenantUrl:    string;
  tokenUrl:     string;
  clientId:     string;
  clientSecret: string;
  /** Optional Basic-Auth fallback (takes priority over OAuth2 if set) */
  username?: string;
  password?:  string;
}

// ── Transport configs ───────────────────────────────────────────────────────

export interface McpTransportConfig {
  type: 'mcp';
  serverScriptPath: string;
  env?: Record<string, string>;
}

export interface HttpTransportConfig {
  type: 'http';
  baseUrl: string;
  headers?: Record<string, string>;
}

export type TransportConfig = McpTransportConfig | HttpTransportConfig;

export interface AgentConfig {
  gatekeeper: TransportConfig;
  flowlens: HttpTransportConfig;
  detective: McpTransportConfig;
}
