#!/usr/bin/env node
// ─────────────────────────────────────────────
//  index.ts  –  CLI entry point for spot-check
// ─────────────────────────────────────────────

import { loadConfig } from './config';
import { runSpotCheck, runMultiEnvSpotCheck } from './spotCheckOrchestrator';
import { saveBaseline } from './utils/baseline';
import logger from './utils/logger';
import { CpiClient } from './cpiClient';

// ── CLI argument parsing ─────────────────────
const args = process.argv.slice(2);
const argMap: Record<string, string> = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    argMap[key] = args[i + 1] ?? 'true';
    i++;
  }
}

function getArg(key: string, fallback?: string): string {
  if (argMap[key]) return argMap[key];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required argument: --${key}`);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║    SAP CPI Deployment Spot-Check Agent       ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const cfg = loadConfig();

  // ── Sub-command: save-baseline ──────────────
  if (args[0] === 'save-baseline') {
    const iflowId = getArg('iflow');
    const packageId = getArg('package');
    const client = new CpiClient(cfg);

    logger.info(`Capturing baseline for ${iflowId}...`);
    const artifact = await client.getArtifact(iflowId);
    const creds = await client.getCredentials();
    const vms = await client.getValueMappings(packageId);

    const snapshot = {
      iflowId,
      capturedAt: new Date().toISOString(),
      environment: cfg.environment,
      config: {
        version: artifact?.Version ?? 'unknown',
        packageId,
      },
      endpoints: [`${cfg.tenantUrl}/http/${iflowId}`],
      credentialAliases: creds.map((c) => c.Name),
      valueMappingIds: vms.map((v) => v.Id),
    };

    saveBaseline(cfg.baselineDir, snapshot);
    logger.info('Baseline saved successfully!');
    process.exit(0);
  }

  // ── Sub-command: run (default) ──────────────
  const iflowId = getArg('iflow', process.env.SPOT_CHECK_IFLOW_ID ?? '');
  if (!iflowId) {
    console.error('Error: --iflow <artifactId> is required');
    console.error('\nUsage:');
    console.error('  npx spot-check --iflow <iFlowId> --package <packageId> [--env PROD] [--no-pptx]');
    console.error('  npx spot-check save-baseline --iflow <iFlowId> --package <packageId>');
    process.exit(1);
  }

  const packageId = getArg('package', process.env.SPOT_CHECK_PACKAGE_ID ?? 'default');
  const noPptx = 'no-pptx' in argMap;
  const singleEnv = argMap['env'] as 'TEST' | 'PRE-PROD' | 'PROD' | undefined;

  // ── Multi-env run (default) or single-env if --env is specified ──────────
  if (singleEnv) {
    // Single environment run — wrap in a minimal multi-env structure for Excel
    const report = await runSpotCheck(cfg, { iflowId, packageId, environment: singleEnv });
    const fakeMulti = {
      iflowId: report.iflowId,
      iflowName: report.iflowName,
      packageId: report.packageId,
      triggeredAt: report.triggeredAt,
      environments: { [singleEnv]: report } as Record<string, typeof report>,
    };

    try {
      const xlPath = 'report generation removed';
      console.log(`\n📊  Excel Report: ${xlPath}`);
    } catch (err) { logger.error(`Excel generation failed: ${(err as Error).message}`); }

    if (!noPptx) {
      try {
        const pptxPath = 'report generation removed';
        console.log(`📊  PPTX Report: ${pptxPath}`);
      } catch (err) { logger.error(`PPTX generation failed: ${(err as Error).message}`); }
    }

    const exitCode = report.overallStatus === 'FAIL' ? 1 : 0;
    console.log(`\n🏁  Spot-check complete — exit code ${exitCode}\n`);
    process.exit(exitCode);
  } else {
    // Multi-environment run: TEST + PRE-PROD + PROD
    console.log('\n🌐  Running checks across TEST · PRE-PROD · PROD ...\n');
    const multiReport = await runMultiEnvSpotCheck({ iflowId, packageId });

    try {
      const xlPath = 'report generation removed';
      console.log(`\n📊  Excel Report: ${xlPath}`);
    } catch (err) { logger.error(`Excel generation failed: ${(err as Error).message}`); }

    if (!noPptx) {
      try {
        const pptxPath = 'report generation removed';
        console.log(`📊  Multi-Env PPTX Report: ${pptxPath}`);
      } catch (err) { logger.error(`PPTX generation failed: ${(err as Error).message}`); }
    }

    const allStatuses = Object.values(multiReport.environments)
      .filter(Boolean)
      .map((r) => r!.overallStatus);
    const exitCode = allStatuses.includes('FAIL') ? 1 : 0;
    console.log(`\n🏁  Multi-env spot-check complete — exit code ${exitCode}\n`);
    process.exit(exitCode);
  }
}

main().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(2);
});
