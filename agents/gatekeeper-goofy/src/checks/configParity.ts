// checks/configParity.ts
import { CheckContext, CheckResult } from '../types';

export async function checkConfigParity(ctx: CheckContext): Promise<CheckResult> {
  const start = Date.now();

  if (!ctx.baseline) {
    return {
      id: 'config_parity',
      category: 'Config vs Baseline Parity',
      status: 'SKIP',
      detail: 'No baseline snapshot found — run with --save-baseline first',
      autoFix: false,
      durationMs: Date.now() - start,
    };
  }

  try {
    const artifact = await ctx.cpiClient.getArtifact(ctx.iflowId);
    if (!artifact) {
      return {
        id: 'config_parity',
        category: 'Config vs Baseline Parity',
        status: 'FAIL',
        detail: 'Design-time artifact not found',
        autoFix: false,
        escalation: 'P1 — Block deploy',
        durationMs: Date.now() - start,
      };
    }

    // Compare what we can from the artifact metadata vs baseline
    const drifts: string[] = [];

    // Version drift
    const baselineVersion = ctx.baseline.config['version'];
    if (baselineVersion && artifact.Version !== baselineVersion) {
      drifts.push(`Version: baseline=${baselineVersion}, current=${artifact.Version}`);
    }

    // Package drift
    if (artifact.PackageId !== ctx.baseline.iflowId && artifact.PackageId !== ctx.packageId) {
      drifts.push(`PackageId mismatch: ${artifact.PackageId} vs ${ctx.packageId}`);
    }

    // Credential aliases drift
    const currentCreds = await ctx.cpiClient.getCredentials();
    const currentAliases = currentCreds.map((c) => c.Name).sort();
    const baselineAliases = (ctx.baseline.credentialAliases ?? []).sort();
    const missingAliases = baselineAliases.filter((a) => !currentAliases.includes(a));
    if (missingAliases.length > 0) {
      drifts.push(`Missing credential aliases: ${missingAliases.join(', ')}`);
    }

    if (drifts.length > 0) {
      const isProd = ctx.environment === 'PROD';
      return {
        id: 'config_parity',
        category: 'Config vs Baseline Parity',
        status: isProd ? 'FAIL' : 'WARN',
        detail: `Config drift detected: ${drifts.join(' | ')}`,
        autoFix: false,
        escalation: isProd ? 'Notify go-live lead' : 'Log for review',
        durationMs: Date.now() - start,
        rawData: drifts,
      };
    }

    return {
      id: 'config_parity',
      category: 'Config vs Baseline Parity',
      status: 'PASS',
      detail: `Config matches baseline (v${artifact.Version}, captured ${ctx.baseline.capturedAt.slice(0, 10)})`,
      autoFix: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: 'config_parity',
      category: 'Config vs Baseline Parity',
      status: 'WARN',
      detail: `Parity check error: ${(err as Error).message}`,
      autoFix: false,
      durationMs: Date.now() - start,
    };
  }
}
