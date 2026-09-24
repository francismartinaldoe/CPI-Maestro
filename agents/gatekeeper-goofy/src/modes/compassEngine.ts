// src/modes/compassEngine.ts
// MIRROR Mode (Mode 2): compare two environments across all 17 criteria.
// Supports explicit credential overrides (used by mcpServer MIRROR flow).

import { Config, loadConfigForEnv, buildConfigFromCreds } from '../config';
import { CpiClient } from '../cpiClient';
import {
  AdapterConfig,
  CompassIflowResult,
  CompassReport,
  ComparisonDiff,
  ComparisonSnapshot,
  Environment,
} from '../types';
import { extractBpmnXml, parseAdapters, summariseAdapters } from '../utils/adapterParser';
import logger from '../utils/logger';

function genRunId(): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MIR-${ts}-${rand}`;
}

// ── Resolve Config: explicit creds override .env ─────────────────────────────
interface EnvCredentials {
  tenantUrl:    string;
  tokenUrl:     string;
  clientId:     string;
  clientSecret: string;
}

function resolveConfig(
  env: Environment,
  creds?: EnvCredentials
): Config | null {
  if (creds?.tenantUrl && creds.tokenUrl && creds.clientId && creds.clientSecret) {
    return buildConfigFromCreds({ ...creds, environment: env });
  }
  try { return loadConfigForEnv(env); } catch { return null; }
}

// ── Build a full 17-criteria snapshot for one iFlow in one environment ────────
async function buildSnapshot(
  iflowId: string,
  iflowName: string,
  env: Environment,
  creds?: EnvCredentials
): Promise<ComparisonSnapshot | null> {
  const cfg = resolveConfig(env, creds);
  if (!cfg) return null;

  const client = new CpiClient(cfg);

  // Confirm iFlow is deployed
  let artifact;
  try { artifact = await client.getRuntimeArtifact(iflowId); } catch { artifact = null; }
  if (!artifact) return null;

  const raw = artifact as unknown as Record<string, string>;

  // C1  iFlow Name
  const name = artifact.Name ?? iflowName;

  // C2  Version
  const version = artifact.Version ?? '—';

  // C3  Activation Status
  const activationStatus = artifact.Status ?? 'UNKNOWN';

  // C4  Deployed On / By
  const deployedOn = artifact.DeployedOn ?? '—';
  const deployedBy = raw['DeployedBy'] ?? '—';

  // C5  Credentials — actual alias list
  let credentialAliases: string[] = [];
  let credentialCount = 0;
  try {
    const creds5 = await client.getCredentials();
    credentialAliases = creds5.map((c) => c.Name);
    credentialCount = creds5.length;
  } catch {}

  // C6  Keystore Aliases
  let keystoreAliases: string[] = [];
  let keystoreEntryCount = 0;
  try {
    const ks = await client.getKeystoreEntries();
    keystoreAliases = ks.map((k) => k.Alias);
    keystoreEntryCount = ks.length;
  } catch {}

  // C7  OAuth Configurations — name + token URL
  let oauthConfigs: Array<{ name: string; tokenUrl: string }> = [];
  let oauthConfigCount = 0;
  try {
    const oauth = await client.getOAuthCredentials();
    oauthConfigs = oauth.map((o) => ({ name: o.Name, tokenUrl: o.TokenServiceUrl }));
    oauthConfigCount = oauth.length;
  } catch {}

  // C8  Endpoint Configuration
  const endpointUrl = `${cfg.tenantUrl}/http/${iflowId}`;
  let endpointProtocol = 'HTTPS';
  let endpointReachable = false;
  let endpointStatusCode = 0;
  try {
    const ping = await client.pingEndpoint(endpointUrl);
    endpointReachable  = ping.reachable;
    endpointStatusCode = ping.statusCode ?? 0;
    if (endpointUrl.toLowerCase().startsWith('http://')) endpointProtocol = 'HTTP';
  } catch {}

  // C9  Adapter Settings — download ZIP, parse BPMN2 XML
  let adapters: AdapterConfig[] = [];
  let adapterSettings = 'Unknown';
  try {
    const zipBuf = await client.getIflowContent(iflowId);
    if (zipBuf) {
      const xml = extractBpmnXml(zipBuf);
      if (xml) {
        adapters = parseAdapters(xml);
        adapterSettings = summariseAdapters(adapters);
      }
    }
  } catch {}

  // C10 Value Mappings
  let valueMappings: Array<{ name: string; version?: string; status?: string }> = [];
  let valueMappingCount = 0;
  let vmDeployedCount = 0;
  try {
    const allArtifacts = await client.getRuntimeArtifacts();
    const vms = allArtifacts.filter((a) => a.Type === 'VALUE_MAPPING' || a.Type === 'ValueMapping');
    valueMappings = vms.map((v) => ({ name: v.Name, version: v.Version, status: v.Status }));
    valueMappingCount = vms.length;
    vmDeployedCount = vms.filter((v) => v.Status === 'STARTED').length;
  } catch {}

  // C11 Package Membership
  let packageId = '—';
  try {
    const designArtifact = await client.getArtifact(iflowId);
    if (designArtifact?.PackageId) packageId = designArtifact.PackageId;
  } catch {}

  // C12 Description / Metadata
  let description = '—';
  try {
    description = await client.getIflowDescription(iflowId);
  } catch {}

  // C13 Externalized Parameters (key/value)
  let externalizedParams: Record<string, string> = {};
  try {
    externalizedParams = await client.getIflowConfigurations(iflowId);
  } catch {}

  // C14 Log Level (inferred from recent messages)
  let logLevel = 'INFO';
  try {
    const msgs = await client.getRecentMessages(iflowId, 5);
    const withTrace = msgs.filter((m) => {
      const lvl = (m as unknown as Record<string, string>)['LogLevel'];
      return lvl === 'TRACE' || lvl === 'DEBUG';
    });
    if (withTrace.length > 0) logLevel = 'TRACE/DEBUG';
  } catch {}

  // C15 Error Count (7 days) & C16 Last Successful Run
  let errorCount7d = 0;
  let lastSuccessfulRun = '—';
  try {
    const stats = await client.getMessageStats(iflowId);
    errorCount7d     = stats.errorCount7d;
    lastSuccessfulRun = stats.lastSuccessfulRun;
  } catch {}

  // C17 Configurable Parameters — same as externalized for now
  const configurableParams: Record<string, string> = { ...externalizedParams };

  return {
    environment: env,
    iflowName: name,
    version,
    activationStatus,
    deployedOn,
    deployedBy,
    credentialAliases,
    credentialCount,
    keystoreAliases,
    keystoreEntryCount,
    oauthConfigs,
    oauthConfigCount,
    endpointUrl,
    endpointProtocol,
    endpointReachable,
    endpointStatusCode,
    adapters,
    adapterSettings,
    valueMappings,
    valueMappingCount,
    vmDeployedCount,
    packageId,
    description,
    externalizedParams,
    logLevel,
    errorCount7d,
    lastSuccessfulRun,
    configurableParams,
    overallStatus: activationStatus === 'STARTED' ? 'PASS' : 'FAIL',
    checks: [],
  };
}

// ── Diff helpers ──────────────────────────────────────────────────────────────

function sortedStr(arr: string[]): string {
  return [...arr].sort().join(', ') || '(none)';
}

function calcDiffs(
  envA: string,
  envB: string,
  snapA: ComparisonSnapshot | null,
  snapB: ComparisonSnapshot | null
): ComparisonDiff[] {
  const diffs: ComparisonDiff[] = [];

  function compare(
    field: string,
    a: string | number | boolean | undefined,
    b: string | number | boolean | undefined
  ) {
    const sa = a != null ? String(a) : '—';
    const sb = b != null ? String(b) : '—';
    if (!snapA && !snapB) return;
    if (!snapA) { diffs.push({ field, valueA: 'Not Deployed', valueB: sb, verdict: 'MISSING' }); return; }
    if (!snapB) { diffs.push({ field, valueA: sa, valueB: 'Not Deployed', verdict: 'MISSING' }); return; }
    diffs.push({ field, valueA: sa, valueB: sb, verdict: sa === sb ? 'MATCH' : 'DRIFT' });
  }

  function compareList(field: string, a?: string[], b?: string[]) {
    const sa = sortedStr(a ?? []);
    const sb = sortedStr(b ?? []);
    if (!snapA) { diffs.push({ field, valueA: 'Not Deployed', valueB: sb, verdict: 'MISSING' }); return; }
    if (!snapB) { diffs.push({ field, valueA: sa, valueB: 'Not Deployed', verdict: 'MISSING' }); return; }
    if (sa === sb) { diffs.push({ field, valueA: sa, valueB: sb, verdict: 'MATCH' }); return; }
    // Check for EXTRA (items in B not in A)
    const setA = new Set(a ?? []);
    const setB = new Set(b ?? []);
    const hasExtra   = [...setB].some((x) => !setA.has(x));
    const hasMissing = [...setA].some((x) => !setB.has(x));
    const verdict = hasMissing ? 'MISSING' : hasExtra ? 'EXTRA' : 'DRIFT';
    diffs.push({ field, valueA: sa, valueB: sb, verdict });
  }

  function compareRecord(field: string, a?: Record<string, string>, b?: Record<string, string>) {
    const sa = Object.entries(a ?? {}).map(([k, v]) => `${k}=${v}`).sort().join('; ') || '(none)';
    const sb = Object.entries(b ?? {}).map(([k, v]) => `${k}=${v}`).sort().join('; ') || '(none)';
    if (!snapA) { diffs.push({ field, valueA: 'Not Deployed', valueB: sb, verdict: 'MISSING' }); return; }
    if (!snapB) { diffs.push({ field, valueA: sa, valueB: 'Not Deployed', verdict: 'MISSING' }); return; }
    if (sa === sb) { diffs.push({ field, valueA: sa, valueB: sb, verdict: 'MATCH' }); return; }
    const keysA = new Set(Object.keys(a ?? {}));
    const keysB = new Set(Object.keys(b ?? {}));
    const hasMissing = [...keysA].some((k) => !keysB.has(k));
    const hasExtra   = [...keysB].some((k) => !keysA.has(k));
    const verdict = hasMissing ? 'MISSING' : hasExtra ? 'EXTRA' : 'DRIFT';
    diffs.push({ field, valueA: sa, valueB: sb, verdict });
  }

  // C1  iFlow Name
  compare('C1 iFlow Name',           snapA?.iflowName,          snapB?.iflowName);
  // C2  iFlow Version
  compare('C2 iFlow Version',        snapA?.version,             snapB?.version);
  // C3  Runtime Status
  compare('C3 Runtime Status',       snapA?.activationStatus,    snapB?.activationStatus);
  // C4  Deployment Timestamp
  compare('C4 Deployment Timestamp', snapA?.deployedOn?.slice(0, 19),  snapB?.deployedOn?.slice(0, 19));
  // C5  Credentials
  compareList('C5 Credentials',      snapA?.credentialAliases,   snapB?.credentialAliases);
  // C6  Keystore Aliases
  compareList('C6 Keystore Aliases', snapA?.keystoreAliases,     snapB?.keystoreAliases);
  // C7  OAuth Configurations
  compareList('C7 OAuth Configurations',
    snapA?.oauthConfigs.map((o) => `${o.name}@${o.tokenUrl}`),
    snapB?.oauthConfigs.map((o) => `${o.name}@${o.tokenUrl}`)
  );
  // C8  Endpoint Configuration
  compare('C8 Endpoint URL',         snapA?.endpointUrl,         snapB?.endpointUrl);
  compare('C8 Endpoint Protocol',    snapA?.endpointProtocol,    snapB?.endpointProtocol);
  // C9  Adapter Settings — summary
  compare('C9 Adapter Types',       snapA?.adapterSettings,     snapB?.adapterSettings);

  // C9b Per-adapter channel comparison (host, address, credential per channel)
  const allChannels = [
    ...new Set([
      ...(snapA?.adapters ?? []).map((a) => `${a.direction}:${a.adapterType}:${a.channelName}`),
      ...(snapB?.adapters ?? []).map((a) => `${a.direction}:${a.adapterType}:${a.channelName}`),
    ]),
  ];
  for (const key of allChannels) {
    const [dir, type, ch] = key.split(':');
    const aAdapter = snapA?.adapters.find((a) => a.direction === dir && a.adapterType === type && a.channelName === ch);
    const bAdapter = snapB?.adapters.find((a) => a.direction === dir && a.adapterType === type && a.channelName === ch);
    const label = `C9 ${type}(${dir}) ${ch}`;

    if (!snapA) { diffs.push({ field: `${label} host`, valueA: 'Not Deployed', valueB: bAdapter?.host ?? '—', verdict: 'MISSING' }); continue; }
    if (!snapB) { diffs.push({ field: `${label} host`, valueA: aAdapter?.host ?? '—', valueB: 'Not Deployed', verdict: 'MISSING' }); continue; }
    if (!aAdapter && bAdapter) { diffs.push({ field: `${label} host`, valueA: '(absent)', valueB: bAdapter.host, verdict: 'EXTRA' }); continue; }
    if (aAdapter && !bAdapter) { diffs.push({ field: `${label} host`, valueA: aAdapter.host, valueB: '(absent)', verdict: 'MISSING' }); continue; }
    if (!aAdapter || !bAdapter) continue;

    // Compare each significant field
    const adapterFields: Array<keyof typeof aAdapter> = ['host', 'address', 'credentialName', 'protocol', 'port'];
    for (const f of adapterFields) {
      const va = String(aAdapter[f] ?? '');
      const vb = String(bAdapter[f] ?? '');
      if (va || vb) {
        diffs.push({ field: `${label} ${f}`, valueA: va, valueB: vb, verdict: va === vb ? 'MATCH' : 'DRIFT' });
      }
    }
    // Extra props
    const allKeys = new Set([...Object.keys(aAdapter.extraProps), ...Object.keys(bAdapter.extraProps)]);
    for (const k of allKeys) {
      const va = aAdapter.extraProps[k] ?? '';
      const vb = bAdapter.extraProps[k] ?? '';
      diffs.push({ field: `${label} ${k}`, valueA: va || '(absent)', valueB: vb || '(absent)', verdict: va === vb ? 'MATCH' : 'DRIFT' });
    }
  }
  // C10 Value Mappings
  compareList('C10 Value Mappings',
    snapA?.valueMappings.map((v) => v.name),
    snapB?.valueMappings.map((v) => v.name)
  );
  // C11 Package Membership
  compare('C11 Package Membership',  snapA?.packageId,           snapB?.packageId);
  // C12 Description / Metadata
  compare('C12 Description',         snapA?.description,         snapB?.description);
  // C13 Externalized Parameters
  compareRecord('C13 Externalized Parameters', snapA?.externalizedParams, snapB?.externalizedParams);
  // C14 Log Level
  compare('C14 Log Level',           snapA?.logLevel,            snapB?.logLevel);
  // C15 Error Count (7d)
  compare('C15 Error Count (7d)',    snapA?.errorCount7d,        snapB?.errorCount7d);
  // C16 Last Successful Run
  compare('C16 Last Successful Run', snapA?.lastSuccessfulRun,   snapB?.lastSuccessfulRun);
  // C17 Configurable Parameters
  compareRecord('C17 Configurable Parameters', snapA?.configurableParams, snapB?.configurableParams);

  return diffs;
}

// ── Drift label per spec ──────────────────────────────────────────────────────
export function mirrorDriftLabel(diffs: ComparisonDiff[]): string {
  if (diffs.some((d) => d.verdict === 'MISSING'))  return 'INCOMPLETE';
  if (diffs.some((d) => d.verdict === 'DRIFT' || d.verdict === 'EXTRA')) return 'DRIFT';
  return 'IN SYNC';
}

// ── Public entry point ────────────────────────────────────────────────────────
export interface CompassRunOptions {
  credsA?: EnvCredentials;
  credsB?: EnvCredentials;
}

export async function runCompass(
  iflows: Array<{ id: string; name: string }>,
  envA: Environment,
  envB: Environment,
  opts: CompassRunOptions = {}
): Promise<CompassReport> {
  const runId      = genRunId();
  const triggeredAt = new Date().toISOString();
  const results: CompassIflowResult[] = [];

  logger.info(`\nMIRROR ${envA} vs ${envB} — ${iflows.length} iFlow(s)`);

  for (const flow of iflows) {
    process.stdout.write(`  🔍  ${flow.name.padEnd(60, '.')} `);

    const [snapA, snapB] = await Promise.all([
      buildSnapshot(flow.id, flow.name, envA, opts.credsA),
      buildSnapshot(flow.id, flow.name, envB, opts.credsB),
    ]);

    const diffs     = calcDiffs(envA, envB, snapA, snapB);
    const driftCount = diffs.filter((d) => d.verdict !== 'MATCH').length;
    const label      = mirrorDriftLabel(diffs);

    const icon = label === 'IN SYNC' ? '✅' : label === 'DRIFT' ? '⚠️ ' : '❌';
    console.log(`${icon}  ${label} (${driftCount} diff(s))`);

    results.push({
      iflowId:   flow.id,
      iflowName: flow.name,
      envA:      snapA,
      envB:      snapB,
      diffs,
      driftCount,
    });
  }

  const totalDrifts = results.reduce((s, r) => s + r.driftCount, 0);
  return { runId, triggeredAt, envA, envB, iflowCount: iflows.length, totalDrifts, results };
}
