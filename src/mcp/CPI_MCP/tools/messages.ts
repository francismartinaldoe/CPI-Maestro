// src/mcp/CPI_MCP/tools/messages.ts — Message processing log tools
import type { CpiClient } from '../cpiClient.js';
import type { ToolResult } from '../types.js';

export async function handleGetFailedMessages(client: CpiClient, args: Record<string, unknown>): Promise<ToolResult> {
  const msgs = await client.getFailedMessages({
    artifactName: args.artifactName as string | undefined,
    fromDate:     args.fromDate     as string | undefined,
    top:          args.top          as number | undefined,
  });
  if (!msgs.length) return text('✅ No failed messages found.');
  const rows = msgs.map(m =>
    `| \`${m.MessageGuid}\` | ${m.IntegrationArtifact?.Name ?? m.IntegrationFlowName ?? '—'} | ${m.LogStart?.slice(0, 19) ?? '—'} | ${m.ErrorInfos?.[0]?.ErrorMessage?.slice(0, 60) ?? m.ErrorInformation?.slice(0, 60) ?? '—'} |`
  );
  return text(`## Failed Messages (${msgs.length})\n\n| Message ID | iFlow | Started | Error |\n|------------|-------|---------|-------|\n${rows.join('\n')}`);
}

export async function handleGetMessageDetails(client: CpiClient, args: Record<string, unknown>): Promise<ToolResult> {
  const messageId = String(args.messageId ?? '');
  if (!messageId) return text('❌ messageId is required.');
  const msg = await client.getMessageDetails(messageId);
  if (!msg) return text(`❌ Message \`${messageId}\` not found.`);
  return text(
    `## Message \`${msg.MessageGuid}\`\n` +
    `**Status:** ${msg.Status}\n` +
    `**iFlow:** ${msg.IntegrationArtifact?.Name ?? msg.IntegrationFlowName ?? '—'}\n` +
    `**Started:** ${msg.LogStart ?? '—'}\n` +
    `**Ended:** ${msg.LogEnd ?? '—'}\n` +
    `**Error:** ${msg.ErrorInfos?.[0]?.ErrorMessage ?? msg.ErrorInformation ?? 'None'}`
  );
}

function text(t: string): ToolResult { return { content: [{ type: 'text', text: t }] }; }
