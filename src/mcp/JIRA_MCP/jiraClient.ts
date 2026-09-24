// src/mcp/JIRA_MCP/jiraClient.ts — JIRA REST API client
// Supports:
//   PAT  (Bearer token)  — Jira Data Center 8.14+, recommended for SAP Jira
//   SSO  (PAT via UI)    — same as PAT, token obtained interactively; auto-retries on 401
//   Basic                — username + password

import axios, { type AxiosInstance, isAxiosError } from 'axios';
import type { JiraCredentials }       from './config.js';
import { tokenManager }               from './tokenManager.js';
import type { JiraIssue, JiraComment, JiraTransition, JiraSearchResult } from './types.js';

export class JiraClient {
  private http:  AxiosInstance;
  private creds: JiraCredentials;
  private readonly baseUrl: string;

  constructor(creds: JiraCredentials) {
    this.creds   = creds;
    this.baseUrl = creds.baseUrl;
    this.http    = this.buildHttp(creds);
  }

  private buildHttp(creds: JiraCredentials): AxiosInstance {
    let authHeader: string;
    if (creds.authMode === 'pat' || creds.authMode === 'sso') {
      authHeader = `Bearer ${creds.pat}`;
    } else {
      const encoded = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
      authHeader    = `Basic ${encoded}`;
    }
    return axios.create({
      baseURL: `${this.baseUrl}/rest/api/${this.creds.apiVersion}`,
      timeout: 15_000,
      headers: {
        Authorization:      authHeader,
        Accept:             'application/json',
        'Content-Type':     'application/json',
        'X-Atlassian-Token':'no-check',
      },
    });
  }

  /** Wrap every HTTP call with a transparent 401 retry using a fresh token. */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      // On 401: get a fresh token and retry exactly once
      if (isAxiosError(err) && err.response?.status === 401 &&
          (this.creds.authMode === 'sso' || this.creds.authMode === 'pat')) {
        try {
          const fresh = await tokenManager.getValidToken();
          this.creds  = { ...this.creds, pat: fresh };
          this.http   = this.buildHttp(this.creds);
          return await fn(); // retry with new token
        } catch {
          throw new Error('JIRA session expired. Please re-authenticate via SSO in Maestro Settings.');
        }
      }
      throw err;
    }
  }

  // ── Issues ───────────────────────────────────────────────────────────────

  async getIssue(issueKey: string): Promise<JiraIssue | null> {
    return this.withRetry(async () => {
      try {
        const r = await this.http.get(`/issue/${issueKey}`, {
          params: { fields: 'summary,status,priority,assignee,reporter,created,updated,description,labels,components,fixVersions,issuetype,project' },
        });
        return this.mapIssue(r.data);
      } catch { return null; }
    });
  }

  async searchIssues(jql: string, maxResults = 20): Promise<JiraSearchResult> {
    return this.withRetry(async () => {
      try {
        const r = await this.http.post('/search', {
          jql, maxResults,
          fields: ['summary','status','priority','assignee','reporter','created','updated','issuetype','project','labels'],
        });
        return { total: r.data.total ?? 0, issues: (r.data.issues ?? []).map((i: Record<string, unknown>) => this.mapIssue(i)) };
      } catch { return { total: 0, issues: [] }; }
    });
  }

  async createIssue(opts: {
    project:     string;
    summary:     string;
    description: string;
    issueType:   string;
    priority?:   string;
    labels?:     string[];
    assignee?:   string;
  }): Promise<{ key: string; url: string } | null> {
    try {
      const fields: Record<string, unknown> = {
        project:   { key: opts.project },
        summary:   opts.summary,
        issuetype: { name: opts.issueType },
      };

      // Description format differs between API v2 (plain string) and v3 (ADF)
      if (this.creds.apiVersion === '3') {
        fields.description = {
          type: 'doc', version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: opts.description }] }],
        };
      } else {
        fields.description = opts.description;
      }

      if (opts.priority) fields.priority = { name: opts.priority };
      if (opts.labels)   fields.labels   = opts.labels;
      if (opts.assignee) fields.assignee = { name: opts.assignee };

      const r = await this.http.post('/issue', { fields });
      return { key: r.data.key, url: `${this.baseUrl}/browse/${r.data.key}` };
    } catch (err) {
      const msg = axios.isAxiosError(err) ? JSON.stringify(err.response?.data) : String(err);
      throw new Error(`Failed to create issue: ${msg}`);
    }
  }

  async addComment(issueKey: string, comment: string): Promise<boolean> {
    try {
      const body = this.creds.apiVersion === '3'
        ? { body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }] } }
        : { body: comment };
      await this.http.post(`/issue/${issueKey}/comment`, body);
      return true;
    } catch { return false; }
  }

  async getComments(issueKey: string, maxResults = 10): Promise<JiraComment[]> {
    try {
      const r = await this.http.get(`/issue/${issueKey}/comment`, { params: { maxResults } });
      return (r.data.comments ?? []).map((c: Record<string, unknown>) => ({
        id:      String(c.id ?? ''),
        author:  (c.author as Record<string, unknown>)?.displayName as string ?? '',
        body:    this.extractText(c.body),
        created: String(c.created ?? ''),
      }));
    } catch { return []; }
  }

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    try {
      const r = await this.http.get(`/issue/${issueKey}/transitions`);
      return (r.data.transitions ?? []).map((t: Record<string, unknown>) => ({
        id:   String(t.id ?? ''),
        name: String(t.name ?? ''),
      }));
    } catch { return []; }
  }

  async transitionIssue(issueKey: string, transitionIdOrName: string): Promise<boolean> {
    try {
      const transitions = await this.getTransitions(issueKey);
      const t = transitions.find(
        x => x.id === transitionIdOrName || x.name.toLowerCase() === transitionIdOrName.toLowerCase()
      );
      if (!t) throw new Error(`Transition "${transitionIdOrName}" not found. Available: ${transitions.map(x => x.name).join(', ')}`);
      await this.http.post(`/issue/${issueKey}/transitions`, { transition: { id: t.id } });
      return true;
    } catch { return false; }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private mapIssue(data: Record<string, unknown>): JiraIssue {
    const f = (data.fields ?? data) as Record<string, unknown>;
    return {
      key:         String(data.key ?? ''),
      summary:     String(f.summary ?? ''),
      status:      String((f.status as Record<string, unknown>)?.name ?? ''),
      priority:    String((f.priority as Record<string, unknown>)?.name ?? 'Medium'),
      assignee:    (f.assignee as Record<string, unknown>)?.displayName as string | undefined,
      reporter:    (f.reporter as Record<string, unknown>)?.displayName as string | undefined,
      created:     String(f.created ?? ''),
      updated:     String(f.updated ?? ''),
      description: this.extractText(f.description),
      labels:      (f.labels as string[] | undefined) ?? [],
      components:  ((f.components as Record<string, unknown>[]) ?? []).map(c => String(c.name ?? '')),
      fixVersions: ((f.fixVersions as Record<string, unknown>[]) ?? []).map(v => String(v.name ?? '')),
      issueType:   String((f.issuetype as Record<string, unknown>)?.name ?? ''),
      project:     String((f.project as Record<string, unknown>)?.key ?? ''),
      url:         `${this.baseUrl}/browse/${data.key}`,
    };
  }

  private extractText(node: unknown): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    const doc = node as Record<string, unknown>;
    if (doc.type === 'text') return String(doc.text ?? '');
    if (Array.isArray(doc.content)) {
      return (doc.content as unknown[]).map(c => this.extractText(c)).join(' ');
    }
    return '';
  }
}
