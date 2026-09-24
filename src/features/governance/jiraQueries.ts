// src/governance/jiraQueries.ts — Run the 4 governance JIRA queries in parallel
// Uses tokenManager.getValidToken() so 401s are retried with a fresh token.

import { tokenManager } from '../../mcp/JIRA_MCP/tokenManager.js';

export interface JiraIssueRaw {
  key:    string;
  fields: Record<string, unknown>;
}

export interface JiraQueryResult {
  issues: JiraIssueRaw[];
  total:  number;
}

async function jiraGet(
  accessToken: string,
  baseUrl: string,
  jql: string,
  fields: string[],
  startAt = 0,
  maxResults = 50,
): Promise<JiraQueryResult> {
  const url = `${baseUrl}/rest/api/2/search`;

  const doFetch = async (token: string): Promise<Response> =>
    fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        Accept:         'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jql, fields, startAt, maxResults }),
    });

  let res = await doFetch(accessToken);

  // 401 — try one transparent refresh
  if (res.status === 401) {
    try {
      const fresh = await tokenManager.getValidToken();
      res = await doFetch(fresh);
    } catch {
      throw new Error('JIRA token expired during governance report. Please re-authenticate via SSO in Maestro Settings.');
    }
  }

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`JIRA query failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<JiraQueryResult>;
}

async function fetchAllPages(
  accessToken: string,
  baseUrl: string,
  jql: string,
  fields: string[],
  maxTotal = 200,
): Promise<JiraIssueRaw[]> {
  const first = await jiraGet(accessToken, baseUrl, jql, fields, 0, 50);
  const total = Math.min(first.total, maxTotal);
  const pages: Promise<JiraQueryResult>[] = [];
  for (let start = 50; start < total; start += 50) {
    pages.push(jiraGet(accessToken, baseUrl, jql, fields, start, 50));
  }
  const rest = await Promise.all(pages);
  return [first, ...rest].flatMap(r => r.issues);
}

const COMMON_FIELDS = [
  'summary', 'status', 'assignee', 'reporter', 'fixVersions', 'labels',
  'components', 'creator', 'issuelinks', 'created', 'updated',
  'customfield_12740', 'customfield_10253', 'comment',
];

export async function runGovernanceQueries(accessToken: string, baseUrl: string) {
  const [queryA, queryB, queryD] = await Promise.all([
    // Query A — CPI ARTs
    fetchAllPages(accessToken, baseUrl,
      'project = YOUR_JIRA_PROJECT AND issuetype = Feature AND labels = INT-CPI AND status not in (Obsolete) ORDER BY assignee ASC, fixVersion ASC, key ASC',
      COMMON_FIELDS, 200),
    // Query B — YOUR_JIRA_PROJECT Stories
    fetchAllPages(accessToken, baseUrl,
      'project = YOUR_JIRA_PROJECT AND issuetype = Story AND labels = Interface_Build AND resolution = Unresolved ORDER BY key ASC',
      COMMON_FIELDS, 200),
    // Query D — Orphan candidates
    fetchAllPages(accessToken, baseUrl,
      'project = YOUR_JIRA_PROJECT AND issuetype = Story AND resolution = Unresolved AND labels in (RICEFW, "INT-CPI", "YOUR-TEAM-LABEL", Interface_Build, IF_Type_CPI) ORDER BY created DESC',
      COMMON_FIELDS, 200),
  ]);

  // Query C — Stream ARTs linked from CPI ARTs
  const streamKeys = collectStreamArtKeys(queryA);
  let queryC: JiraIssueRaw[] = [];
  if (streamKeys.length > 0) {
    queryC = await fetchAllPages(accessToken, baseUrl,
      `project = YOUR_JIRA_PROJECT AND key in (${streamKeys.join(',')})`,
      COMMON_FIELDS, 200);
  }

  return { queryA, queryB, queryC, queryD };
}

function collectStreamArtKeys(cpiArts: JiraIssueRaw[]): string[] {
  const keys = new Set<string>();
  for (const art of cpiArts) {
    const links = (art.fields.issuelinks ?? []) as Record<string, unknown>[];
    for (const link of links) {
      const inward  = (link.inwardIssue  as { key?: string } | undefined)?.key;
      const outward = (link.outwardIssue as { key?: string } | undefined)?.key;
      for (const k of [inward, outward]) {
        if (k && k.startsWith('YOUR_JIRA_PROJECT-') && k !== art.key) keys.add(k);
      }
    }
  }
  return [...keys];
}
