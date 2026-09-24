// ─────────────────────────────────────────────
//  types.ts  –  shared interfaces for SpotCheck
// ─────────────────────────────────────────────

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
export type Environment = 'DEV' | 'TEST' | 'PRE-PROD' | 'PROD';

// ── Adapter channel configuration ─────────────────────────────────────────────
export interface AdapterConfig {
  direction: 'sender' | 'receiver';
  adapterType: string;           // HTTP, SOAP, SFTP, Mail, AEM, OData, ProcessDirect…
  channelName: string;
  host: string;
  address: string;               // endpoint path or URL
  credentialName: string;        // security alias used
  protocol: string;              // HTTPS, SFTP, SMTP…
  port: string;
  extraProps: Record<string, string>;  // adapter-specific fields (timeout, method…)
}

// ── Individual check result ───────────────────
export interface CheckResult {
  id: string;              // machine-readable key
  category: string;        // human-readable category name
  status: CheckStatus;
  detail: string;          // one-line summary
  autoFix: boolean;        // was an auto-fix attempted/available?
  autoFixDetail?: string;  // what fix was applied
  escalation?: string;     // escalation action if FAIL/WARN
  durationMs: number;
  rawData?: unknown;       // for debugging
}

// ── Full spot-check report ────────────────────
export interface SpotCheckReport {
  runId: string;
  iflowId: string;
  iflowName: string;
  packageId: string;
  environment: Environment;
  deployedOn: string;       // iFlow deployment timestamp from CPI runtime
  triggeredAt: string;      // ISO timestamp when check was triggered
  completedAt: string;
  totalDurationMs: number;
  overallStatus: CheckStatus;
  checks: CheckResult[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
    skip: number;
  };
}

// ── Baseline snapshot (for config parity) ────
export interface BaselineSnapshot {
  iflowId: string;
  capturedAt: string;
  environment: Environment;
  config: Record<string, string>;   // key → value pairs
  endpoints: string[];
  credentialAliases: string[];
  valueMappingIds: string[];
}

// ── CPI API types (minimal shapes) ───────────
export interface CpiRuntimeArtifact {
  Id: string;
  Name: string;
  Status: 'STARTED' | 'STOPPED' | 'ERROR' | 'STARTING';
  Type: string;
  DeployedOn: string;
  Version: string;
}

export interface CpiKeystoreEntry {
  Alias: string;
  Type: string;
  Owner?: string;
  ValidNotAfter?: string;  // ISO date
}

export interface CpiCredential {
  Name: string;
  Kind: string;
  Description?: string;
}

export interface CpiOAuthCredential {
  Name: string;
  ClientId: string;
  TokenServiceUrl: string;
  Scope?: string;
}

export interface CpiValueMapping {
  Id: string;
  Name: string;
  Status?: string;
}

export interface CpiArtifact {
  Id: string;
  Name: string;
  PackageId: string;
  Version: string;
  Description?: string;
}

export interface CpiMessageLog {
  MessageGuid: string;
  Status: string;
  IntegrationArtifact?: { Id: string; Name: string };
  LogStart: string;
  LogEnd?: string;
  Sender?: string;
  Receiver?: string;
  ErrorInfos?: { ErrorMessage: string }[];
}

// ── Multi-environment spot-check report ──────
export interface MultiEnvReport {
  iflowId: string;
  iflowName: string;
  packageId: string;
  triggeredAt: string;
  environments: {
    TEST?: SpotCheckReport;
    'PRE-PROD'?: SpotCheckReport;
    PROD?: SpotCheckReport;
  };
}

export interface CheckContext {
  iflowId: string;
  iflowName: string;
  packageId: string;
  environment: Environment;
  baseline?: BaselineSnapshot;
  cpiClient: import('./cpiClient').CpiClient;
  config: import('./config').Config;
}

// ── Mode selector config ──────────────────────
export interface ModeConfig {
  mode: 'scout' | 'compass';
  environments: Array<'TEST' | 'PRE-PROD' | 'PROD'>;
  iflowIds: string[];
  iflowNames: string[];
  packageId: string;
}

// ── Compass / MIRROR (Mode 2) comparison types ────────
export interface ComparisonSnapshot {
  environment: string;
  // C1  iFlow Name
  iflowName: string;
  // C2  iFlow Version (design-time & runtime)
  version: string;
  // C3  Runtime Status
  activationStatus: string;
  // C4  Deployment Timestamp
  deployedOn: string;
  deployedBy: string;
  // C5  Credentials — actual alias list
  credentialAliases: string[];
  // C6  Keystore Aliases
  keystoreAliases: string[];
  // C7  OAuth Configurations — name + token URL pairs
  oauthConfigs: Array<{ name: string; tokenUrl: string }>;
  // C8  Endpoint Configuration — inbound URL + protocol
  endpointUrl: string;
  endpointProtocol: string;
  endpointReachable: boolean;
  endpointStatusCode: number;
  // C9  Adapter Settings — full parsed adapter channels (sender + receiver)
  adapters: AdapterConfig[];
  adapterSettings: string;       // summary string for backwards compat
  // C10 Value Mappings — name + version list
  valueMappings: Array<{ name: string; version?: string; status?: string }>;
  // C11 Package Membership
  packageId: string;
  // C12 Description / Metadata
  description: string;
  // C13 Externalized Parameters — all key/value pairs
  externalizedParams: Record<string, string>;
  // C14 Message Log Level
  logLevel: string;
  // C15 Error Count (7 days)
  errorCount7d: number;
  // C16 Last Successful Run
  lastSuccessfulRun: string;
  // C17 Configurable Parameters (key+value)
  configurableParams: Record<string, string>;
  // Legacy counts kept for backwards compat in compassEngine
  credentialCount: number;
  keystoreEntryCount: number;
  oauthConfigCount: number;
  valueMappingCount: number;
  vmDeployedCount: number;
  overallStatus: string;
  checks: CheckResult[];
}

export interface ComparisonDiff {
  field: string;
  valueA: string;
  valueB: string;
  verdict: 'MATCH' | 'DRIFT' | 'MISSING' | 'EXTRA';
}

export interface CompassIflowResult {
  iflowId: string;
  iflowName: string;
  envA: ComparisonSnapshot | null;
  envB: ComparisonSnapshot | null;
  diffs: ComparisonDiff[];
  driftCount: number;
}

export interface CompassReport {
  runId: string;
  triggeredAt: string;
  envA: string;
  envB: string;
  iflowCount: number;
  totalDrifts: number;
  results: CompassIflowResult[];
}
