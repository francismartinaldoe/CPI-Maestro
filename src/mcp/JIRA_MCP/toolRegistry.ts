// src/mcp/JIRA_MCP/toolRegistry.ts — JIRA tool definitions (schemas only, no logic)

export interface ToolDefinition {
  name:        string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_jira_issue',
    description: 'Get full details of a JIRA issue by its key (e.g. SAP-123). Returns summary, status, priority, assignee, description, labels, and a direct URL.',
    inputSchema: {
      type: 'object',
      properties: { issueKey: { type: 'string', description: 'JIRA issue key e.g. SAP-123' } },
      required: ['issueKey'],
    },
  },
  {
    name: 'search_jira_issues',
    description: 'Search JIRA issues using JQL (JIRA Query Language). Returns a table of matching issues. Example JQL: project = SAP AND status = "In Progress" AND assignee = currentUser()',
    inputSchema: {
      type: 'object',
      properties: {
        jql:        { type: 'string', description: 'JQL query string' },
        maxResults: { type: 'number', description: 'Max issues to return (default: 20)' },
      },
      required: ['jql'],
    },
  },
  {
    name: 'create_jira_issue',
    description: 'Create a new JIRA issue. Use this to raise bugs, tasks, or incidents directly from CPI health-check or iFlow analysis results.',
    inputSchema: {
      type: 'object',
      properties: {
        project:     { type: 'string', description: 'JIRA project key (e.g. SAP). Uses JIRA_DEFAULT_PROJECT env var if omitted.' },
        summary:     { type: 'string', description: 'Issue title / summary' },
        description: { type: 'string', description: 'Detailed description of the issue' },
        issueType:   { type: 'string', description: 'Issue type: Bug, Task, Story, Incident (default: Bug)' },
        priority:    { type: 'string', description: 'Priority: Highest, High, Medium, Low, Lowest (optional)' },
        labels:      { type: 'array', items: { type: 'string' }, description: 'Labels to attach (optional)' },
        assignee:    { type: 'string', description: 'Assignee username (optional)' },
      },
      required: ['summary', 'description'],
    },
  },
  {
    name: 'add_jira_comment',
    description: 'Add a comment to an existing JIRA issue.',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: { type: 'string', description: 'JIRA issue key e.g. SAP-123' },
        comment:  { type: 'string', description: 'Comment text to add' },
      },
      required: ['issueKey', 'comment'],
    },
  },
  {
    name: 'get_jira_comments',
    description: 'Get recent comments on a JIRA issue.',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey:   { type: 'string', description: 'JIRA issue key' },
        maxResults: { type: 'number', description: 'Max comments to return (default: 10)' },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'transition_jira_issue',
    description: 'Move a JIRA issue to a new status (e.g. "In Progress", "Done", "Resolved"). Use get_jira_transitions first to see valid states.',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey:   { type: 'string', description: 'JIRA issue key' },
        transition: { type: 'string', description: 'Transition name or ID (e.g. "In Progress", "Done")' },
      },
      required: ['issueKey', 'transition'],
    },
  },
  {
    name: 'get_jira_transitions',
    description: 'List all valid status transitions for a JIRA issue.',
    inputSchema: {
      type: 'object',
      properties: { issueKey: { type: 'string', description: 'JIRA issue key' } },
      required: ['issueKey'],
    },
  },
];
