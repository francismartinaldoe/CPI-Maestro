// src/mcp/JIRA_MCP/toolRouter.ts — Routes MCP tool calls to the correct handler
// Uses TokenManager.getValidToken() so every call gets a fresh, valid token.

import { JiraClient }         from './jiraClient.js';
import { loadJiraCredentials } from './config.js';
import { tokenManager }        from './tokenManager.js';
import type { ToolResult }     from './types.js';
import {
  handleGetIssue,
  handleSearchIssues,
  handleCreateIssue,
  handleAddComment,
  handleGetComments,
  handleTransitionIssue,
  handleGetTransitions,
} from './tools/issues.js';

export async function routeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  // Get a valid token — refreshes transparently if near expiry or expired
  let creds = loadJiraCredentials();
  if (creds.authMode === 'sso' || creds.authMode === 'pat') {
    try {
      const validToken = await tokenManager.getValidToken();
      creds = { ...creds, pat: validToken };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `❌ JIRA authentication expired: ${msg}\n\nPlease click "Connect with SAP SSO" in Maestro Settings to re-authenticate.` }] };
    }
  }

  const client = new JiraClient(creds);

  switch (name) {
    case 'get_jira_issue':        return handleGetIssue(client, args);
    case 'search_jira_issues':    return handleSearchIssues(client, args);
    case 'create_jira_issue':     return handleCreateIssue(client, args);
    case 'add_jira_comment':      return handleAddComment(client, args);
    case 'get_jira_comments':     return handleGetComments(client, args);
    case 'transition_jira_issue': return handleTransitionIssue(client, args);
    case 'get_jira_transitions':  return handleGetTransitions(client, args);
    default:
      return { content: [{ type: 'text', text: `Unknown JIRA tool: ${name}` }] };
  }
}
