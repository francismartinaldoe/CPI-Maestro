// handlers/guardian/guardianHandler.ts — All GUARDIAN wizard step logic and run execution

import { loadConfigForEnv, buildConfigFromCreds } from '../../config';
import { runSpotCheck } from '../../spotCheckOrchestrator';
import { CpiClient } from '../../cpiClient';
import { SpotCheckReport, Environment } from '../../types';
import { session, EnvCredentials } from '../shared/sessionManager';
import {
  formatGuardianReport,
  formatGuardianBatchSummary,
  envLabel,
} from './guardianFormatter';
import { END_MENU, GUARDIAN_ENV_PROMPT, READONLY_CREDS_MSG } from '../shared/menus';

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

export function mapEnvToCpiEnv(e: 'DEV' | 'TEST' | 'PROD'): Environment {
  if (e === 'PROD') return 'PROD';
  if (e === 'DEV')  return 'DEV';
  return 'TEST';
}

export function getGuardianCreds(env: 'DEV' | 'TEST' | 'PROD' | null): EnvCredentials | null {
  const suffix = env === 'DEV' ? 'DEV' : env === 'PROD' ? 'PROD' : 'TEST';
  const tenantUrl    = process.env[`CPI_TENANT_URL_${suffix}`];
  const tokenUrl     = process.env[`CPI_TOKEN_URL_${suffix}`];
  const clientId     = process.env[`CPI_CLIENT_ID_${suffix}`];
  const clientSecret = process.env[`CPI_CLIENT_SECRET_${suffix}`];
  if (!tenantUrl || !tokenUrl || !clientId || !clientSecret) return null;
  return { tenantUrl, tokenUrl, clientId, clientSecret };
}

export async function executeGuardianSpotCheck(
  iflowId: string,
  packageId: string,
  environment: Environment,
  creds?: EnvCredentials
): Promise<{ reportText: string; report: SpotCheckReport }> {
  const cfg = creds?.tenantUrl
    ? buildConfigFromCreds({ ...creds, environment })
    : loadConfigForEnv(environment);

  const report = await runSpotCheck(cfg, { iflowId, packageId, environment });

  let pptxPath = '';
  let excelPath = '';

  try {
    const d = dateStamp();
    const iflowSafe = iflowId.replace(/[^a-zA-Z0-9_-]/g, '_');
    pptxPath = '';
    void d; void iflowSafe;
  } catch {}

  try {
    excelPath = '';
  } catch {}

  session.addRun({
    runId:         report.runId,
    iflowId:       report.iflowId,
    iflowName:     report.iflowName,
    packageId:     report.packageId,
    environment:   report.environment,
    deployedOn:    report.deployedOn,
    overallStatus: report.overallStatus,
    summary:       report.summary,
    triggeredAt:   report.triggeredAt,
    checks:        report.checks,
    pptxPath:      pptxPath || undefined,
    jsonPath:      excelPath || undefined,
  });

  return { reportText: formatGuardianReport(report, pptxPath, excelPath), report };
}

// ── Wizard step handlers ───────────────────────────────────────────────────────

export function handleSelectModeGuardian() {
  session.currentMode = 'GUARDIAN';
  session.resetGuardian();
  return { content: [{ type: 'text', text: GUARDIAN_ENV_PROMPT }] };
}

export function handleGuardianSetEnvironment(args: { environment: 'DEV' | 'TEST' | 'PROD' }) {
  session.pendingEnvironment = args.environment;
  session.guardianStep = 3;
  const envName = envLabel(args.environment);
  return {
    content: [{
      type: 'text',
      text: [
        `✅ **Environment set: ${envName}**`,
        '',
        `## 🔵 GUARDIAN MODE — Step 2 of 3: Scope`,
        '',
        'How do you want to select iFlows?',
        '',
        '**1. By iFlow name** — enter one or more iFlow IDs manually',
        '**2. By deployment date** — fetch all artifacts deployed on a specific date',
        '',
        'Reply with 1 or 2.',
        '',
        `> Credentials are loaded from \`.env\` (${envName} tenant). To change credentials, update \`.env\` and restart the server.`,
      ].join('\n'),
    }],
  };
}

export function handleGuardianSetCredentials() {
  return { content: [{ type: 'text', text: READONLY_CREDS_MSG }] };
}

export async function handleGuardianDiscoverByDate(args: { date: string }) {
  const env    = session.pendingEnvironment ?? 'PROD';
  const cpiEnv = mapEnvToCpiEnv(env);
  const creds  = getGuardianCreds(env);

  let client: CpiClient;
  try {
    const c = creds ? buildConfigFromCreds({ ...creds, environment: cpiEnv }) : loadConfigForEnv(cpiEnv);
    client = new CpiClient(c);
  } catch (err) {
    return { content: [{ type: 'text', text: `❌ Cannot connect: ${(err as Error).message}` }] };
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
    return { content: [{ type: 'text', text: `📭 No iFlows deployed on ${args.date} in ${envLabel(env)}.` }] };
  }

  session.pendingCandidates = iflows.map((a) => ({
    id: a.Id, name: a.Name, status: a.Status, deployedOn: a.DeployedOn, version: a.Version,
  }));

  const lines = [
    `## 🔍 Artifacts Found — ${envLabel(env)}`,
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
  lines.push(`Run spot-check on all ${iflows.length} iFlow(s)? Reply **yes** to proceed or **no** to cancel.`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleGuardianSetIflowList(args: { iflowList: string }) {
  const env    = session.pendingEnvironment ?? 'PROD';
  const cpiEnv = mapEnvToCpiEnv(env);
  const creds  = getGuardianCreds(env);

  let client: CpiClient;
  try {
    const c = creds ? buildConfigFromCreds({ ...creds, environment: cpiEnv }) : loadConfigForEnv(cpiEnv);
    client = new CpiClient(c);
  } catch (err) {
    return { content: [{ type: 'text', text: `❌ Cannot connect: ${(err as Error).message}` }] };
  }

  const terms = args.iflowList.split(',').map((t) => t.trim()).filter(Boolean);
  const candidates: typeof session.pendingCandidates = [];

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

  session.pendingCandidates = candidates;
  session.guardianStep = 4;

  const lines = [
    `## 🔍 Artifacts Found — ${envLabel(env)}`,
    '',
    '| # | iFlow Name | Package | Version | Deployed At | Runtime Status |',
    '|---|-----------|---------|---------|-------------|----------------|',
  ];
  candidates.forEach((a, i) => {
    const icon = a.status === 'STARTED' ? '🟢' : a.status === 'ERROR' ? '🔴' : '🟡';
    const dt = a.deployedOn && a.deployedOn !== '—' ? a.deployedOn.replace('T', ' ').slice(0, 19) : '—';
    lines.push(`| ${i + 1} | ${a.name} | — | ${a.version} | ${dt} | ${icon} ${a.status} |`);
  });
  lines.push('');
  lines.push(`**${candidates.length} artifact(s) found.**`);
  lines.push('');
  lines.push(`Run spot-check on all ${candidates.length} iFlow(s)? Reply **yes** to proceed or **no** to cancel.`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleGuardianRun() {
  const candidates = session.pendingCandidates;
  if (candidates.length === 0) {
    return { content: [{ type: 'text', text: '❌ No iFlows in scope. Complete Steps G1–G3 first.' }] };
  }

  const env    = session.pendingEnvironment ?? 'PROD';
  const cpiEnv = mapEnvToCpiEnv(env);
  const creds  = getGuardianCreds(env);
  const total  = candidates.length;
  const reports: SpotCheckReport[] = [];
  const lines: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    lines.push(`⏳ [${i + 1}/${total}] GUARDIAN checking ${c.id} on ${envLabel(env)}...`);
    try {
      const { reportText, report } = await executeGuardianSpotCheck(
        c.id, 'default', cpiEnv, creds ?? undefined
      );
      reports.push(report);
      const icon = report.overallStatus === 'PASS' ? '✅' : report.overallStatus === 'WARN' ? '⚠️' : '❌';
      lines.push(`${icon} [${i + 1}/${total}] Done — ${report.overallStatus}`);
      lines.push('');
      lines.push(reportText);
      lines.push('');
    } catch (err) {
      lines.push(`❌ [${i + 1}/${total}] ERROR: ${(err as Error).message}`);
    }
  }

  if (reports.length > 1) {
    lines.push('---');
    lines.push(formatGuardianBatchSummary(reports, envLabel(env)));
  }

  lines.push(END_MENU);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
