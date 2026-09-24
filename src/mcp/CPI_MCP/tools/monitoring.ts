// src/mcp/CPI_MCP/tools/monitoring.ts — Endpoints, JMS, data stores, variables
import type { CpiClient } from '../cpiClient.js';
import type { ToolResult } from '../types.js';

export async function handleListServiceEndpoints(client: CpiClient, args: Record<string, unknown>): Promise<ToolResult> {
  const eps = await client.getServiceEndpoints(args.protocol as string | undefined).catch(() => []);
  if (!eps.length) return text('No service endpoints found.');
  const rows = eps.map(e => `| ${e.Name} | \`${e.Id}\` | ${e.Protocol} | ${e.Url} |`);
  return text(`## Service Endpoints (${eps.length})\n\n| Name | ID | Protocol | URL |\n|------|----|----------|-----|\n${rows.join('\n')}`);
}

export async function handleListJmsQueues(client: CpiClient): Promise<ToolResult> {
  const queues = await client.getJmsQueues().catch(() => []);
  if (!queues.length) return text('No JMS queues found.');
  const rows = queues.map(q => `| ${q.Name} | ${q.Size} | ${q.MaxSize} | ${q.ConsumerCount ?? '—'} |`);
  return text(`## JMS Queues (${queues.length})\n\n| Queue | Size | Max | Consumers |\n|-------|------|-----|----------|\n${rows.join('\n')}`);
}

export async function handleListDataStoreEntries(client: CpiClient, args: Record<string, unknown>): Promise<ToolResult> {
  const entries = await client.getDataStoreEntries({
    dataStoreName:   args.dataStoreName   as string | undefined,
    integrationFlow: args.integrationFlow as string | undefined,
    top:             args.top             as number | undefined,
  }).catch(() => []);
  if (!entries.length) return text('No data store entries found.');
  const rows = entries.map(e => `| \`${e.Id}\` | ${e.DataStoreName} | ${e.IntegrationFlow ?? '—'} | ${e.Type} |`);
  return text(`## Data Store Entries (${entries.length})\n\n| ID | Store | iFlow | Type |\n|----|-------|-------|------|\n${rows.join('\n')}`);
}

export async function handleListVariables(client: CpiClient, args: Record<string, unknown>): Promise<ToolResult> {
  const vars = await client.getVariables(args.integrationFlow as string | undefined).catch(() => []);
  if (!vars.length) return text('No variables found.');
  const rows = vars.map(v => `| \`${v.VariableName}\` | ${v.IntegrationFlow ?? '—'} | ${v.UpdatedAt?.slice(0, 19) ?? '—'} |`);
  return text(`## Variables (${vars.length})\n\n| Name | iFlow | Updated |\n|------|-------|--------|\n${rows.join('\n')}`);
}

export async function handlePingEndpoint(client: CpiClient, args: Record<string, unknown>): Promise<ToolResult> {
  const url = String(args.url ?? '');
  if (!url) return text('❌ url is required.');
  const r = await client.pingEndpoint(url);
  if (r.reachable) return text(`✅ **${url}** — reachable (HTTP ${r.statusCode ?? '?'})`);
  return text(`❌ **${url}** — unreachable: ${r.error ?? `HTTP ${r.statusCode}`}`);
}

function text(t: string): ToolResult { return { content: [{ type: 'text', text: t }] }; }
