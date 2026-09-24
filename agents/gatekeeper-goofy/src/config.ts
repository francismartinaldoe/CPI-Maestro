// ─────────────────────────────────────────────
//  config.ts  –  load & validate env config
//  Agent ground rules are loaded from agent-rules.json (project root).
//  .env values take precedence over agent-rules.json defaults.
// ─────────────────────────────────────────────
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { Environment } from './types';

dotenv.config();

// ── Agent rules (agent-rules.json) ───────────
export interface AgentRules {
  interaction: {
    requireStartKeyword: boolean;
    startKeyword: string;
    runKeyword: string;
    editKeyword: string;
    autoExecute: boolean;
    confirmBeforeRun: boolean;
    collectInputsConversationally: boolean;
  };
  defaults: {
    environment: string;
    generatePptx: boolean;
    generateJson: boolean;
    smokeTestEnabled: boolean;
    skipBaselineIfMissing: boolean;
    certExpiryWarnDays: number;
  };
  checks: Record<string, { enabled: boolean; failOnProd: boolean; warnOnly?: boolean; note?: string }>;
  escalation: {
    prodFailBlocksDeploy: boolean;
    warnNotifyChannel: string;
    failNotifyChannel: string;
    p1Threshold: string;
    rollbackOnSmokeTestFail: boolean;
  };
  reporting: {
    pptxOutputDir: string;
    excelOutputDir: string;
    timestampFormat: string;
    includeRawDataInJson: boolean;
    maxReportAgeDays: number;
  };
  session: {
    retainContextAcrossCalls: boolean;
    rememberLastIflow: boolean;
    rememberLastPackage: boolean;
    rememberLastEnvironment: boolean;
    maxSessionRunHistory: number;
  };
  search: {
    namMatchCaseInsensitive: boolean;
    filterToIntegrationFlowsOnly: boolean;
    maxSearchResults: number;
    requireAtLeastOneCriterion: boolean;
  };
  smokeTest: {
    timeoutMs: number;
    expectedStatusCodes: number[];
    treat403AsSkip: boolean;
  };
  display: {
    showRunIdInReport: boolean;
    showDeployedDateInReport: boolean;
    showEscalationColumn: boolean;
    showAutoFixColumn: boolean;
    truncateDetailAt: number;
    statusIcons: Record<string, string>;
  };
}

const RULES_PATH = path.resolve(__dirname, '../../agent-rules.json');

export function loadAgentRules(): AgentRules | null {
  try {
    if (!fs.existsSync(RULES_PATH)) return null;
    return JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8')) as AgentRules;
  } catch {
    return null;
  }
}

// ── Runtime config ────────────────────────────
export interface Config {
  // CPI connection
  tenantUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;

  // Agent behaviour
  environment: Environment;
  baselineDir: string;
  reportPptxDir: string;
  reportExcelDir: string;
  reportCompassDir: string;

  // Smoke test
  smokeTestEnabled: boolean;
  smokeTestPayload: string;
  smokeTestTimeoutMs: number;

  // Security
  certExpiryWarnDays: number;

  // Logging
  logLevel: string;

  // Ground rules (loaded from agent-rules.json, available for checks/orchestrator)
  rules: AgentRules | null;
}

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// ── Env-var suffix map ────────────────────────
const ENV_SUFFIX: Record<string, string> = {
  TEST:       'TEST',
  DEV:        'DEV',
  'PRE-PROD': 'PRE_PROD',
  PROD:       'PROD',
};

/**
 * Load config for a specific environment.
 * Per-env vars like CPI_TENANT_URL_TEST take precedence over the base vars.
 * Falls back to base CPI_TENANT_URL / CPI_TOKEN_URL / CPI_CLIENT_ID / CPI_CLIENT_SECRET
 * so a single-tenant setup keeps working with no changes.
 */
export function loadConfigForEnv(env: Environment): Config {
  const rules = loadAgentRules();
  const suffix = ENV_SUFFIX[env] ?? 'PROD';

  function envRequired(base: string): string {
    const v = (process.env[`${base}_${suffix}`] || '') || (process.env[base] || '');
    if (!v) throw new Error(`Missing env var: ${base}_${suffix} (or fallback ${base})`);
    return v;
  }

  function envOptional(base: string, fallback: string): string {
    return (process.env[`${base}_${suffix}`] || '') || (process.env[base] || '') || fallback;
  }

  const smokeTestEnabled = process.env[`SMOKE_TEST_ENABLED_${suffix}`] !== undefined
    ? process.env[`SMOKE_TEST_ENABLED_${suffix}`] === 'true'
    : process.env.SMOKE_TEST_ENABLED !== undefined
      ? process.env.SMOKE_TEST_ENABLED === 'true'
      : (rules?.defaults?.smokeTestEnabled ?? true);

  const smokeTestTimeoutMs = parseInt(
    process.env[`SMOKE_TEST_TIMEOUT_MS_${suffix}`] ?? process.env.SMOKE_TEST_TIMEOUT_MS ?? String(rules?.smokeTest?.timeoutMs ?? 10000),
    10
  );

  const certExpiryWarnDays = parseInt(
    process.env[`CERT_EXPIRY_WARN_DAYS_${suffix}`] ?? process.env.CERT_EXPIRY_WARN_DAYS ?? String(rules?.defaults?.certExpiryWarnDays ?? 30),
    10
  );

  const reportPptxDir = path.resolve(
    optional('SPOT_CHECK_REPORT_PPTX_DIR', rules?.reporting?.pptxOutputDir ?? './reports/pptx')
  );

  const reportExcelDir = path.resolve(
    optional('SPOT_CHECK_REPORT_EXCEL_DIR', './reports/excel')
  );

  const reportCompassDir = path.resolve(
    optional('SPOT_CHECK_REPORT_COMPASS_DIR', './reports/compass')
  );

  return {
    tenantUrl: envRequired('CPI_TENANT_URL').replace(/\/$/, ''),
    tokenUrl: envRequired('CPI_TOKEN_URL'),
    clientId: envRequired('CPI_CLIENT_ID'),
    clientSecret: envRequired('CPI_CLIENT_SECRET'),

    environment: env,
    baselineDir: path.resolve(optional('SPOT_CHECK_BASELINE_DIR', './baselines')),
    reportPptxDir,
    reportExcelDir,
    reportCompassDir,

    smokeTestEnabled,
    smokeTestPayload: envOptional(
      'SMOKE_TEST_PAYLOAD',
      JSON.stringify({ test: true, source: 'spot-check-agent' })
    ),
    smokeTestTimeoutMs,

    certExpiryWarnDays,

    logLevel: optional('LOG_LEVEL', 'info'),

    rules,
  };
}

export function loadConfig(): Config {
  const rules = loadAgentRules();

  const environment = (optional(
    'SPOT_CHECK_ENV',
    rules?.defaults?.environment ?? 'PROD'
  ) as Environment);

  return loadConfigForEnv(environment);
}

// ── Build a Config from explicit credentials (used by MIRROR mode) ──────────
export function buildConfigFromCreds(opts: {
  tenantUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  environment: Environment;
}): Config {
  const rules = loadAgentRules();
  const reportPptxDir  = path.resolve(optional('SPOT_CHECK_REPORT_PPTX_DIR',    rules?.reporting?.pptxOutputDir ?? './reports/pptx'));
  const reportExcelDir = path.resolve(optional('SPOT_CHECK_REPORT_EXCEL_DIR',   './reports/excel'));
  const reportCompassDir = path.resolve(optional('SPOT_CHECK_REPORT_COMPASS_DIR', './reports/compass'));

  return {
    tenantUrl:    opts.tenantUrl.replace(/\/$/, ''),
    tokenUrl:     opts.tokenUrl,
    clientId:     opts.clientId,
    clientSecret: opts.clientSecret,
    environment:  opts.environment,
    baselineDir:  path.resolve(optional('SPOT_CHECK_BASELINE_DIR', './baselines')),
    reportPptxDir,
    reportExcelDir,
    reportCompassDir,
    smokeTestEnabled:  false, // no smoke tests during MIRROR comparison
    smokeTestPayload:  JSON.stringify({ test: true, source: 'mirror-agent' }),
    smokeTestTimeoutMs: 10000,
    certExpiryWarnDays: parseInt(optional('CERT_EXPIRY_WARN_DAYS', '30'), 10),
    logLevel: optional('LOG_LEVEL', 'info'),
    rules,
  };
}
