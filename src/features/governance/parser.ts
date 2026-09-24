// src/governance/parser.ts — Field extraction and parsing helpers

import type { JiraIssueRaw } from './jiraQueries.js';

export interface ParsedArt {
  key:         string;
  summary:     string;
  status:      string;
  statusCat:   string;
  assignee:    string;
  reporter:    string;
  release:     string;
  component:   string;
  labels:      string[];
  bgl:         string;
  tgl:         string;
  commit:      string;
  intCpi:      string;
  sprint:      string;
  pdd:         string;
  lastComment: CommentInfo;
  daysAgo:     number;
  issuelinks:  LinkInfo[];
  updated:     string;
}

export interface ParsedStory extends ParsedArt {
  parentArt: string;
}

export interface CommentInfo {
  text:   string;
  by:     string;
  date:   string;
  daysAgo:number;
  has24h: string;
}

export interface LinkInfo {
  type:    string;
  key:     string;
  dir:     'inward' | 'outward';
}

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

export function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2,'0')}/${MONTHS[d.getMonth()]}/${d.getFullYear()}`;
}

export function extractPDD(field: unknown): string {
  const val = (field as { value?: string } | null)?.value ?? (field as string | null) ?? '';
  return val ? formatDate(val) : '';
}

export function extractSprint(field: unknown): string {
  const arr = (field as { value?: unknown[] } | null)?.value ?? (field as unknown[] | null) ?? [];
  if (!Array.isArray(arr) || arr.length === 0) return '';
  const last = String(arr[arr.length - 1]);
  const m = last.match(/name=([^,\]]+)/);
  return m ? m[1].trim() : '';
}

export function extractCommit(labels: string[]): string {
  if (labels.some(l => l.toLowerCase() === 'committed'))   return 'Committed';
  if (labels.some(l => l.toLowerCase() === 'uncommitted')) return 'Uncommitted';
  return '';
}

export function cleanComment(body: unknown): string {
  if (!body) return '';
  let text = typeof body === 'string' ? body : JSON.stringify(body);
  text = text
    .replace(/\[~[^\]]+\]/g, '')
    .replace(/![^!|]+\|[^!]+!/g, '')
    .replace(/![^!]+!/g, '')
    .replace(/\{[^}]+\}/g, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  return text.slice(0, 300);
}

export function extractLastComment(comments: unknown[], today = new Date()): CommentInfo {
  const arr = Array.isArray(comments) ? comments : [];
  if (arr.length === 0) return { text: '', by: '', date: '', daysAgo: 999, has24h: 'No' };
  const last = arr[arr.length - 1] as Record<string, unknown>;
  const created = String(last.created ?? '');
  const daysAgo = created
    ? Math.floor((today.getTime() - new Date(created).getTime()) / 86400000)
    : 999;
  const authorObj = last.author as Record<string, unknown> | undefined;
  const by = String(authorObj?.displayName ?? authorObj?.name ?? '').replace(' (external - Service)', '');
  return {
    text:   cleanComment(last.body),
    by,
    date:   formatDate(created),
    daysAgo,
    has24h: daysAgo <= 1 ? 'Yes' : 'No',
  };
}

function stripServiceSuffix(name: string): string {
  return (name ?? '').replace(' (external - Service)', '').trim();
}

export function parseArt(raw: JiraIssueRaw, today = new Date()): ParsedArt {
  const f       = raw.fields;
  const labels  = ((f.labels as string[]) ?? []);
  const comments= ((f.comment as { comments?: unknown[] })?.comments) ?? [];
  const created = String(f.created ?? '');
  const daysAgo = created ? Math.floor((today.getTime() - new Date(created).getTime()) / 86400000) : 999;

  const links: LinkInfo[] = [];
  for (const link of ((f.issuelinks as Record<string, unknown>[]) ?? [])) {
    const type = String((link.type as { name?: string })?.name ?? '');
    const inKey  = (link.inwardIssue  as { key?: string } | undefined)?.key;
    const outKey = (link.outwardIssue as { key?: string } | undefined)?.key;
    if (inKey)  links.push({ type, key: inKey,  dir: 'inward'  });
    if (outKey) links.push({ type, key: outKey, dir: 'outward' });
  }

  return {
    key:       raw.key,
    summary:   String(f.summary ?? ''),
    status:    String((f.status as { name?: string })?.name ?? ''),
    statusCat: String((f.status as { statusCategory?: { name?: string } })?.statusCategory?.name ?? ''),
    assignee:  stripServiceSuffix(String((f.assignee as { displayName?: string })?.displayName ?? 'Unassigned')),
    reporter:  stripServiceSuffix(String((f.reporter as { displayName?: string })?.displayName ?? '')),
    release:   String((f.fixVersions as { name?: string }[] | undefined)?.[0]?.name ?? ''),
    component: String((f.components  as { name?: string }[] | undefined)?.[0]?.name ?? ''),
    labels,
    bgl:       labels.find(l => l.startsWith('BGLRD')) ?? '',
    tgl:       labels.find(l => l.startsWith('TGLRD')) ?? '',
    commit:    extractCommit(labels),
    intCpi:    labels.includes('INT-CPI') ? 'Yes ✓' : 'Missing',
    sprint:    extractSprint(f.customfield_12740),
    pdd:       extractPDD(f.customfield_10253),
    lastComment: extractLastComment(comments, today),
    daysAgo,
    issuelinks: links,
    updated:   formatDate(String(f.updated ?? '')),
  };
}

export function parseStory(raw: JiraIssueRaw, today = new Date()): ParsedStory {
  const art = parseArt(raw, today);
  const parentLink = art.issuelinks.find(l =>
    l.dir === 'inward' && l.key.startsWith('YOUR_JIRA_PROJECT-')
  );
  return { ...art, parentArt: parentLink?.key ?? '' };
}

// Resolve Stream ART key from CPI ART links
export function resolveStreamArtKey(art: ParsedArt): string {
  // Priority 1: Issue Split inward from YOUR_JIRA_PROJECT
  const split = art.issuelinks.find(l =>
    l.type.toLowerCase().includes('split') && l.key.startsWith('YOUR_JIRA_PROJECT-') && l.key !== art.key
  );
  if (split) return split.key;
  // Priority 2: any Relation or link to YOUR_JIRA_PROJECT ≠ self
  const rel = art.issuelinks.find(l =>
    l.key.startsWith('YOUR_JIRA_PROJECT-') && l.key !== art.key
  );
  return rel?.key ?? '';
}
