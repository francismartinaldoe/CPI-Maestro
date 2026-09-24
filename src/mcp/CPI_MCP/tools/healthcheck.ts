// src/mcp/CPI_MCP/tools/healthcheck.ts — GUARDIAN spot-check (single and multi-profile)
//
// handleSpotcheckIflow        — single tenant, existing behaviour unchanged
// handleMultiProfileSpotcheck — fans out across N profiles in parallel,
//                               merges into a side-by-side comparison table

import { CpiClient }           from '../cpiClient.js';
import { loadProfileCredentials, getProfiles } from '../config.js';
import type { Environment, ToolResult }        from '../types.js';

// ── Internal types ────────────────────────────────────────────────────────────

interface CheckResult {
  category:    string;
  status:      'PASS' | 'WARN' | 'FAIL' | 'SKIP';
  detail:      string;
  escalation?: string;
}

interface ProfileCheckResult {
  label:    string;   // profile name or env label shown as column header
  iflow:    string;   // resolved iFlow name
  checks:   CheckResult[];
  error?:   string;   // set if the profile failed entirely (auth error, not found, etc.)
}

// ── Core 8-dimension check runner ─────────────────────────────────────────────
// Shared by both single and multi-profile paths.

async function runChecks(
  client: CpiClient,
  iflowName: string,
  label: string,
): Promise<ProfileCheckResult> {
  // Resolve the iFlow from runtime
  const candidates = await client.searchRuntimeArtifacts({ nameFilter: iflowName }).catch(() => []);
  const flows = candidates.filter(
    a => a.Type === 'INTEGRATION_FLOW' || a.Type === 'IntegrationFlow' || !a.Type,
  );

  if (!flows.length) {
    return {
      label,
      iflow: iflowName,
      checks: [],
      error: `No iFlow matching "${iflowName}" found`,
    };
  }

  const chosen = flows.find(f => f.Name.toLowerCase() === iflowName.toLowerCase()) ?? flows[0];
  const checks: CheckResult[] = [];

  // ── 1. Activation ──────────────────────────────────────────────────────────
  if (chosen.Status === 'STARTED') {
    checks.push({ category: 'Activation', status: 'PASS', detail: `STARTED` });
  } else if (chosen.Status === 'ERROR') {
    checks.push({
      category: 'Activation', status: 'FAIL',
      detail: `ERROR${chosen.ErrorInformation ? ' — ' + chosen.ErrorInformation.slice(0, 60) : ''}`,
      escalation: 'Redeploy or check error logs',
    });
  } else {
    checks.push({ category: 'Activation', status: 'WARN', detail: chosen.Status, escalation: 'Verify deployment' });
  }

  // ── 2. Config Params ───────────────────────────────────────────────────────
  try {
    const cfg   = await client.getIflowConfigurations(chosen.Id);
    const empty = Object.entries(cfg).filter(([, v]) => !v || v.trim() === '');
    if (empty.length === 0) {
      checks.push({ category: 'Config Params', status: 'PASS', detail: `${Object.keys(cfg).length} param(s) set` });
    } else {
      checks.push({
        category: 'Config Params', status: 'WARN',
        detail: `${empty.length} empty: ${empty.map(([k]) => k).join(', ')}`,
        escalation: 'Fill missing externalized params',
      });
    }
  } catch {
    checks.push({ category: 'Config Params', status: 'SKIP', detail: 'Could not fetch' });
  }

  // ── 3. Message Errors (7d) ─────────────────────────────────────────────────
  try {
    const since  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('Z', '');
    const failed = await client.getFailedMessages({ artifactName: chosen.Name, fromDate: since, top: 10 });
    if (failed.length === 0) {
      checks.push({ category: 'Message Errors (7d)', status: 'PASS', detail: 'None in 7 days' });
    } else if (failed.length <= 3) {
      checks.push({ category: 'Message Errors (7d)', status: 'WARN', detail: `${failed.length} failed`, escalation: 'Review logs' });
    } else {
      checks.push({ category: 'Message Errors (7d)', status: 'FAIL', detail: `${failed.length} failed`, escalation: 'Investigate root cause' });
    }
  } catch {
    checks.push({ category: 'Message Errors (7d)', status: 'SKIP', detail: 'Could not query' });
  }

  // ── 4. Credentials ─────────────────────────────────────────────────────────
  try {
    const [allCreds, oauths] = await Promise.all([client.getCredentials(), client.getOAuthCredentials()]);
    const total = allCreds.length + oauths.length;
    if (total > 0) {
      checks.push({ category: 'Credentials', status: 'PASS', detail: `${total} alias(es)` });
    } else {
      checks.push({ category: 'Credentials', status: 'WARN', detail: 'None found', escalation: 'Verify security artifacts' });
    }
  } catch {
    checks.push({ category: 'Credentials', status: 'SKIP', detail: 'Could not query' });
  }

  // ── 5. Keystores ───────────────────────────────────────────────────────────
  try {
    const keystores = await client.getKeystoreEntries();
    const soon = keystores.filter(k => {
      if (!k.ValidNotAfter) return false;
      return new Date(k.ValidNotAfter).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
    });
    if (soon.length === 0) {
      checks.push({ category: 'Keystores', status: 'PASS', detail: `${keystores.length} entrie(s), none expiring <30d` });
    } else {
      checks.push({
        category: 'Keystores', status: 'WARN',
        detail: `${soon.length} expiring <30d: ${soon.map(k => k.Alias).join(', ')}`,
        escalation: 'Renew certificates',
      });
    }
  } catch {
    checks.push({ category: 'Keystores', status: 'SKIP', detail: 'Could not query' });
  }

  // ── 6. Service Endpoints ───────────────────────────────────────────────────
  try {
    const eps  = await client.getServiceEndpoints();
    const mine = eps.filter(
      e => e.Name.toLowerCase().includes(chosen.Name.toLowerCase()) ||
           e.Id.toLowerCase().includes(chosen.Id.toLowerCase()),
    );
    if (mine.length > 0) {
      checks.push({ category: 'Service Endpoints', status: 'PASS', detail: `${mine.length} endpoint(s)` });
    } else {
      checks.push({ category: 'Service Endpoints', status: 'WARN', detail: 'None found', escalation: 'Verify HTTP endpoint config' });
    }
  } catch {
    checks.push({ category: 'Service Endpoints', status: 'SKIP', detail: 'Could not query' });
  }

  // ── 7. JMS Queues ──────────────────────────────────────────────────────────
  try {
    const queues = await client.getJmsQueues();
    const full   = queues.filter(q => q.MaxSize > 0 && q.Size / q.MaxSize > 0.8);
    if (full.length === 0) {
      checks.push({
        category: 'JMS Queues',
        status: queues.length > 0 ? 'PASS' : 'SKIP',
        detail: queues.length > 0 ? `${queues.length} queue(s) healthy` : 'None configured',
      });
    } else {
      checks.push({
        category: 'JMS Queues', status: 'WARN',
        detail: `${full.length} >80% full`,
        escalation: 'Drain or expand capacity',
      });
    }
  } catch {
    checks.push({ category: 'JMS Queues', status: 'SKIP', detail: 'Could not query' });
  }

  // ── 8. Design-time Artifact ────────────────────────────────────────────────
  try {
    const artifact = await client.getArtifact(chosen.Id);
    if (artifact) {
      checks.push({ category: 'Design-time Artifact', status: 'PASS', detail: `v${artifact.Version} in ${artifact.PackageId}` });
    } else {
      checks.push({ category: 'Design-time Artifact', status: 'WARN', detail: 'Not found in packages', escalation: 'Verify iFlow exists in design-time' });
    }
  } catch {
    checks.push({ category: 'Design-time Artifact', status: 'SKIP', detail: 'Could not query' });
  }

  return { label, iflow: chosen.Name, checks };
}

// ── Single-profile spotcheck (public, unchanged behaviour) ────────────────────

export async function handleSpotcheckIflow(
  client: CpiClient,
  args: Record<string, unknown>,
  env: Environment,
): Promise<ToolResult> {
  const iflowName = String(args.iflowName ?? '');
  if (!iflowName) return text('❌ iflowName is required.');

  const result = await runChecks(client, iflowName, env);

  if (result.error) return text(`❌ ${result.error} in ${env}.`);

  const { checks } = result;
  const pass    = checks.filter(c => c.status === 'PASS').length;
  const warn    = checks.filter(c => c.status === 'WARN').length;
  const fail    = checks.filter(c => c.status === 'FAIL').length;
  const skip    = checks.filter(c => c.status === 'SKIP').length;
  const overall = fail > 0 ? 'FAIL' : warn > 0 ? 'WARN' : 'PASS';

  const lines: string[] = [
    `## 🛡️ ${result.iflow} — GUARDIAN Spot-Check [${env}]`,
    `**Overall:** ${overall === 'PASS' ? '🟢 PASS' : overall === 'WARN' ? '🟡 WARN' : '🔴 FAIL'}`,
    '',
    '| # | Check | Status | Detail | Action |',
    '|---|-------|--------|--------|--------|',
    ...checks.map((c, i) => {
      const dot = c.status === 'PASS' ? '✅ PASS' : c.status === 'WARN' ? '⚠️ WARN' : c.status === 'FAIL' ? '❌ FAIL' : '⏭️ SKIP';
      return `| ${i + 1} | ${c.category} | ${dot} | ${c.detail} | ${c.escalation ?? '—'} |`;
    }),
    '',
    `**✅ ${pass} PASS  ⚠️ ${warn} WARN  ❌ ${fail} FAIL  ⏭️ ${skip} SKIP**`,
  ];

  const failures = checks.filter(c => c.status === 'FAIL');
  const warnings = checks.filter(c => c.status === 'WARN');
  if (failures.length) {
    lines.push('', '🚨 **Blocking issues:**');
    failures.forEach(f => lines.push(`- **${f.category}** → ${f.escalation ?? f.detail}`));
  } else if (warnings.length) {
    lines.push('', '⚠️ **Review recommended:**');
    warnings.forEach(w => lines.push(`- **${w.category}** → ${w.escalation ?? w.detail}`));
  } else {
    lines.push('', `🟢 **${result.iflow} is healthy in ${env} — go-live ready.**`);
  }

  return text(lines.join('\n'));
}

// ── Multi-profile spotcheck (new) ─────────────────────────────────────────────
// Fans out across N profiles in parallel, merges into a side-by-side table.
// Columns = profiles, rows = 8 check dimensions.

export async function handleMultiProfileSpotcheck(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const iflowName = String(args.iflowName ?? '');
  if (!iflowName) return text('❌ iflowName is required.');

  // Resolve which profiles to use
  const allProfiles  = getProfiles();
  if (allProfiles.length === 0) {
    return text(
      '❌ No CPI profiles configured.\n' +
      'Open Settings → SAP CPI Tenants and add at least two profiles.',
    );
  }

  // profileIds arg is optional — default to all configured profiles
  const requested = args.profileIds as string[] | undefined;
  const targets = requested && requested.length > 0
    ? allProfiles.filter(p => requested.includes(p.id) || requested.includes(p.name))
    : allProfiles;

  if (targets.length === 0) {
    return text(`❌ None of the requested profiles found. Use list_profiles to see available profiles.`);
  }
  if (targets.length === 1) {
    return text(`⚠️ Only one profile matched — use spotcheck_iflow for single-profile checks. Add more profiles in Settings to enable cross-tenant comparison.`);
  }

  // Fan out all spot-checks in parallel
  const results: ProfileCheckResult[] = await Promise.all(
    targets.map(async profile => {
      try {
        const creds = loadProfileCredentials(profile.id);
        if (!creds) return { label: profile.name, iflow: iflowName, checks: [], error: 'Profile credentials not found' };
        const client = new CpiClient(creds);
        return runChecks(client, iflowName, profile.name);
      } catch (err) {
        return {
          label:  profile.name,
          iflow:  iflowName,
          checks: [],
          error:  err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  // ── Build side-by-side comparison table ─────────────────────────────────────
  // Rows = check dimensions (union of all categories across all results)
  // Cols = one per profile

  const CATEGORIES = [
    'Activation',
    'Config Params',
    'Message Errors (7d)',
    'Credentials',
    'Keystores',
    'Service Endpoints',
    'JMS Queues',
    'Design-time Artifact',
  ];

  const statusIcon = (s: 'PASS' | 'WARN' | 'FAIL' | 'SKIP' | undefined) =>
    s === 'PASS' ? '✅' : s === 'WARN' ? '⚠️' : s === 'FAIL' ? '❌' : '⏭️';

  const overallIcon = (r: ProfileCheckResult) => {
    if (r.error) return '🔴 ERR';
    const fail = r.checks.some(c => c.status === 'FAIL');
    const warn = r.checks.some(c => c.status === 'WARN');
    return fail ? '🔴 FAIL' : warn ? '🟡 WARN' : '🟢 PASS';
  };

  const colHeaders = results.map(r => r.label);
  const separator  = results.map(() => '---');

  const lines: string[] = [
    `## 🛡️ Multi-Tenant GUARDIAN — \`${iflowName}\``,
    `Comparing **${results.length} tenants** in parallel · ${results.length} spot-checks run`,
    '',
    // Overall verdict row
    `| Check | ${colHeaders.join(' | ')} |`,
    `|-------|${separator.join('|')}|`,
    `| **Overall** | ${results.map(r => `**${overallIcon(r)}**`).join(' | ')} |`,
  ];

  // One row per check dimension
  for (const cat of CATEGORIES) {
    const cells = results.map(r => {
      if (r.error) return `_${r.error.slice(0, 40)}_`;
      const check = r.checks.find(c => c.category === cat);
      if (!check) return '⏭️ —';
      return `${statusIcon(check.status)} ${check.detail.slice(0, 50)}`;
    });
    lines.push(`| ${cat} | ${cells.join(' | ')} |`);
  }

  // ── Summary section ──────────────────────────────────────────────────────────
  lines.push('', '---', '### Summary');

  for (const r of results) {
    if (r.error) {
      lines.push(`- **${r.label}**: 🔴 Error — ${r.error}`);
      continue;
    }
    const fail = r.checks.filter(c => c.status === 'FAIL');
    const warn = r.checks.filter(c => c.status === 'WARN');
    const pass = r.checks.filter(c => c.status === 'PASS');
    lines.push(
      `- **${r.label}** (iFlow: \`${r.iflow}\`): ` +
      `${overallIcon(r)} — ✅ ${pass.length} PASS  ⚠️ ${warn.length} WARN  ❌ ${fail.length} FAIL`,
    );
    if (fail.length) {
      fail.forEach(f => lines.push(`  - ❌ **${f.category}**: ${f.escalation ?? f.detail}`));
    }
  }

  // ── Drift detection: highlight dimensions where tenants disagree ──────────────
  const drifted = CATEGORIES.filter(cat => {
    const statuses = results
      .map(r => r.checks.find(c => c.category === cat)?.status)
      .filter((s): s is 'PASS' | 'WARN' | 'FAIL' | 'SKIP' => !!s);
    return new Set(statuses).size > 1;
  });

  if (drifted.length > 0) {
    lines.push('', '### ⚠️ Drift Detected');
    lines.push('These dimensions have **different results across tenants** — investigate before promoting:');
    drifted.forEach(cat => lines.push(`- ${cat}`));
  } else if (results.every(r => !r.error)) {
    lines.push('', '### ✅ No Drift');
    lines.push('All tenants show the same result on every dimension.');
  }

  return text(lines.join('\n'));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function text(t: string): ToolResult { return { content: [{ type: 'text', text: t }] }; }
