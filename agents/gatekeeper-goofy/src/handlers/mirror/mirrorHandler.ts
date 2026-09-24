// handlers/mirror/mirrorHandler.ts — All MIRROR wizard step logic and run execution

import { loadConfigForEnv, buildConfigFromCreds } from '../../config';
import { CpiClient } from '../../cpiClient';
import { Environment } from '../../types';
import { runCompass, mirrorDriftLabel } from '../../modes/compassEngine';
import { session } from '../shared/sessionManager';
import {
  formatMirrorReport,
  formatMirrorBatchSummary,
  envLabel,
} from '../guardian/guardianFormatter';
import { END_MENU, MIRROR_SOURCE_ENV_PROMPT, READONLY_CREDS_MSG } from '../shared/menus';
import { mapEnvToCpiEnv } from '../guardian/guardianHandler';

export function handleSelectModeMirror() {
  session.currentMode = 'MIRROR';
  session.resetMirror();
  return { content: [{ type: 'text', text: MIRROR_SOURCE_ENV_PROMPT }] };
}

export function handleMirrorSetSourceEnv(args: { environment: 'DEV' | 'TEST' | 'PROD' }) {
  session.mirrorSourceEnv = args.environment;
  session.mirrorStep = 2;
  return {
    content: [{
      type: 'text',
      text: [
        `## 🟣 MIRROR MODE — Step 2 of 6: Target Environment`,
        '',
        `Select the **target** environment (what you are promoting TO):`,
        '',
        '**1. DEV**',
        '**2. TEST**',
        '**3. PROD**',
        '',
        `(Must be different from ${envLabel(args.environment)}.)`,
      ].join('\n'),
    }],
  };
}

export function handleMirrorSetTargetEnv(args: { environment: 'DEV' | 'TEST' | 'PROD' }) {
  if (args.environment === session.mirrorSourceEnv) {
    return {
      content: [{
        type: 'text',
        text: `⚠️ Target must differ from source (${envLabel(session.mirrorSourceEnv)}). Pick again.\n\n**1. DEV**\n**2. TEST**\n**3. PROD**`,
      }],
    };
  }
  session.mirrorTargetEnv = args.environment;
  session.mirrorStep = 5;
  const srcLabel = envLabel(session.mirrorSourceEnv);
  return {
    content: [{
      type: 'text',
      text: [
        `✅ **${srcLabel} → ${envLabel(args.environment)} selected.**`,
        '',
        `## 🟣 MIRROR MODE — Step 3 of 4: Scope`,
        '',
        `How do you want to select iFlows to compare?`,
        '',
        `**1. By iFlow name** — enter one or more iFlow IDs manually`,
        `**2. By deployment date** — match iFlows deployed on a specific date in ${srcLabel}`,
        '',
        'Reply with 1 or 2.',
        '',
        `> Credentials loaded from \`.env\` for both ${srcLabel} and ${envLabel(args.environment)} tenants.`,
      ].join('\n'),
    }],
  };
}

export function handleMirrorSetCredentials() {
  return { content: [{ type: 'text', text: READONLY_CREDS_MSG }] };
}

export async function handleMirrorDiscoverByDate(args: { date: string }) {
  const srcEnv  = mapEnvToCpiEnv(session.mirrorSourceEnv ?? 'TEST');
  const srcCreds = session.mirrorSourceCreds ?? undefined;

  let client: CpiClient;
  try {
    const c = srcCreds ? buildConfigFromCreds({ ...srcCreds, environment: srcEnv }) : loadConfigForEnv(srcEnv);
    client = new CpiClient(c);
  } catch (err) {
    return { content: [{ type: 'text', text: `❌ Cannot connect to source: ${(err as Error).message}` }] };
  }

  const since   = new Date(args.date);
  const nextDay = new Date(since); nextDay.setDate(nextDay.getDate() + 1);

  let iflows;
  try {
    const all = await client.searchRuntimeArtifacts({ deployedAfter: since });
    iflows = all.filter((a) =>
      (a.Type === 'INTEGRATION_FLOW' || a.Type === 'IntegrationFlow') &&
      new Date(a.DeployedOn) < nextDay
    );
  } catch (err) {
    return { content: [{ type: 'text', text: `❌ Failed to fetch artifacts: ${(err as Error).message}` }] };
  }

  if (iflows.length === 0) {
    return { content: [{ type: 'text', text: `📭 No iFlows found on ${args.date} in source (${envLabel(session.mirrorSourceEnv)}).` }] };
  }

  session.mirrorCandidates = iflows.map((a) => ({
    id: a.Id, name: a.Name, status: a.Status, deployedOn: a.DeployedOn, version: a.Version,
  }));

  const srcLabel = envLabel(session.mirrorSourceEnv);
  const lines = [
    `## 🔍 SOURCE (${srcLabel}) artifacts on ${args.date}`,
    '',
    '| # | iFlow Name | Package | Version | Deployed At | Runtime Status |',
    '|---|-----------|---------|---------|-------------|----------------|',
  ];
  iflows.forEach((a, i) => {
    const icon = a.Status === 'STARTED' ? '🟢' : a.Status === 'ERROR' ? '🔴' : '🟡';
    const dt = a.DeployedOn ? a.DeployedOn.replace('T', ' ').slice(0, 19) : '—';
    lines.push(`| ${i + 1} | ${a.Name} | — | ${a.Version} | ${dt} | ${icon} ${a.Status} |`);
  });
  lines.push('');
  lines.push(`**${iflows.length} artifact(s) found.**`);
  lines.push('');
  lines.push(`Compare all listed iFlows against ${envLabel(session.mirrorTargetEnv)}? Reply **yes** to proceed or **no** to cancel.`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleMirrorSetIflowList(args: { iflowList: string }) {
  const srcEnv  = mapEnvToCpiEnv(session.mirrorSourceEnv ?? 'TEST');
  const srcCreds = session.mirrorSourceCreds ?? undefined;

  let client: CpiClient;
  try {
    const c = srcCreds ? buildConfigFromCreds({ ...srcCreds, environment: srcEnv }) : loadConfigForEnv(srcEnv);
    client = new CpiClient(c);
  } catch (err) {
    return { content: [{ type: 'text', text: `❌ Cannot connect to source: ${(err as Error).message}` }] };
  }

  const terms = args.iflowList.split(',').map((t) => t.trim()).filter(Boolean);
  const candidates: typeof session.mirrorCandidates = [];

  for (const term of terms) {
    try {
      const hits = await client.searchRuntimeArtifacts({ nameFilter: term });
      const flows = hits.filter((a) => a.Type === 'INTEGRATION_FLOW' || a.Type === 'IntegrationFlow' || !a.Type);
      const chosen = flows.find((f) => f.Name.toLowerCase() === term.toLowerCase()) ?? flows[0];
      if (chosen && !candidates.find((c) => c.id === chosen.Id)) {
        candidates.push({ id: chosen.Id, name: chosen.Name, status: chosen.Status, deployedOn: chosen.DeployedOn, version: chosen.Version });
      } else if (!chosen) {
        candidates.push({ id: term, name: term, status: 'UNKNOWN', deployedOn: '—', version: '—' });
      }
    } catch {}
  }

  session.mirrorCandidates = candidates;
  session.mirrorStep = 6;

  const srcLabel = envLabel(session.mirrorSourceEnv);
  const tgtLabel = envLabel(session.mirrorTargetEnv);
  const lines = [
    `**${candidates.length} iFlow(s) ready to compare: ${srcLabel} ↔ ${tgtLabel}**`,
    '',
    candidates.map((c, i) => `${i + 1}. ${c.name}`).join('\n'),
    '',
    `Compare all listed iFlows against ${tgtLabel}? Reply **yes** to proceed or **no** to cancel.`,
  ];
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleMirrorRun() {
  const candidates = session.mirrorCandidates;
  if (candidates.length === 0) {
    return { content: [{ type: 'text', text: '❌ No iFlows in scope. Complete Steps M1–M5 first.' }] };
  }

  const srcEnv  = mapEnvToCpiEnv(session.mirrorSourceEnv ?? 'TEST');
  const tgtEnv  = mapEnvToCpiEnv(session.mirrorTargetEnv ?? 'PROD');
  const srcLabel = envLabel(session.mirrorSourceEnv);
  const tgtLabel = envLabel(session.mirrorTargetEnv);
  const total    = candidates.length;
  const allLines: string[] = [];

  const summaryRows: Array<{
    iflowName: string; versionA: string; versionB: string;
    matchCount: number; driftCount: number; missingCount: number; label: string;
  }> = [];

  const compassReport = await runCompass(
    candidates.map((c) => ({ id: c.id, name: c.name })),
    srcEnv,
    tgtEnv,
    {
      credsA: session.mirrorSourceCreds ?? undefined,
      credsB: session.mirrorTargetCreds ?? undefined,
    }
  );

  let compassPptxPath  = '';
  let compassExcelPath = '';
  try {
    void compassPptxPath; void compassExcelPath;
  } catch {}

  for (let i = 0; i < compassReport.results.length; i++) {
    const r = compassReport.results[i];
    const label = mirrorDriftLabel(r.diffs);
    const icon  = label === 'IN SYNC' ? '✅' : label === 'DRIFT' ? '⚠️' : '❌';
    allLines.push(`⏳ [${i + 1}/${total}] MIRROR comparing ${r.iflowId}: ${srcLabel} ↔ ${tgtLabel}...`);
    allLines.push(`${icon} [${i + 1}/${total}] Done — ${label}`);
    allLines.push('');
    allLines.push(formatMirrorReport(
      r.iflowId, r.iflowName, srcLabel, tgtLabel,
      compassReport.runId, r.diffs, compassPptxPath, compassExcelPath
    ));
    allLines.push('');

    const versionDiff = r.diffs.find((d) => d.field === 'C2 iFlow Version');
    summaryRows.push({
      iflowName: r.iflowName,
      versionA:  versionDiff?.valueA ?? '—',
      versionB:  versionDiff?.valueB ?? '—',
      matchCount:   r.diffs.filter((d) => d.verdict === 'MATCH').length,
      driftCount:   r.diffs.filter((d) => d.verdict === 'DRIFT' || d.verdict === 'EXTRA').length,
      missingCount: r.diffs.filter((d) => d.verdict === 'MISSING').length,
      label,
    });
  }

  if (total > 1) {
    allLines.push('---');
    allLines.push(formatMirrorBatchSummary(summaryRows, srcLabel, tgtLabel));
  }

  allLines.push(END_MENU);
  return { content: [{ type: 'text', text: allLines.join('\n') }] };
}

// ── compare_iflow — direct high-level comparison ─────────────────────────────

export async function handleCompareIflow(args: {
  iflowName: string;
  sourceEnv?: 'DEV' | 'TEST' | 'PROD';
  targetEnv?: 'DEV' | 'TEST' | 'PROD';
}) {
  const srcEnv: Environment = (args.sourceEnv ?? 'DEV') as Environment;
  const tgtEnv: Environment = (args.targetEnv ?? 'TEST') as Environment;

  if (srcEnv === tgtEnv) {
    return { content: [{ type: 'text', text: `❌ Source and target environments must differ. Both are \`${srcEnv}\`.` }] };
  }

  const srcCfg    = loadConfigForEnv(srcEnv);
  const srcClient = new CpiClient(srcCfg);
  let resolvedId   = '';
  let resolvedName = args.iflowName;

  try {
    const hits  = await srcClient.searchRuntimeArtifacts({ nameFilter: args.iflowName });
    const flows = hits.filter((a) => a.Type === 'INTEGRATION_FLOW' || a.Type === 'IntegrationFlow' || !a.Type);
    if (flows.length === 0) {
      return { content: [{ type: 'text', text: `❌ No iFlow found matching \`${args.iflowName}\` in ${srcEnv}. Check the name and try again.` }] };
    }
    const exact  = flows.find((f) => f.Name.toLowerCase() === args.iflowName.toLowerCase());
    const chosen = exact ?? flows[0];
    resolvedId   = chosen.Id;
    resolvedName = chosen.Name;
  } catch (err) {
    return { content: [{ type: 'text', text: `❌ Search failed in ${srcEnv}: ${(err as Error).message}` }] };
  }

  let compassReport;
  try {
    compassReport = await runCompass(
      [{ id: resolvedId, name: resolvedName }],
      srcEnv, tgtEnv, {}
    );
  } catch (err) {
    return { content: [{ type: 'text', text: `❌ Comparison failed: ${(err as Error).message}` }] };
  }

  const r            = compassReport.results[0];
  const a            = r.envA;
  const b            = r.envB;
  const runId        = compassReport.runId;
  const ts           = compassReport.triggeredAt.slice(0, 19).replace('T', ' ');
  const overallLabel = mirrorDriftLabel(r.diffs);
  const overallEmoji = overallLabel === 'IN SYNC' ? '🟢 IN SYNC' : overallLabel === 'DRIFT' ? '🟡 DRIFT' : '🔴 INCOMPLETE';

  const lines: string[] = [];

  lines.push(`## 🪞 ${resolvedName} — MIRROR Report`);
  lines.push(`**${srcEnv} → ${tgtEnv}** | **Run ID:** ${runId} | **${ts}**`);
  lines.push(`**Overall Drift:** ${overallEmoji}`);
  lines.push('');

  // Section 1: Identity
  lines.push('## 📋 Section 1 — iFlow Identity & Runtime');
  lines.push('');
  lines.push(`| # | Criteria | ${srcEnv} Value | ${tgtEnv} Value | Status |`);
  lines.push(`|---|----------|${''.padEnd(srcEnv.length + 8, '-')}|${''.padEnd(tgtEnv.length + 8, '-')}|--------|`);

  const s1Fields: Array<[string, string | number | undefined, string | number | undefined]> = [
    ['iFlow Name',          a?.iflowName,       b?.iflowName],
    ['iFlow Version',        a?.version,          b?.version],
    ['Runtime Status',       a?.activationStatus, b?.activationStatus],
    ['Package',              a?.packageId,        b?.packageId],
    ['Deployment Timestamp', a?.deployedOn?.slice(0, 19).replace('T', ' '), b?.deployedOn?.slice(0, 19).replace('T', ' ')],
    ['Message Log Level',    a?.logLevel,         b?.logLevel],
    ['Error Count (7 days)', a?.errorCount7d,     b?.errorCount7d],
    ['Last Successful Run',
      a?.lastSuccessfulRun?.replace('/Date(', '').replace(')/', '') ?? '—',
      b?.lastSuccessfulRun?.replace('/Date(', '').replace(')/', '') ?? '—'],
  ];

  s1Fields.forEach(([label, av, bv], i) => {
    const sa = String(av ?? '—');
    const sb = String(bv ?? '—');
    const st = !a ? '❌ MISSING' : !b ? '❌ MISSING' : sa === sb ? '✅ MATCH' : '⚠️ DRIFT';
    lines.push(`| ${i + 1} | ${label} | ${sa} | ${sb} | ${st} |`);
  });
  lines.push('');

  // Section 2: Adapters
  lines.push('## 🔌 Section 2 — Adapter Channels');
  lines.push('');

  const adaptersA  = a?.adapters ?? [];
  const adaptersB  = b?.adapters ?? [];
  const devParams  = a?.externalizedParams ?? {};
  const testParams = b?.externalizedParams ?? {};

  const resolveKey = (key: string, params: Record<string, string>): { value: string; found: boolean } => {
    if (params[key] !== undefined) return { value: params[key] || '_(empty)_', found: true };
    return { value: `⚠️ Not configured in params`, found: false };
  };

  const emitFieldRows = (
    fieldLabel: string,
    raw: string,
    paramsA: Record<string, string>,
    paramsB: Record<string, string>,
    adapterMissingA: boolean,
    adapterMissingB: boolean
  ) => {
    if (!raw || raw === '—') {
      lines.push(`| ${fieldLabel} | \`(fixed value)\` | — | — | ✅ MATCH |`);
      return;
    }
    const uniqueKeys = [...new Set(
      (raw.match(/\{\{([^}]+)\}\}/g) ?? []).map((m) => m.replace(/^\{\{|\}\}$/g, '').trim())
    )];

    if (uniqueKeys.length === 0) {
      const st = adapterMissingA || adapterMissingB ? '❌ MISSING' : '✅ MATCH';
      lines.push(`| ${fieldLabel} | \`(fixed value)\` | ${raw} | ${raw} | ${st} |`);
      return;
    }

    uniqueKeys.forEach((key, idx) => {
      const rowLabel = idx === 0 ? fieldLabel : '↳';
      if (adapterMissingA) { lines.push(`| ${rowLabel} | \`${key}\` | ⚠️ Not in ${srcEnv} | — | ❌ MISSING |`); return; }
      if (adapterMissingB) { lines.push(`| ${rowLabel} | \`${key}\` | — | ⚠️ Not in ${tgtEnv} | ❌ MISSING |`); return; }

      const rA   = resolveKey(key, paramsA);
      const rB   = resolveKey(key, paramsB);
      const dispA = !rA.found ? `⚠️ \`${key}\` not configured in ${srcEnv}` : rA.value;
      const dispB = !rB.found ? `⚠️ \`${key}\` not configured in ${tgtEnv}` : rB.value;
      const st    = !rA.found || !rB.found ? '❌ MISSING' : rA.value === rB.value ? '✅ MATCH' : '⚠️ DRIFT';
      lines.push(`| ${rowLabel} | \`${key}\` | ${dispA} | ${dispB} | ${st} |`);
    });
  };

  const allChannelKeys = [...new Set([
    ...adaptersA.map((x) => `${x.direction}::${x.adapterType}::${x.channelName}`),
    ...adaptersB.map((x) => `${x.direction}::${x.adapterType}::${x.channelName}`),
  ])];

  allChannelKeys.forEach((key, ci) => {
    const [dir, type, ch] = key.split('::');
    const adA = adaptersA.find((x) => x.direction === dir && x.adapterType === type && x.channelName === ch);
    const adB = adaptersB.find((x) => x.direction === dir && x.adapterType === type && x.channelName === ch);
    const sectionLabel = `2${String.fromCharCode(97 + ci)} — ${dir.charAt(0).toUpperCase() + dir.slice(1)}: ${type} (${ch})`;

    lines.push(`### ${sectionLabel}`);
    lines.push('');
    lines.push(`| Field | Parameter Key | ${srcEnv} Value | ${tgtEnv} Value | Status |`);
    lines.push(`|-------|---------------|${''.padEnd(srcEnv.length + 8, '-')}|${''.padEnd(tgtEnv.length + 8, '-')}|--------|`);

    const missingA = !adA;
    const missingB = !adB;

    const coreFields: Array<{ label: string; raw: string }> = [
      { label: 'Type',       raw: adA?.adapterType    ?? adB?.adapterType    ?? '—' },
      { label: 'Direction',  raw: adA?.direction       ?? adB?.direction       ?? '—' },
      { label: 'Host',       raw: adA?.host             || adB?.host             || '—' },
      { label: 'Address',    raw: adA?.address          || adB?.address          || '—' },
      { label: 'Protocol',   raw: adA?.protocol         || adB?.protocol         || '—' },
      { label: 'Credential', raw: adA?.credentialName   || adB?.credentialName   || '—' },
    ];

    [...new Set([...Object.keys(adA?.extraProps ?? {}), ...Object.keys(adB?.extraProps ?? {})])].forEach((k) => {
      coreFields.push({ label: k, raw: adA?.extraProps[k] || adB?.extraProps[k] || '—' });
    });

    coreFields.forEach(({ label, raw }) => {
      emitFieldRows(label, raw, devParams, testParams, missingA, missingB);
    });
    lines.push('');
  });

  // Section 3: Parameters
  lines.push('## 🔧 Section 3 — Externalized Parameters');
  lines.push('');
  lines.push(`| # | Parameter Name | ${srcEnv} Value | ${tgtEnv} Value | Status |`);
  lines.push(`|---|----------------|${''.padEnd(srcEnv.length + 8, '-')}|${''.padEnd(tgtEnv.length + 8, '-')}|--------|`);

  const devP  = a?.externalizedParams ?? {};
  const tstP  = b?.externalizedParams ?? {};
  const allParamKeys = [...new Set([...Object.keys(devP), ...Object.keys(tstP)])];

  allParamKeys.forEach((k, i) => {
    const dv  = devP[k] !== undefined ? (devP[k] || '_(empty)_') : '_(absent)_';
    const tv  = tstP[k] !== undefined ? (tstP[k] || '_(empty)_') : '_(absent)_';
    const st  = devP[k] === undefined ? '➕ EXTRA in ' + tgtEnv
      : tstP[k] === undefined ? '❌ MISSING in ' + tgtEnv
      : devP[k] === tstP[k] ? '✅ MATCH'
      : '⚠️ DRIFT';
    const bold = st !== '✅ MATCH' ? '**' : '';
    lines.push(`| ${i + 1} | ${bold}${k}${bold} | ${dv} | ${tv} | ${st} |`);
  });
  lines.push('');

  // Section 4: Summary
  const matchCount   = r.diffs.filter((d) => d.verdict === 'MATCH').length;
  const driftCount   = r.diffs.filter((d) => d.verdict === 'DRIFT').length;
  const missingCount = r.diffs.filter((d) => d.verdict === 'MISSING').length;
  const extraCount   = r.diffs.filter((d) => d.verdict === 'EXTRA').length;

  lines.push('## 📊 Section 4 — Summary');
  lines.push('');
  lines.push('| | Count |');
  lines.push('|---|---|');
  lines.push(`| ✅ MATCH | ${matchCount} |`);
  lines.push(`| ⚠️ DRIFT | ${driftCount} |`);
  lines.push(`| ❌ MISSING | ${missingCount} |`);
  lines.push(`| ➕ EXTRA | ${extraCount} |`);
  lines.push('');

  const missing = r.diffs.filter((d) => d.verdict === 'MISSING');
  const drifts  = r.diffs.filter((d) => d.verdict === 'DRIFT' || d.verdict === 'EXTRA');

  if (missing.length > 0) {
    lines.push(`🚨 **Promotion blockers — missing in ${tgtEnv}:**`);
    missing.forEach((d) => lines.push(`- **${d.field}**: present in ${srcEnv} (\`${d.valueA.slice(0, 60)}\`) — replicate before go-live`));
  } else if (drifts.length > 0) {
    lines.push(`⚠️ **Configuration drift — review before go-live:**`);
    drifts.forEach((d) => lines.push(`- **${d.field}**: ${srcEnv}=\`${d.valueA.slice(0, 50)}\` vs ${tgtEnv}=\`${d.valueB.slice(0, 50)}\``));
  } else {
    lines.push(`🟢 **${resolvedName} is fully in sync — ${tgtEnv} mirrors ${srcEnv}.**`);
  }

  if ((a?.errorCount7d ?? 0) > 0) {
    lines.push('');
    lines.push(`⚠️ **${srcEnv} has ${a!.errorCount7d} failed messages in the last 7 days** — investigate before promoting fixes.`);
  }

  try {
    // report generation removed
  } catch { /* non-fatal */ }

  lines.push(END_MENU);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
