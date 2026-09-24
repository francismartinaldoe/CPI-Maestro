// src/tools/jira/jiraTools.ts — Shared JIRA tool definitions
// Imported by both GatekeeperAgent and FlowLensAgent.
// Single source of truth — edit here, both agents pick it up.

import type Anthropic from '@anthropic-ai/sdk';

export const JIRA_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_jira_issue',
    description: 'Get full details of a JIRA issue by its key (e.g. SAP-123).',
    input_schema: {
      type: 'object' as const,
      properties: { issueKey: { type: 'string', description: 'JIRA issue key e.g. SAP-123' } },
      required: ['issueKey'],
    },
  },
  {
    name: 'search_jira_issues',
    description: 'Search JIRA issues using JQL. Example: project = SAP AND status = "In Progress"',
    input_schema: {
      type: 'object' as const,
      properties: {
        jql:        { type: 'string', description: 'JQL query string' },
        maxResults: { type: 'number', description: 'Max results (default: 20)' },
      },
      required: ['jql'],
    },
  },
  {
    name: 'create_jira_issue',
    description: 'Create a JIRA issue to track a CPI finding, health-check failure, or remediation task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project:     { type: 'string', description: 'JIRA project key (uses JIRA_DEFAULT_PROJECT if omitted)' },
        summary:     { type: 'string', description: 'Issue summary/title' },
        description: { type: 'string', description: 'Detailed description including CPI findings' },
        issueType:   { type: 'string', description: 'Bug, Task, Story, Incident (default: Bug)' },
        priority:    { type: 'string', description: 'Highest, High, Medium, Low, Lowest (optional)' },
        assignee:    { type: 'string', description: 'Assignee username — use iFlow owner if known (optional)' },
        labels:      { type: 'array', items: { type: 'string' }, description: 'Labels e.g. ["cpi", "health-check"]' },
      },
      required: ['summary', 'description'],
    },
  },
  {
    name: 'add_jira_comment',
    description: 'Add a comment to an existing JIRA issue.',
    input_schema: {
      type: 'object' as const,
      properties: {
        issueKey: { type: 'string', description: 'JIRA issue key' },
        comment:  { type: 'string', description: 'Comment text' },
      },
      required: ['issueKey', 'comment'],
    },
  },
  {
    name: 'get_jira_comments',
    description: 'Get recent comments on a JIRA issue.',
    input_schema: {
      type: 'object' as const,
      properties: {
        issueKey:   { type: 'string', description: 'JIRA issue key' },
        maxResults: { type: 'number', description: 'Max comments (default: 10)' },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'transition_jira_issue',
    description: 'Move a JIRA issue to a new status (e.g. "In Progress", "Done").',
    input_schema: {
      type: 'object' as const,
      properties: {
        issueKey:   { type: 'string', description: 'JIRA issue key' },
        transition: { type: 'string', description: 'Target status name or ID' },
      },
      required: ['issueKey', 'transition'],
    },
  },
  {
    name: 'get_jira_transitions',
    description: 'List valid status transitions for a JIRA issue.',
    input_schema: {
      type: 'object' as const,
      properties: { issueKey: { type: 'string', description: 'JIRA issue key' } },
      required: ['issueKey'],
    },
  },
];
