// src/mcp/JIRA_MCP/config.ts — JIRA credential resolution
//
// Three auth modes:
//   sso   (default) — OAuth2 PKCE via SAP JIRA MCP auth server (mcp.jira.<YOUR-DOMAIN>)
//                     User clicks "Connect with SAP SSO" in the Maestro UI.
//                     Access token stored in JIRA_ACCESS_TOKEN.
//   pat             — Personal Access Token (Bearer), Jira DC 8.14+
//   basic           — username + password (HTTP Basic)

export type JiraAuthMode = 'basic' | 'pat' | 'sso';

export interface JiraCredentials {
  baseUrl:        string;
  authMode:       JiraAuthMode;
  // SSO / PAT
  pat?:           string;
  // Basic auth
  username?:      string;
  password?:      string;
  // Shared
  defaultProject?: string;
  apiVersion:     '2' | '3';
}

export function loadJiraCredentials(): JiraCredentials {
  const baseUrl  = process.env.JIRA_BASE_URL ?? 'https://jira.<YOUR-DOMAIN>';
  const authMode = (process.env.JIRA_AUTH_MODE ?? 'sso').toLowerCase() as JiraAuthMode;
  const isCloud  = baseUrl.includes('atlassian.net');
  const apiVersion: '2' | '3' = isCloud ? '3' : '2';

  if (authMode === 'sso' || authMode === 'pat') {
    const token = process.env.JIRA_ACCESS_TOKEN ?? process.env.JIRA_PAT ?? '';
    if (!token) throw new Error(
      'JIRA SSO token not found. Click "Connect with SAP SSO" in the Maestro Settings to authenticate.'
    );
    return { baseUrl: baseUrl.replace(/\/$/, ''), authMode, pat: token, defaultProject: process.env.JIRA_DEFAULT_PROJECT, apiVersion };
  }

  // Basic auth
  const username = process.env.JIRA_USERNAME ?? process.env.JIRA_EMAIL ?? '';
  const password = process.env.JIRA_PASSWORD ?? process.env.JIRA_API_TOKEN ?? '';
  if (!username) throw new Error('Missing env var: JIRA_USERNAME');
  if (!password) throw new Error('Missing env var: JIRA_PASSWORD');

  return { baseUrl: baseUrl.replace(/\/$/, ''), authMode: 'basic', username, password, defaultProject: process.env.JIRA_DEFAULT_PROJECT, apiVersion };
}

export function storeJiraPat(pat: string): void {
  process.env.JIRA_ACCESS_TOKEN = pat;
  process.env.JIRA_AUTH_MODE    = 'sso';
}

export function storeJiraSsoTokens(accessToken: string, _refreshToken: string, _expiresAt: number): void {
  storeJiraPat(accessToken);
}
