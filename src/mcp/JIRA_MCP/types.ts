// src/mcp/JIRA_MCP/types.ts — Shared JIRA entity types

export interface JiraIssue {
  key:         string;
  summary:     string;
  status:      string;
  priority:    string;
  assignee?:   string;
  reporter?:   string;
  created:     string;
  updated:     string;
  description?: string;
  labels?:     string[];
  components?: string[];
  fixVersions?: string[];
  issueType:   string;
  project:     string;
  url:         string;
}

export interface JiraComment {
  id:      string;
  author:  string;
  body:    string;
  created: string;
}

export interface JiraTransition {
  id:   string;
  name: string;
}

export interface JiraSearchResult {
  total:  number;
  issues: JiraIssue[];
}

export type ToolResult = { content: Array<{ type: 'text'; text: string }> };
