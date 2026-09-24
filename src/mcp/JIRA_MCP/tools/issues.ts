// src/mcp/JIRA_MCP/tools/issues.ts — Issue read/write tools

import type { JiraClient } from '../jiraClient.js';
import type { ToolResult } from '../types.js';

export async function handleGetIssue(client: JiraClient, args: Record<string, unknown>): Promise<ToolResult> {
  const key = String(args.issueKey ?? '');
  if (!key) return text('❌ issueKey is required.');
  const issue = await client.getIssue(key);
  if (!issue) return text(`❌ Issue \`${key}\` not found or not accessible.`);

  const lines = [
    `## ${issue.key}: ${issue.summary}`,
    `**Type:** ${issue.issueType}  |  **Status:** ${issue.status}  |  **Priority:** ${issue.priority}`,
    `**Project:** ${issue.project}  |  **Assignee:** ${issue.assignee ?? 'Unassigned'}  |  **Reporter:** ${issue.reporter ?? '—'}`,
    `**Created:** ${issue.created.slice(0, 10)}  |  **Updated:** ${issue.updated.slice(0, 10)}`,
    issue.labels?.length      ? `**Labels:** ${issue.labels.join(', ')}`           : '',
    issue.components?.length  ? `**Components:** ${issue.components.join(', ')}`   : '',
    issue.fixVersions?.length ? `**Fix Versions:** ${issue.fixVersions.join(', ')}` : '',
    '',
    issue.description ? `### Description\n${issue.description.slice(0, 500)}` : '',
    '',
    `🔗 ${issue.url}`,
  ];
  return text(lines.filter(l => l !== null).join('\n'));
}

export async function handleSearchIssues(client: JiraClient, args: Record<string, unknown>): Promise<ToolResult> {
  const jql        = String(args.jql ?? '');
  const maxResults = Number(args.maxResults ?? 20);
  if (!jql) return text('❌ jql is required. Example: project = MYPROJ AND status = "In Progress"');

  const result = await client.searchIssues(jql, maxResults);
  if (!result.issues.length) return text(`No issues found for JQL: \`${jql}\``);

  const rows = result.issues.map(i =>
    `| [${i.key}](${i.url}) | ${i.summary.slice(0, 60)} | ${i.status} | ${i.priority} | ${i.assignee ?? '—'} |`
  );
  return text(
    `## JIRA Search Results (${result.issues.length} of ${result.total})\n\nJQL: \`${jql}\`\n\n` +
    `| Key | Summary | Status | Priority | Assignee |\n|-----|---------|--------|----------|----------|\n` +
    rows.join('\n')
  );
}

export async function handleCreateIssue(client: JiraClient, args: Record<string, unknown>): Promise<ToolResult> {
  const project     = String(args.project     ?? process.env.JIRA_DEFAULT_PROJECT ?? '');
  const summary     = String(args.summary     ?? '');
  const description = String(args.description ?? '');
  const issueType   = String(args.issueType   ?? 'Bug');
  const priority    = args.priority   as string | undefined;
  const labels      = args.labels     as string[] | undefined;
  const assignee    = args.assignee   as string | undefined;

  if (!project) return text('❌ project is required (or set JIRA_DEFAULT_PROJECT in .env).');
  if (!summary) return text('❌ summary is required.');

  const created = await client.createIssue({ project, summary, description, issueType, priority, labels, assignee });
  if (!created) return text('❌ Failed to create issue. Check JIRA permissions and project key.');
  return text(`✅ Created **${created.key}**: ${summary}\n\n🔗 ${created.url}`);
}

export async function handleAddComment(client: JiraClient, args: Record<string, unknown>): Promise<ToolResult> {
  const key     = String(args.issueKey ?? '');
  const comment = String(args.comment  ?? '');
  if (!key || !comment) return text('❌ issueKey and comment are required.');
  const ok = await client.addComment(key, comment);
  return text(ok ? `✅ Comment added to **${key}**.` : `❌ Failed to add comment to ${key}.`);
}

export async function handleGetComments(client: JiraClient, args: Record<string, unknown>): Promise<ToolResult> {
  const key = String(args.issueKey ?? '');
  if (!key) return text('❌ issueKey is required.');
  const comments = await client.getComments(key, Number(args.maxResults ?? 10));
  if (!comments.length) return text(`No comments on **${key}**.`);
  const lines = comments.map(c => `**${c.author}** (${c.created.slice(0, 10)}):\n> ${c.body.slice(0, 200)}`);
  return text(`## Comments on ${key}\n\n${lines.join('\n\n')}`);
}

export async function handleTransitionIssue(client: JiraClient, args: Record<string, unknown>): Promise<ToolResult> {
  const key        = String(args.issueKey   ?? '');
  const transition = String(args.transition ?? '');
  if (!key || !transition) return text('❌ issueKey and transition are required.');
  const ok = await client.transitionIssue(key, transition);
  return text(ok ? `✅ **${key}** transitioned to "${transition}".` : `❌ Failed to transition ${key}. Use get_jira_transitions to see valid states.`);
}

export async function handleGetTransitions(client: JiraClient, args: Record<string, unknown>): Promise<ToolResult> {
  const key = String(args.issueKey ?? '');
  if (!key) return text('❌ issueKey is required.');
  const transitions = await client.getTransitions(key);
  if (!transitions.length) return text(`No transitions available for **${key}**.`);
  const rows = transitions.map(t => `| ${t.id} | ${t.name} |`);
  return text(`## Available Transitions for ${key}\n\n| ID | Transition Name |\n|----|----------------|\n${rows.join('\n')}`);
}

function text(t: string): ToolResult { return { content: [{ type: 'text', text: t }] }; }
