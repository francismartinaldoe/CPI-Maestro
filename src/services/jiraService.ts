// src/services/jiraService.ts — Shared JIRA access layer
//
// Wraps McpRegistry.get('JIRA_MCP') so all agents use one consistent
// call pattern instead of duplicating availability checks inline.

import { McpRegistry } from '../mcp/index.js';

const UNAVAILABLE_MSG =
  '❌ JIRA_MCP is not available. Set JIRA_MCP_PATH, JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env';

export const JIRA_TOOL_PREFIXES = [
  'get_jira_',
  'search_jira_',
  'create_jira_',
  'add_jira_',
  'transition_jira_',
] as const;

export function isJiraTool(name: string): boolean {
  return JIRA_TOOL_PREFIXES.some(prefix => name.startsWith(prefix));
}

export async function callJiraTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (!McpRegistry.isAvailable('JIRA_MCP')) return UNAVAILABLE_MSG;
  return McpRegistry.get('JIRA_MCP').callTool(name, args);
}
