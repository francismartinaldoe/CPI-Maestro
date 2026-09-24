// handlers/guardian/guardianFormatter.ts — Guardian + Mirror report formatters (no MCP imports)

import { SpotCheckReport } from '../../types';

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

export function envLabel(e: string | null): string {
  if (e === 'DEV') return 'DEV';
  if (e === 'TEST') return 'TEST';
  if (e === 'PROD') return 'PROD';
  return e ?? 'UNKNOWN';
}

export function formatGuardianReport(
  report: SpotCheckReport,
  pptxPath: string,
  excelPath: string
): string {
  const overall = report.overallStatus;
  const overallEmoji = overall === 'PASS' ? '🟢 PASS' : overall === 'WARN' ? '🟡 WARN' : '🔴 FAIL';
  const ts = report.triggeredAt.slice(0, 19).replace('T', ' ');
  const env = report.environment;

  const lines: string[] = [
    `## 📊 ${report.iflowId} — GUARDIAN Report [${env}]`,
    `**Run ID:** ${report.runId} | **Checked:** ${ts} | **Overall:** ${overallEmoji}`,
    '',
    '| # | Check | Status | Detail | Auto-Fix? | Escalation |',
    '|---|-------|--------|--------|-----------|------------|',
  ];

  report.checks.forEach((chk, i) => {
    const st = chk.status;
    const dot = st === 'PASS' ? '●PASS' : st === 'WARN' ? '●WARN' : st === 'FAIL' ? '●FAIL' : '⏭SKIP';
    const fix = chk.autoFix ? `✔ ${chk.autoFixDetail?.slice(0, 25) ?? 'Auto-fix'}` : '✘ Manual';
    const esc = chk.escalation ?? '—';
    const detail = chk.detail.length > 60 ? chk.detail.slice(0, 57) + '…' : chk.detail;
    lines.push(`| ${i + 1} | ${chk.category} | ${dot} | ${detail} | ${fix} | ${esc} |`);
  });

  lines.push('');
  lines.push(`**✅ ${report.summary.pass} PASS  ⚠️ ${report.summary.warn} WARN  ❌ ${report.summary.fail} FAIL**`);
  lines.push('');

  const fails = report.checks.filter((c) => c.status === 'FAIL');
  const warns = report.checks.filter((c) => c.status === 'WARN');

  if (fails.length > 0) {
    lines.push(`🚨 **Block go-live:**`);
    fails.forEach((f) => lines.push(`- **${f.category}** → ${f.escalation ?? f.detail}`));
  } else if (warns.length > 0) {
    lines.push(`⚠️ **Review before go-live:**`);
    warns.forEach((w) => lines.push(`- **${w.category}** → ${w.detail}`));
  } else {
    lines.push(`🟢 **${env} deployment is healthy.**`);
  }

  const d = dateStamp();
  const iflowSafe = report.iflowId.replace(/[^a-zA-Z0-9_-]/g, '_');
  lines.push('');
  lines.push(`📄 PPTX: \`GUARDIAN_${env}_${iflowSafe}_${d}.pptx\` → ${pptxPath || '(not generated)'}`);
  lines.push(`📊 Excel: \`GUARDIAN_${env}_${iflowSafe}_${d}.xlsx\` → ${excelPath || '(not generated)'}`);

  return lines.join('\n');
}

export function formatGuardianBatchSummary(
  reports: SpotCheckReport[],
  env: string
): string {
  const d = dateStamp();
  const lines: string[] = [
    `## 🏁 GUARDIAN Run Complete — ${env} | ${new Date().toISOString().slice(0, 10)}`,
    '',
    `| iFlow | Version | ✅ PASS | ⚠️ WARN | ❌ FAIL | Overall |`,
    `|-------|---------|--------|--------|--------|---------|`,
  ];

  for (const r of reports) {
    const badge = r.overallStatus === 'PASS' ? '🟢' : r.overallStatus === 'WARN' ? '🟡' : '🔴';
    lines.push(`| ${r.iflowName} | — | ${r.summary.pass} | ${r.summary.warn} | ${r.summary.fail} | ${badge} |`);
  }

  lines.push('');
  const clean    = reports.filter((r) => r.overallStatus === 'PASS').length;
  const warnings = reports.filter((r) => r.overallStatus === 'WARN').length;
  const failures = reports.filter((r) => r.overallStatus === 'FAIL').length;
  lines.push(`**Tenant health: ${clean} clean  ${warnings} warnings  ${failures} failures**`);

  const failedNames = reports.filter((r) => r.overallStatus === 'FAIL').map((r) => r.iflowName);
  if (failedNames.length > 0) {
    lines.push(`🚨 Block go-live on: ${failedNames.join(', ')}`);
  } else {
    lines.push(`🟢 All ${env} deployments are go-live ready.`);
  }

  lines.push('');
  lines.push(`📄 PPTX (combined): \`GUARDIAN_${env}_BATCH_${d}.pptx\``);
  lines.push(`📊 Excel (combined): \`GUARDIAN_${env}_BATCH_${d}.xlsx\``);

  return lines.join('\n');
}

export const MIRROR_CRITERIA_LABELS: Record<string, string> = {
  'C1 iFlow Name':              'iFlow Name',
  'C2 iFlow Version':           'iFlow Version',
  'C3 Runtime Status':          'Runtime Status',
  'C4 Deployment Timestamp':    'Deployment Timestamp',
  'C5 Credentials':             'Credentials',
  'C6 Keystore Aliases':        'Keystore Aliases',
  'C7 OAuth Configurations':    'OAuth Configurations',
  'C8 Endpoint URL':            'Endpoint URL',
  'C8 Endpoint Protocol':       'Endpoint Protocol',
  'C9 Adapter Settings':        'Adapter Settings',
  'C10 Value Mappings':         'Value Mappings',
  'C11 Package Membership':     'Package Membership',
  'C12 Description':            'Description / Metadata',
  'C13 Externalized Parameters':'Externalized Parameters',
  'C14 Log Level':              'Message Log Level',
  'C15 Error Count (7d)':       'Error Count (7 days)',
  'C16 Last Successful Run':    'Last Successful Run',
  'C17 Configurable Parameters':'Configurable Parameters',
};

export function verdictEmoji(v: string): string {
  return v === 'MATCH' ? '✅ MATCH'
    : v === 'DRIFT'   ? '⚠️ DRIFT'
    : v === 'EXTRA'   ? '➕ EXTRA'
    : '❌ MISSING';
}

export function formatMirrorReport(
  iflowId: string,
  iflowName: string,
  srcEnv: string,
  tgtEnv: string,
  runId: string,
  diffs: Array<{ field: string; valueA: string; valueB: string; verdict: string }>,
  pptxPath: string,
  excelPath: string
): string {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const driftStatus = diffs.some((d) => d.verdict === 'MISSING') ? '🔴 INCOMPLETE'
    : diffs.some((d) => d.verdict === 'DRIFT' || d.verdict === 'EXTRA') ? '🟡 DRIFT'
    : '🟢 IN SYNC';

  const matchCount   = diffs.filter((d) => d.verdict === 'MATCH').length;
  const driftCount   = diffs.filter((d) => d.verdict === 'DRIFT').length;
  const missingCount = diffs.filter((d) => d.verdict === 'MISSING').length;
  const extraCount   = diffs.filter((d) => d.verdict === 'EXTRA').length;

  const lines: string[] = [
    `## 🪞 ${iflowId} — MIRROR Comparison Report`,
    `**${srcEnv} → ${tgtEnv}** | **Run ID:** ${runId} | **${ts}**`,
    `**Overall Drift:** ${driftStatus}`,
    '',
    `| # | Criteria | ${srcEnv} Value | ${tgtEnv} Value | Status |`,
    `|---|----------|${''.padEnd(srcEnv.length + 8, '-')}|${''.padEnd(tgtEnv.length + 8, '-')}|--------|`,
  ];

  diffs.forEach((d, i) => {
    const label = MIRROR_CRITERIA_LABELS[d.field] ?? d.field;
    const srcVal = d.valueA.length > 40 ? d.valueA.slice(0, 37) + '…' : d.valueA;
    const tgtVal = d.valueB.length > 40 ? d.valueB.slice(0, 37) + '…' : d.valueB;
    lines.push(`| ${i + 1} | ${label} | ${srcVal} | ${tgtVal} | ${verdictEmoji(d.verdict)} |`);
  });

  lines.push('');
  lines.push(`**✅ ${matchCount} MATCH  ⚠️ ${driftCount} DRIFT  ❌ ${missingCount} MISSING  ➕ ${extraCount} EXTRA**`);
  lines.push('');

  const missing = diffs.filter((d) => d.verdict === 'MISSING');
  const drifts  = diffs.filter((d) => d.verdict === 'DRIFT' || d.verdict === 'EXTRA');

  if (missing.length > 0) {
    lines.push(`🚨 **Promotion blocker — missing in ${tgtEnv}:**`);
    missing.forEach((d) => {
      const label = MIRROR_CRITERIA_LABELS[d.field] ?? d.field;
      lines.push(`- **${label}**: ${d.valueA} → Action: replicate from ${srcEnv} before go-live`);
    });
  } else if (drifts.length > 0) {
    lines.push(`⚠️ **Configuration drift detected — review before go-live:**`);
    drifts.forEach((d) => {
      const label = MIRROR_CRITERIA_LABELS[d.field] ?? d.field;
      lines.push(`- **${label}**: ${srcEnv}=\`${d.valueA}\` vs ${tgtEnv}=\`${d.valueB}\` — intentional or error?`);
    });
  } else {
    lines.push(`🟢 **${iflowId} is fully in sync — ${tgtEnv} mirrors ${srcEnv}.**`);
  }

  const d = dateStamp();
  const iflowSafe = iflowId.replace(/[^a-zA-Z0-9_-]/g, '_');
  lines.push('');
  lines.push(`📄 PPTX: \`MIRROR_${srcEnv}_vs_${tgtEnv}_${iflowSafe}_${d}.pptx\` → ${pptxPath || '(not generated)'}`);
  lines.push(`📊 Excel: \`MIRROR_${srcEnv}_vs_${tgtEnv}_${iflowSafe}_${d}.xlsx\` → ${excelPath || '(not generated)'}`);

  return lines.join('\n');
}

export function formatMirrorBatchSummary(
  results: Array<{
    iflowName: string; versionA: string; versionB: string;
    matchCount: number; driftCount: number; missingCount: number; label: string;
  }>,
  srcEnv: string,
  tgtEnv: string
): string {
  const d = dateStamp();
  const lines: string[] = [
    `## 🏁 MIRROR Run Complete — ${srcEnv} ↔ ${tgtEnv} | ${new Date().toISOString().slice(0, 10)}`,
    '',
    `| iFlow | Version (${srcEnv}) | Version (${tgtEnv}) | ✅ Match | ⚠️ Drift | ❌ Missing | Overall |`,
    `|-------|${''.padEnd(srcEnv.length + 12, '-')}|${''.padEnd(tgtEnv.length + 12, '-')}|---------|---------|----------|---------|`,
  ];

  for (const r of results) {
    const badge = r.label === 'IN SYNC' ? '🟢' : r.label === 'DRIFT' ? '🟡' : '🔴';
    lines.push(`| ${r.iflowName} | ${r.versionA} | ${r.versionB} | ${r.matchCount}/17 | ${r.driftCount}/17 | ${r.missingCount}/17 | ${badge} ${r.label} |`);
  }

  lines.push('');
  lines.push('**Promotion readiness:**');

  const inSync     = results.filter((r) => r.label === 'IN SYNC').map((r) => r.iflowName);
  const drifted    = results.filter((r) => r.label === 'DRIFT').map((r) => r.iflowName);
  const incomplete = results.filter((r) => r.label === 'INCOMPLETE').map((r) => r.iflowName);

  if (inSync.length > 0)     lines.push(`🟢 Ready to promote: ${inSync.join(', ')}`);
  if (drifted.length > 0)    lines.push(`🟡 Promote with caution: ${drifted.join(', ')} — review drift items`);
  if (incomplete.length > 0) lines.push(`🔴 Block promotion: ${incomplete.join(', ')} — missing artifacts`);

  lines.push('');
  lines.push(`📄 PPTX (combined): \`MIRROR_${srcEnv}_vs_${tgtEnv}_BATCH_${d}.pptx\``);
  lines.push(`📊 Excel (combined): \`MIRROR_${srcEnv}_vs_${tgtEnv}_BATCH_${d}.xlsx\``);

  return lines.join('\n');
}
