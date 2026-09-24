// mcp/toolRouter.ts — Routes CallTool requests to the appropriate handler
// This file knows about MCP request shape but delegates ALL logic to handlers/ or core/

import { loadConfig, loadConfigForEnv } from '../config';
import { CpiClient } from '../cpiClient';
import { session } from '../handlers/shared/sessionManager';
import { END_MENU, STARTUP_MENU } from '../handlers/shared/menus';
import { envLabel } from '../handlers/guardian/guardianFormatter';
import {
  handleSelectModeGuardian,
  handleGuardianSetEnvironment,
  handleGuardianSetCredentials,
  handleGuardianDiscoverByDate,
  handleGuardianSetIflowList,
  handleGuardianRun,
  executeGuardianSpotCheck,
  mapEnvToCpiEnv,
} from '../handlers/guardian/guardianHandler';
import {
  handleSelectModeMirror,
  handleMirrorSetSourceEnv,
  handleMirrorSetTargetEnv,
  handleMirrorSetCredentials,
  handleMirrorDiscoverByDate,
  handleMirrorSetIflowList,
  handleMirrorRun,
  handleCompareIflow,
} from '../handlers/mirror/mirrorHandler';
import { handleBatchCompare } from '../handlers/mirror/batchHandler';
import { extractBpmnXml, parseAdapters, summariseAdapters } from '../utils/adapterParser';
import { Environment } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

type ToolResult = { content: Array<{ type: string; text: string }> };

export async function routeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  const cfg = loadConfig();

  // ── Mode selection ───────────────────────────────────────────────────────────
  if (toolName === 'select_mode') {
    const { choice } = args as { choice?: string };
    if (!choice) return { content: [{ type: 'text', text: STARTUP_MENU }] };
    const c = choice.toUpperCase();
    if (c === '1' || c === 'GUARDIAN') return handleSelectModeGuardian() as ToolResult;
    if (c === '2' || c === 'MIRROR')   return handleSelectModeMirror() as ToolResult;
    return { content: [{ type: 'text', text: `⚠️ Invalid choice. ${STARTUP_MENU}` }] };
  }

  // ── GUARDIAN wizard ──────────────────────────────────────────────────────────
  if (toolName === 'guardian_set_environment')
    return handleGuardianSetEnvironment(args as { environment: 'DEV' | 'TEST' | 'PROD' }) as ToolResult;

  if (toolName === 'guardian_set_credentials')
    return handleGuardianSetCredentials() as ToolResult;

  if (toolName === 'guardian_discover_by_date')
    return handleGuardianDiscoverByDate(args as { date: string });

  if (toolName === 'guardian_set_iflow_list')
    return handleGuardianSetIflowList(args as { iflowList: string });

  if (toolName === 'guardian_run')
    return handleGuardianRun();

  // ── MIRROR wizard ────────────────────────────────────────────────────────────
  if (toolName === 'mirror_set_source_env')
    return handleMirrorSetSourceEnv(args as { environment: 'DEV' | 'TEST' | 'PROD' }) as ToolResult;

  if (toolName === 'mirror_set_target_env')
    return handleMirrorSetTargetEnv(args as { environment: 'DEV' | 'TEST' | 'PROD' }) as ToolResult;

  if (toolName === 'mirror_set_source_credentials' || toolName === 'mirror_set_target_credentials')
    return handleMirrorSetCredentials() as ToolResult;

  if (toolName === 'mirror_discover_by_date')
    return handleMirrorDiscoverByDate(args as { date: string });

  if (toolName === 'mirror_set_iflow_list')
    return handleMirrorSetIflowList(args as { iflowList: string });

  if (toolName === 'mirror_run')
    return handleMirrorRun();

  // ── High-level agent tools ───────────────────────────────────────────────────
  if (toolName === 'batch_compare')
    return handleBatchCompare(args as { sourceEnv?: 'DEV' | 'TEST' | 'PROD'; targetEnv?: 'DEV' | 'TEST' | 'PROD' });

  if (toolName === 'compare_iflow')
    return handleCompareIflow(args as { iflowName: string; sourceEnv?: 'DEV' | 'TEST' | 'PROD'; targetEnv?: 'DEV' | 'TEST' | 'PROD' });

  // ── spotcheck_iflow ──────────────────────────────────────────────────────────
  if (toolName === 'spotcheck_iflow') {
    const { iflowName, environment: envArg } = args as { iflowName: string; environment?: 'DEV' | 'TEST' | 'PROD' };
    const env: Environment = (envArg ?? 'DEV') as Environment;
    const envCfg = loadConfigForEnv(env);
    const client = new CpiClient(envCfg);

    let resolvedId = '', resolvedName = iflowName;
    try {
      const hits  = await client.searchRuntimeArtifacts({ nameFilter: iflowName });
      const flows = hits.filter((a) => a.Type === 'INTEGRATION_FLOW' || a.Type === 'IntegrationFlow' || !a.Type);
      if (flows.length === 0) return { content: [{ type: 'text', text: `❌ No iFlow found matching \`${iflowName}\` in ${env}.` }] };
      const chosen = flows.find((f) => f.Name.toLowerCase() === iflowName.toLowerCase()) ?? flows[0];
      resolvedId   = chosen.Id;
      resolvedName = chosen.Name;
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ Search failed: ${(err as Error).message}` }] };
    }

    const { report } = await executeGuardianSpotCheck(resolvedId, 'default', env);
    const lines: string[] = [
      `## 🛡️ ${resolvedName} — GUARDIAN Spot-Check [${env}]`,
      `**Run ID:** ${report.runId} | **Checked:** ${report.triggeredAt.slice(0,19).replace('T',' ')} | **Overall:** ${report.overallStatus === 'PASS' ? '🟢 PASS' : report.overallStatus === 'WARN' ? '🟡 WARN' : '🔴 FAIL'}`,
      '',
      '| # | Check | Status | Detail | Auto-Fix? | Escalation |',
      '|---|-------|--------|--------|-----------|------------|',
    ];
    report.checks.forEach((chk, i) => {
      const st  = chk.status;
      const dot = st === 'PASS' ? '✅ PASS' : st === 'WARN' ? '⚠️ WARN' : st === 'FAIL' ? '❌ FAIL' : '⏭️ SKIP';
      const fix = chk.autoFix ? `✔ ${chk.autoFixDetail?.slice(0, 30) ?? 'Auto-fix'}` : '✘ Manual';
      lines.push(`| ${i + 1} | ${chk.category} | ${dot} | ${chk.detail} | ${fix} | ${chk.escalation ?? '—'} |`);
    });
    lines.push('', `**✅ ${report.summary.pass} PASS  ⚠️ ${report.summary.warn} WARN  ❌ ${report.summary.fail} FAIL  ⏭️ ${report.summary.skip} SKIP**`, '');
    const fails = report.checks.filter((c) => c.status === 'FAIL');
    const warns = report.checks.filter((c) => c.status === 'WARN');
    if (fails.length > 0) { lines.push('🚨 **Block go-live:**'); fails.forEach((f) => lines.push(`- **${f.category}** → ${f.escalation ?? f.detail}`)); }
    else if (warns.length > 0) { lines.push('⚠️ **Review before go-live:**'); warns.forEach((w) => lines.push(`- **${w.category}** → ${w.detail}`)); }
    else lines.push(`🟢 **${env} deployment is healthy — ${resolvedName} is go-live ready.**`);
    lines.push(END_MENU);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  // ── Legacy: run_spot_check ────────────────────────────────────────────────────
  if (toolName === 'run_spot_check') {
    const { iflowName, iflowId, packageId: pkgArg, environment: envArg } =
      args as { iflowName?: string; iflowId?: string; packageId?: string; environment?: 'TEST' | 'PRE-PROD' | 'PROD' };
    const environment = envArg ?? cfg.environment;
    const packageId   = pkgArg || session.getLastContext().packageId || 'default';
    let resolvedId    = iflowId || '';
    if (!resolvedId && iflowName) {
      const client = new CpiClient(cfg);
      try {
        const candidates = await client.searchRuntimeArtifacts({ nameFilter: iflowName });
        const flows = candidates.filter((a) => a.Type === 'INTEGRATION_FLOW' || a.Type === 'IntegrationFlow' || !a.Type);
        const exact = flows.find((a) => a.Name.toLowerCase() === iflowName.toLowerCase());
        resolvedId = (exact ?? flows[0])?.Id ?? '';
      } catch {}
    }
    if (!resolvedId) resolvedId = session.getLastContext().iflowId;
    if (!resolvedId) return { content: [{ type: 'text', text: '❌ No iFlow name or ID provided.' }] };
    const { reportText } = await executeGuardianSpotCheck(resolvedId, packageId, environment);
    return { content: [{ type: 'text', text: reportText + '\n' + END_MENU }] };
  }

  // ── get_todays_deployments ────────────────────────────────────────────────────
  if (toolName === 'get_todays_deployments') {
    const client = new CpiClient(cfg);
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    let all;
    try { all = await client.searchRuntimeArtifacts({ deployedAfter: today }); }
    catch (err) { return { content: [{ type: 'text', text: `❌ ${(err as Error).message}` }] }; }
    const iflows = all.filter((a) => a.Type === 'INTEGRATION_FLOW' || a.Type === 'IntegrationFlow');
    if (iflows.length === 0) return { content: [{ type: 'text', text: `📭 No iFlows deployed today (${today.toISOString().slice(0, 10)}).` }] };
    session.pendingCandidates = iflows.map((a) => ({ id: a.Id, name: a.Name, status: a.Status, deployedOn: a.DeployedOn, version: a.Version }));
    const lines = [`## 🔍 Today's Deployments — ${today.toISOString().slice(0, 10)}`, '', '| # | iFlow Name | Artifact ID | Status | Deployed At | Version |', '|---|------------|-------------|--------|-------------|---------|'];
    iflows.forEach((a, i) => {
      const icon = a.Status === 'STARTED' ? '🟢' : a.Status === 'ERROR' ? '🔴' : '🟡';
      const dt   = a.DeployedOn ? a.DeployedOn.replace('T', ' ').slice(0, 19) : '—';
      lines.push(`| ${i + 1} | ${a.Name} | \`${a.Id}\` | ${icon} ${a.Status} | ${dt} | ${a.Version} |`);
    });
    lines.push('', '---', `Run spot-check on all ${iflows.length} iFlow(s)? Reply **yes** to proceed or **no** to cancel.`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  // ── run_todays_spot_checks ────────────────────────────────────────────────────
  if (toolName === 'run_todays_spot_checks') {
    const candidates = session.pendingCandidates;
    if (candidates.length === 0) return { content: [{ type: 'text', text: '❌ No pending candidates. Call `get_todays_deployments` first.' }] };
    const environment = (args as { environment?: 'TEST' | 'PRE-PROD' | 'PROD' }).environment ?? cfg.environment;
    const allLines: string[] = [];
    for (const c of candidates) {
      try {
        const { reportText } = await executeGuardianSpotCheck(c.id, 'default', environment);
        allLines.push(reportText); allLines.push('');
      } catch (err) {
        allLines.push(`❌ ${c.name}: ${(err as Error).message}`); allLines.push('');
      }
    }
    allLines.push(END_MENU);
    return { content: [{ type: 'text', text: allLines.join('\n') }] };
  }

  // ── Session utilities ─────────────────────────────────────────────────────────
  if (toolName === 'get_spot_check_status') {
    const iflowId = (args as { iflowId?: string }).iflowId || session.getLastContext().iflowId;
    if (!iflowId) return { content: [{ type: 'text', text: '❌ No iFlowId provided.' }] };
    const client   = new CpiClient(cfg);
    const artifact = await client.getRuntimeArtifact(iflowId);
    if (!artifact) return { content: [{ type: 'text', text: `iFlow \`${iflowId}\` is not deployed.` }] };
    const lastRun = session.getRuns().filter((r) => r.iflowId === iflowId).slice(-1)[0];
    const lines = [`**${artifact.Name}** — Status: **${artifact.Status}**`, `Version: ${artifact.Version}  |  Deployed: ${artifact.DeployedOn}`];
    if (lastRun) lines.push(`_Last GUARDIAN check: ${lastRun.triggeredAt.slice(0, 19).replace('T', ' ')} — ${lastRun.overallStatus}_`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  if (toolName === 'open_reports') {
    const which = (args as { file?: 'excel' | 'pptx' | 'both' }).file ?? 'both';
    const openFile = (fp: string): string => {
      if (!fs.existsSync(fp)) return `❌ Not found: \`${fp}\``;
      const cmd = process.platform === 'win32' ? `start "" "${fp}"` : process.platform === 'darwin' ? `open "${fp}"` : `xdg-open "${fp}"`;
      exec(cmd);
      return `✅ Opened: \`${fp}\``;
    };
    const lines: string[] = ['## 📂 Report Files'];
    const excelPath = path.join(cfg.reportExcelDir, 'Scout_Report.xlsx');
    const pptxPath  = path.join(cfg.reportPptxDir,  'Scout_Report.pptx');
    if (which !== 'pptx')  lines.push(`📊 Excel — ${openFile(excelPath)}`);
    if (which !== 'excel') lines.push(`📋 PPTX  — ${openFile(pptxPath)}`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  if (toolName === 'get_session_context')
    return { content: [{ type: 'text', text: session.summarise() }] };

  if (toolName === 'clear_session') {
    const count = session.getRuns().length;
    session.clear();
    return { content: [{ type: 'text', text: `Session cleared. Removed ${count} run(s).` }] };
  }

  // ── Direct CPI query tools ────────────────────────────────────────────────────
  if (toolName === 'list_packages') {
    const client = new CpiClient(cfg);
    const pkgs = await client.getPackages().catch(() => []);
    const lines = pkgs.map((p) => `**${p.Name}** (\`${p.Id}\`) v${p.Version || '—'}${p.ShortText ? ' — ' + p.ShortText.slice(0, 80) : ''}`);
    return { content: [{ type: 'text', text: `## Integration Packages (${pkgs.length})\n\n` + lines.join('\n') }] };
  }

  if (toolName === 'list_artifacts') {
    const { packageId } = args as { packageId: string };
    const client = new CpiClient(cfg);
    const arts = await client.getPackageArtifacts(packageId).catch(() => []);
    const lines = arts.map((a) => `**${a.Name}** (\`${a.Id}\`) [${a.Type}] v${a.Version || '—'}`);
    return { content: [{ type: 'text', text: `## Artifacts in \`${packageId}\` (${arts.length})\n\n` + lines.join('\n') }] };
  }

  if (toolName === 'get_iflow_content') {
    const { artifactId } = args as { artifactId: string };
    const client = new CpiClient(cfg);
    const [artifact, configurations, zipBuf] = await Promise.all([
      client.getArtifact(artifactId).catch(() => null),
      client.getIflowConfigurations(artifactId).catch(() => ({})),
      client.getIflowContent(artifactId).catch(() => null),
    ]);
    let adapterSummary = 'Could not download iFlow ZIP.';
    let bpmnSnippet = '';
    if (zipBuf) {
      const xml = extractBpmnXml(zipBuf);
      if (xml) {
        const adapters = parseAdapters(xml);
        bpmnSnippet = xml.slice(0, 500) + (xml.length > 500 ? '…' : '');
        if (adapters.length > 0) {
          const rows = adapters.map((a) => {
            const extraSummary = Object.entries(a.extraProps).map(([k, v]) => `${k}=${v}`).join('; ');
            return `| ${a.direction} | ${a.adapterType} | ${a.channelName} | ${a.host || '—'} | ${a.address || '—'} | ${a.credentialName || '—'} | ${a.protocol || '—'} | ${extraSummary || '—'} |`;
          });
          adapterSummary = `| Direction | Type | Channel | Host | Address / Path | Credential | Protocol | Extra |\n|-----------|------|---------|------|----------------|------------|----------|-------|\n${rows.join('\n')}`;
        } else {
          adapterSummary = `No adapter channels detected.\n\nBPMN2 summary: ${summariseAdapters(adapters)}`;
        }
      }
    }
    const configLines = Object.entries(configurations).map(([k, v]) => `| \`${k}\` | \`${v}\` |`);
    const lines = [
      `## iFlow Content — \`${artifactId}\``, '',
      artifact ? `**Name:** ${artifact.Name}  |  **Package:** ${artifact.PackageId}  |  **Version:** ${artifact.Version}` : '',
      '', '### Adapter Channels', adapterSummary, '',
      '### Externalized Parameters',
      configLines.length > 0 ? `| Parameter Key | Value |\n|---------------|-------|\n${configLines.join('\n')}` : '_(none)_',
      '',
      bpmnSnippet ? `### BPMN2 XML (first 500 chars)\n\`\`\`xml\n${bpmnSnippet}\n\`\`\`` : '',
    ];
    return { content: [{ type: 'text', text: lines.filter(Boolean).join('\n') }] };
  }

  if (toolName === 'get_runtime_artifacts') {
    const client = new CpiClient(cfg);
    const arts = await client.getRuntimeArtifacts().catch(() => []);
    const lines = arts.map((a) => {
      const icon = a.Status === 'STARTED' ? '🟢' : a.Status === 'ERROR' ? '🔴' : '🟡';
      return `| ${icon} | ${a.Name} | \`${a.Id}\` | ${a.Type} | ${a.Version} | ${a.DeployedOn?.slice(0, 19) ?? '—'} |`;
    });
    return { content: [{ type: 'text', text: `## Runtime Artifacts (${arts.length})\n\n| Status | Name | ID | Type | Version | Deployed |\n|--------|------|----|------|---------|----------|\n${lines.join('\n')}` }] };
  }

  if (toolName === 'get_artifact') {
    const { artifactId } = args as { artifactId: string; artifactType: string };
    const client = new CpiClient(cfg);
    const art = await client.getArtifact(artifactId).catch(() => null);
    if (!art) return { content: [{ type: 'text', text: `❌ Artifact \`${artifactId}\` not found.` }] };
    return { content: [{ type: 'text', text: `**${art.Name}** (\`${art.Id}\`)\nPackage: ${art.PackageId} | Version: ${art.Version}${art.Description ? '\nDescription: ' + art.Description : ''}` }] };
  }

  if (toolName === 'get_failed_messages') {
    const { artifactName, fromDate, top } = args as { artifactName?: string; fromDate?: string; top?: number };
    const client = new CpiClient(cfg);
    const msgs = await client.getFailedMessages({ artifactName, fromDate, top }).catch(() => []);
    if (msgs.length === 0) return { content: [{ type: 'text', text: '✅ No failed messages found.' }] };
    const rows = msgs.map((m) => `| \`${m.MessageGuid}\` | ${m.IntegrationArtifact?.Name ?? '—'} | ${m.LogStart?.slice(0, 19) ?? '—'} | ${m.ErrorInfos?.[0]?.ErrorMessage?.slice(0, 60) ?? '—'} |`);
    return { content: [{ type: 'text', text: `## Failed Messages (${msgs.length})\n\n| Message ID | iFlow | Started | Error |\n|------------|-------|---------|-------|\n${rows.join('\n')}` }] };
  }

  if (toolName === 'get_message_details') {
    const { messageId } = args as { messageId: string };
    const client = new CpiClient(cfg);
    const msg = await client.getMessageDetails(messageId).catch(() => null);
    if (!msg) return { content: [{ type: 'text', text: `❌ Message \`${messageId}\` not found.` }] };
    return { content: [{ type: 'text', text: `## Message \`${msg.MessageGuid}\`\n**Status:** ${msg.Status}\n**iFlow:** ${msg.IntegrationArtifact?.Name ?? '—'}\n**Started:** ${msg.LogStart}\n**Ended:** ${msg.LogEnd ?? '—'}\n**Error:** ${msg.ErrorInfos?.[0]?.ErrorMessage ?? 'None'}` }] };
  }

  if (toolName === 'get_system_status') {
    const client = new CpiClient(cfg);
    const s = await client.getSystemStatus().catch(() => ({ total: 0, started: 0, error: 0, stopped: 0 }));
    return { content: [{ type: 'text', text: `## CPI System Status\n🟢 Started: **${s.started}**  🔴 Error: **${s.error}**  🟡 Stopped: **${s.stopped}**  📦 Total: **${s.total}**` }] };
  }

  if (toolName === 'list_service_endpoints') {
    const { protocol } = args as { protocol?: string };
    const client = new CpiClient(cfg);
    const eps = await client.getServiceEndpoints(protocol).catch(() => []);
    if (eps.length === 0) return { content: [{ type: 'text', text: 'No service endpoints found.' }] };
    const rows = eps.map((e) => `| ${e.Name} | \`${e.Id}\` | ${e.Protocol} | ${e.Url} |`);
    return { content: [{ type: 'text', text: `## Service Endpoints (${eps.length})\n\n| Name | ID | Protocol | URL |\n|------|----|----------|-----|\n${rows.join('\n')}` }] };
  }

  if (toolName === 'list_jms_queues') {
    const client = new CpiClient(cfg);
    const queues = await client.getJmsQueues().catch(() => []);
    if (queues.length === 0) return { content: [{ type: 'text', text: 'No JMS queues found.' }] };
    const rows = queues.map((q) => `| ${q.Name} | ${q.Size} | ${q.MaxSize} | ${q.ConsumerCount ?? '—'} |`);
    return { content: [{ type: 'text', text: `## JMS Queues (${queues.length})\n\n| Queue | Size | Max | Consumers |\n|-------|------|-----|----------|\n${rows.join('\n')}` }] };
  }

  if (toolName === 'list_data_store_entries') {
    const { dataStoreName, integrationFlow, top } = args as { dataStoreName?: string; integrationFlow?: string; top?: number };
    const client = new CpiClient(cfg);
    const entries = await client.getDataStoreEntries({ dataStoreName, integrationFlow, top }).catch(() => []);
    if (entries.length === 0) return { content: [{ type: 'text', text: 'No data store entries found.' }] };
    const rows = entries.map((e) => `| \`${e.Id}\` | ${e.DataStoreName} | ${e.IntegrationFlow ?? '—'} | ${e.Type} |`);
    return { content: [{ type: 'text', text: `## Data Store Entries (${entries.length})\n\n| ID | Store | iFlow | Type |\n|----|-------|-------|------|\n${rows.join('\n')}` }] };
  }

  if (toolName === 'list_variables') {
    const { integrationFlow } = args as { integrationFlow?: string };
    const client = new CpiClient(cfg);
    const vars = await client.getVariables(integrationFlow).catch(() => []);
    if (vars.length === 0) return { content: [{ type: 'text', text: 'No variables found.' }] };
    const rows = vars.map((v) => `| \`${v.VariableName}\` | ${v.IntegrationFlow ?? '—'} | ${v.UpdatedAt?.slice(0, 19) ?? '—'} |`);
    return { content: [{ type: 'text', text: `## Variables (${vars.length})\n\n| Name | iFlow | Updated |\n|------|-------|--------|\n${rows.join('\n')}` }] };
  }

  if (toolName === 'list_keystores') {
    const client = new CpiClient(cfg);
    const entries = await client.getKeystoreEntries().catch(() => []);
    if (entries.length === 0) return { content: [{ type: 'text', text: 'No keystore entries found.' }] };
    const rows = entries.map((e) => `| \`${e.Alias}\` | ${e.Type} | ${e.ValidNotAfter?.slice(0, 10) ?? '—'} |`);
    return { content: [{ type: 'text', text: `## Keystore Entries (${entries.length})\n\n| Alias | Type | Expires |\n|-------|------|--------|\n${rows.join('\n')}` }] };
  }

  if (toolName === 'list_credentials') {
    const client = new CpiClient(cfg);
    const creds = await client.getCredentials().catch(() => []);
    if (creds.length === 0) return { content: [{ type: 'text', text: 'No credentials found.' }] };
    const rows = creds.map((c) => `| \`${c.Name}\` | ${c.Kind} |`);
    return { content: [{ type: 'text', text: `## User Credentials (${creds.length})\n\n| Alias | Kind |\n|-------|------|\n${rows.join('\n')}` }] };
  }

  if (toolName === 'list_oauth_credentials') {
    const client = new CpiClient(cfg);
    const oauths = await client.getOAuthCredentials().catch(() => []);
    if (oauths.length === 0) return { content: [{ type: 'text', text: 'No OAuth credentials found.' }] };
    const rows = oauths.map((o) => `| \`${o.Name}\` | \`${o.ClientId.slice(0, 20)}…\` | ${o.TokenServiceUrl} |`);
    return { content: [{ type: 'text', text: `## OAuth2 Credentials (${oauths.length})\n\n| Name | Client ID | Token URL |\n|------|-----------|----------|\n${rows.join('\n')}` }] };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }] };
}
