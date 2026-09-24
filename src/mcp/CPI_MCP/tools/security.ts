// src/mcp/CPI_MCP/tools/security.ts — Keystores, credentials, OAuth
import type { CpiClient } from '../cpiClient.js';
import type { ToolResult } from '../types.js';

export async function handleListKeystores(client: CpiClient): Promise<ToolResult> {
  const entries = await client.getKeystoreEntries().catch(() => []);
  if (!entries.length) return text('No keystore entries found.');
  const rows = entries.map(e => `| \`${e.Alias}\` | ${e.Type} | ${e.ValidNotAfter?.slice(0, 10) ?? '—'} |`);
  return text(`## Keystore Entries (${entries.length})\n\n| Alias | Type | Expires |\n|-------|------|--------|\n${rows.join('\n')}`);
}

export async function handleListCredentials(client: CpiClient): Promise<ToolResult> {
  const creds = await client.getCredentials().catch(() => []);
  if (!creds.length) return text('No user credentials found.');
  const rows = creds.map(c => `| \`${c.Name}\` | ${c.Kind} |`);
  return text(`## User Credentials (${creds.length})\n\n| Alias | Kind |\n|-------|------|\n${rows.join('\n')}`);
}

export async function handleListOAuthCredentials(client: CpiClient): Promise<ToolResult> {
  const oauths = await client.getOAuthCredentials().catch(() => []);
  if (!oauths.length) return text('No OAuth2 credentials found.');
  const rows = oauths.map(o => `| \`${o.Name}\` | \`${o.ClientId.slice(0, 30)}…\` | ${o.TokenServiceUrl} |`);
  return text(`## OAuth2 Credentials (${oauths.length})\n\n| Name | Client ID | Token URL |\n|------|-----------|----------|\n${rows.join('\n')}`);
}

function text(t: string): ToolResult { return { content: [{ type: 'text', text: t }] }; }
