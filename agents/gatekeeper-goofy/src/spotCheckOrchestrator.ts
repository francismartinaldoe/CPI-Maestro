// spotCheckOrchestrator.ts  –  runs all checks and assembles the report
import { CpiClient } from './cpiClient';
import { Config, loadConfigForEnv } from './config';
import { CheckResult, CheckStatus, Environment, MultiEnvReport, SpotCheckReport } from './types';
import { loadBaseline } from './utils/baseline';
import logger from './utils/logger';

import { checkActivationStatus } from './checks/activationStatus';
import { checkEndpointReachability } from './checks/endpointReachability';
import { checkCredentialHealth } from './checks/credentialHealth';
import { checkValueMappings } from './checks/valueMappingCheck';
import { checkSmokeTest } from './checks/smokeTest';
import { checkConfigParity } from './checks/configParity';
import { checkSecurityReplication } from './checks/securityReplication';
import { checkLogLevel } from './checks/logLevelCheck';

function genRunId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SC-${ts}-${rand}`;
}

function worstStatus(checks: CheckResult[]): CheckStatus {
  if (checks.some((c) => c.status === 'FAIL')) return 'FAIL';
  if (checks.some((c) => c.status === 'WARN')) return 'WARN';
  if (checks.every((c) => c.status === 'SKIP')) return 'SKIP';
  return 'PASS';
}

export interface RunOptions {
  iflowId: string;
  packageId: string;
  iflowName?: string;
  environment?: Environment;
  saveBaseline?: boolean;
}

export async function runSpotCheck(
  cfg: Config,
  opts: RunOptions
): Promise<SpotCheckReport> {
  const runId = genRunId();
  const triggeredAt = new Date().toISOString();
  const env = opts.environment ?? cfg.environment;

  logger.info(`\n${'═'.repeat(60)}`);
  logger.info(`  SAP CPI Spot-Check  |  ${opts.iflowId}  |  ${env}`);
  logger.info(`  Run ID: ${runId}`);
  logger.info(`${'═'.repeat(60)}\n`);

  const cpiClient = new CpiClient(cfg);
  const baseline = loadBaseline(cfg.baselineDir, opts.iflowId, env);

  // Resolve iFlow name if not provided
  let iflowName = opts.iflowName ?? opts.iflowId;
  try {
    const artifact = await cpiClient.getArtifact(opts.iflowId);
    if (artifact?.Name) iflowName = artifact.Name;
  } catch {/* best-effort */}

  const ctx = {
    iflowId: opts.iflowId,
    iflowName,
    packageId: opts.packageId,
    environment: env,
    baseline: baseline ?? undefined,
    cpiClient,
    config: cfg,
  };

  // ── Run all checks in order ──────────────────
  const checkRunners = [
    { name: 'iFlow Activation Status',       ruleKey: 'activationStatus',         fn: checkActivationStatus },
    { name: 'Endpoint URL Reachability',      ruleKey: 'endpointReachability',      fn: checkEndpointReachability },
    { name: 'Credential / Keystore Health',   ruleKey: 'credentialHealth',          fn: checkCredentialHealth },
    { name: 'Value Mapping Completeness',     ruleKey: 'valueMappingCompleteness',  fn: checkValueMappings },
    { name: 'Smoke Test — Synthetic Msg',     ruleKey: 'smokeTest',                 fn: checkSmokeTest },
    { name: 'Config vs Baseline Parity',      ruleKey: 'configParity',              fn: checkConfigParity },
    { name: 'Security Artifact Replication',  ruleKey: 'securityReplication',       fn: checkSecurityReplication },
    { name: 'Log Level Check',                ruleKey: 'logLevel',                  fn: checkLogLevel },
  ];

  const checks: CheckResult[] = [];

  for (const runner of checkRunners) {
    // Respect enabled flag from agent-rules.json
    const ruleEntry = cfg.rules?.checks?.[runner.ruleKey];
    if (ruleEntry && ruleEntry.enabled === false) {
      process.stdout.write(`  ⏳  ${runner.name.padEnd(38, '.')} `);
      console.log(`⏭️   SKIP  (disabled in agent-rules.json)`);
      checks.push({
        id: runner.ruleKey,
        category: runner.name,
        status: 'SKIP',
        detail: 'Disabled in agent-rules.json',
        autoFix: false,
        durationMs: 0,
      });
      continue;
    }

    process.stdout.write(`  ⏳  ${runner.name.padEnd(38, '.')} `);
    try {
      const result = await runner.fn(ctx);
      checks.push(result);
      const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️ ' : result.status === 'SKIP' ? '⏭️ ' : '❌';
      console.log(`${icon}  ${result.status}  (${result.durationMs}ms)`);
    } catch (err) {
      const fail: CheckResult = {
        id: runner.ruleKey,
        category: runner.name,
        status: 'FAIL',
        detail: `Unexpected error: ${(err as Error).message}`,
        autoFix: false,
        durationMs: 0,
      };
      checks.push(fail);
      console.log(`❌  FAIL`);
    }
  }

  const completedAt = new Date().toISOString();
  const totalDurationMs = checks.reduce((s, c) => s + c.durationMs, 0);

  // Extract deployedOn from activation status raw data (id field = 'activationStatus')
  const deployedOn = (() => {
    const activationCheck = checks.find((c) => c.id === 'activationStatus' || c.id === 'activation_status');
    const raw = activationCheck?.rawData as Record<string, unknown> | undefined;
    const fromRaw = raw?.['DeployedOn'] ?? raw?.['deployedOn'];
    if (typeof fromRaw === 'string') return fromRaw;
    // Fallback: parse from detail string "Deployed: 2026-06-08T15:36:35.790"
    const detail = activationCheck?.detail ?? '';
    const m = detail.match(/Deployed:\s*(\S+)/);
    return m ? m[1] : '—';
  })();

  const summary = {
    pass: checks.filter((c) => c.status === 'PASS').length,
    warn: checks.filter((c) => c.status === 'WARN').length,
    fail: checks.filter((c) => c.status === 'FAIL').length,
    skip: checks.filter((c) => c.status === 'SKIP').length,
  };

  const report: SpotCheckReport = {
    runId,
    iflowId: opts.iflowId,
    iflowName,
    packageId: opts.packageId,
    environment: env,
    deployedOn,
    triggeredAt,
    completedAt,
    totalDurationMs,
    overallStatus: worstStatus(checks),
    checks,
    summary,
  };

  // ── Print summary ───────────────────────────
  const overall = report.overallStatus;
  const overallIcon = overall === 'PASS' ? '✅' : overall === 'WARN' ? '⚠️ ' : '❌';
  logger.info(`\n${'─'.repeat(60)}`);
  logger.info(`  OVERALL: ${overallIcon}  ${overall}   |  ✅ ${summary.pass}  ⚠️  ${summary.warn}  ❌ ${summary.fail}  ⏭️  ${summary.skip}`);
  logger.info(`${'─'.repeat(60)}\n`);

  return report;
}

// ── Run checks across TEST, PRE-PROD, PROD in parallel ──────────────────────
export async function runMultiEnvSpotCheck(
  opts: Omit<RunOptions, 'environment'>
): Promise<MultiEnvReport> {
  const envs: Environment[] = ['TEST', 'PRE-PROD', 'PROD'];
  const results = await Promise.all(
    envs.map((env) => {
      let envCfg: Config;
      try {
        envCfg = loadConfigForEnv(env);
      } catch (err) {
        logger.warn(`Skipping ${env}: ${(err as Error).message}`);
        return null;
      }
      return runSpotCheck(envCfg, { ...opts, environment: env }).catch((err) => {
        logger.error(`Multi-env check failed for ${env}: ${err.message}`);
        return null;
      });
    })
  );

  return {
    iflowId: opts.iflowId,
    iflowName: opts.iflowName ?? opts.iflowId,
    packageId: opts.packageId,
    triggeredAt: new Date().toISOString(),
    environments: {
      TEST:       results[0] ?? undefined,
      'PRE-PROD': results[1] ?? undefined,
      PROD:       results[2] ?? undefined,
    },
  };
}
