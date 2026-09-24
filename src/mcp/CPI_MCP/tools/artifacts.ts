// src/mcp/CPI_MCP/tools/artifacts.ts — Design-time & runtime artifact tools
import AdmZip from 'adm-zip';
import type { CpiClient } from '../cpiClient.js';
import type { ToolResult } from '../types.js';

export async function handleListPackages(client: CpiClient): Promise<ToolResult> {
  const pkgs = await client.getPackages().catch(() => []);
  if (!pkgs.length) return text('No integration packages found.');
  const lines = pkgs.map(p => `**${p.Name}** (\`${p.Id}\`) v${p.Version || '—'}${p.ShortText ? ' — ' + p.ShortText.slice(0, 80) : ''}`);
  return text(`## Integration Packages (${pkgs.length})\n\n${lines.join('\n')}`);
}

export async function handleListArtifacts(client: CpiClient, args: Record<string, unknown>): Promise<ToolResult> {
  const packageId = String(args.packageId ?? '');
  if (!packageId) return text('❌ packageId is required.');
  const arts = await client.getPackageArtifacts(packageId).catch(() => []);
  if (!arts.length) return text(`No artifacts found in package \`${packageId}\`.`);
  const lines = arts.map(a => `**${a.Name}** (\`${a.Id}\`) v${a.Version || '—'}`);
  return text(`## Artifacts in \`${packageId}\` (${arts.length})\n\n${lines.join('\n')}`);
}

export async function handleGetRuntimeArtifacts(client: CpiClient): Promise<ToolResult> {
  const arts = await client.getRuntimeArtifacts().catch(() => []);
  if (!arts.length) return text('No runtime artifacts found.');
  const rows = arts.map(a => {
    const icon = a.Status === 'STARTED' ? '🟢' : a.Status === 'ERROR' ? '🔴' : '🟡';
    return `| ${icon} | ${a.Name} | \`${a.Id}\` | ${a.Version} | ${a.DeployedOn?.slice(0, 19) ?? '—'} |`;
  });
  return text(`## Runtime Artifacts (${arts.length})\n\n| Status | Name | ID | Version | Deployed |\n|--------|------|----|---------|----------|\n${rows.join('\n')}`);
}

export async function handleGetSystemStatus(client: CpiClient): Promise<ToolResult> {
  const s = await client.getSystemStatus().catch(() => ({ total: 0, started: 0, error: 0, stopped: 0 }));
  return text(`## CPI System Status\n🟢 Started: **${s.started}**  🔴 Error: **${s.error}**  🟡 Stopped: **${s.stopped}**  📦 Total: **${s.total}**`);
}

export async function handleGetIflowContent(client: CpiClient, args: Record<string, unknown>): Promise<ToolResult> {
  const artifactId = String(args.artifactId ?? '');
  if (!artifactId) return text('❌ artifactId is required.');

  const [artifact, configurations, zipBuf] = await Promise.all([
    client.getArtifact(artifactId).catch(() => null),
    client.getIflowConfigurations(artifactId).catch(() => ({})),
    client.getIflowContent(artifactId).catch(() => null),
  ]);

  let filesSummary = 'Could not download iFlow ZIP.';
  if (zipBuf) {
    try {
      const zip = new AdmZip(zipBuf);
      const entries = zip.getEntries().filter(e => !e.isDirectory);
      const TEXT_EXTS = /\.(groovy|xml|bpmn2|json|properties|xslt|xsl|txt)$/i;
      const rows = entries.map(e => `| \`${e.entryName}\` | ${e.header.size} bytes | ${TEXT_EXTS.test(e.name) ? 'text' : 'binary'} |`);
      filesSummary = `| Path | Size | Type |\n|------|------|------|\n${rows.join('\n')}`;
    } catch { filesSummary = 'Failed to unzip content.'; }
  }

  const configLines = Object.entries(configurations).map(([k, v]) => `| \`${k}\` | \`${v}\` |`);
  const lines = [
    `## iFlow Content — \`${artifactId}\``,
    artifact ? `**Name:** ${artifact.Name}  |  **Package:** ${artifact.PackageId}  |  **Version:** ${artifact.Version}` : '',
    '',
    '### Files in ZIP',
    filesSummary,
    '',
    '### Externalized Parameters',
    configLines.length > 0
      ? `| Parameter Key | Value |\n|---------------|-------|\n${configLines.join('\n')}`
      : '_(none)_',
  ];
  return text(lines.filter(l => l !== null).join('\n'));
}

export async function handleGetTodaysDeployments(client: CpiClient): Promise<ToolResult> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const all = await client.searchRuntimeArtifacts({ deployedAfter: today }).catch(() => []);
  const iflows = all.filter(a => a.Type === 'INTEGRATION_FLOW' || a.Type === 'IntegrationFlow');
  if (!iflows.length) return text(`📭 No iFlows deployed today (${today.toISOString().slice(0, 10)}).`);
  const rows = iflows.map((a, i) => {
    const icon = a.Status === 'STARTED' ? '🟢' : a.Status === 'ERROR' ? '🔴' : '🟡';
    const dt   = a.DeployedOn ? a.DeployedOn.replace('T', ' ').slice(0, 19) : '—';
    return `| ${i + 1} | ${a.Name} | \`${a.Id}\` | ${icon} ${a.Status} | ${dt} | ${a.Version} |`;
  });
  return text(`## Today's Deployments — ${today.toISOString().slice(0, 10)}\n\n| # | iFlow Name | ID | Status | Deployed At | Version |\n|---|------------|----|--------|-------------|--------|\n${rows.join('\n')}`);
}

function text(t: string): ToolResult { return { content: [{ type: 'text', text: t }] }; }
