// src/governance/runner.ts — Orchestrates the full governance report generation

import * as path from 'node:path';
import * as os   from 'node:os';
import * as fs   from 'node:fs';
import { runGovernanceQueries }       from './jiraQueries.js';
import { parseArt, parseStory, resolveStreamArtKey } from './parser.js';
import { cpiIncompleteness, streamIncompleteness, deriveMilestone, deriveHealth, isOrphan, sortReleases } from './logic.js';
import { buildWorkbook, type GovernanceRow } from './excelBuilder.js';
import { tokenManager } from '../../mcp/JIRA_MCP/tokenManager.js';

export interface GovernanceSummary {
  filePath:    string;
  fileSizeKb:  number;
  timestamp:   string;
  cpiArts:     number;
  Stories: number;
  streamArts:  number;
  releases:    { name: string; count: number }[];
  health:      { green: number; amber: number; red: number };
  orphans:     { total: number; noParent: number; nonCpi: number };
}

export async function runGovernanceReport(outputDir?: string): Promise<GovernanceSummary> {
  // ── Credentials — always get a valid (possibly refreshed) token ───────────
  const baseUrl = (process.env.JIRA_BASE_URL ?? 'https://jira.<YOUR-DOMAIN>').replace(/\/$/, '');
  let accessToken: string;

  try {
    accessToken = await tokenManager.getValidToken();
  } catch (err) {
    // Token missing or refresh failed — give a clear actionable error
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `JIRA authentication required before generating the governance report.\n\n` +
      `Please open Maestro Settings (⚙ gear icon) → JIRA Connection → SSO/OAuth2 → ` +
      `click "Connect with SAP SSO", complete the browser login, then try again.\n\n` +
      `Technical detail: ${msg}`
    );
  }

  if (!accessToken) {
    throw new Error(
      'JIRA authentication required. Please connect via SSO in Maestro Settings first.'
    );
  }

  // ── Timestamp & output path ──────────────────────────────────────────────
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const dir = outputDir
    ?? process.env.GOVERNANCE_OUTPUT_DIR
    ?? path.join(os.homedir(), 'Documents');

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${timestamp}_CPI_ART_Governance_Workbook.xlsx`);

  // ── Run JIRA queries ─────────────────────────────────────────────────────
  const { queryA, queryB, queryC, queryD } = await runGovernanceQueries(accessToken, baseUrl);

  // ── Parse ─────────────────────────────────────────────────────────────────
  const today = new Date();

  const cpiArts    = queryA.map(r => parseArt(r, today));
  const streamMap  = new Map(queryC.map(r => [r.key, parseArt(r, today)]));
  const stories    = queryB.map(r => parseStory(r, today));
  const storyByKey = new Map(stories.map(s => [s.key, s]));

  // Map stories to their parent CPI ART
  const storiesByArt = new Map<string, typeof stories>();
  for (const story of stories) {
    if (story.parentArt) {
      const arr = storiesByArt.get(story.parentArt) ?? [];
      arr.push(story);
      storiesByArt.set(story.parentArt, arr);
    }
  }

  // ── Build governance rows ─────────────────────────────────────────────────
  const rows: GovernanceRow[] = [];

  for (const art of cpiArts) {
    const streamKey = resolveStreamArtKey(art);
    const streamArt = streamKey ? (streamMap.get(streamKey) ?? null) : null;
    const artStories = storiesByArt.get(art.key) ?? [];

    const cpiInc    = cpiIncompleteness(art, streamArt, artStories);
    const streamInc = streamIncompleteness(streamArt, art);
    const milestone = deriveMilestone(art, artStories);
    const health    = deriveHealth(cpiInc.length + streamInc.length);

    rows.push({ cpiArt: art, streamArt, stories: artStories, milestone, health, cpiInc, streamInc });
  }

  // Sort: CPI Owner ASC → Release ASC (blank last) → Key ASC
  rows.sort((a, b) => {
    const ownerCmp = a.cpiArt.assignee.localeCompare(b.cpiArt.assignee);
    if (ownerCmp !== 0) return ownerCmp;
    const ra = a.cpiArt.release || 'ZZZZ';
    const rb = b.cpiArt.release || 'ZZZZ';
    if (ra !== rb) return ra.localeCompare(rb);
    return a.cpiArt.key.localeCompare(b.cpiArt.key);
  });

  // ── Orphan detection ──────────────────────────────────────────────────────
  const orphanStories = queryD
    .map(r => parseStory(r, today))
    .filter(s => isOrphan(s).orphan);

  // ── Build workbook ────────────────────────────────────────────────────────
  await buildWorkbook(rows, orphanStories, filePath, timestamp);

  const stat = fs.statSync(filePath);

  // ── Summary ───────────────────────────────────────────────────────────────
  const releases = [...new Set(rows.map(r => r.cpiArt.release || 'No Release'))];
  const sortedReleases = sortReleases(releases.filter(r => r !== 'No Release'));
  if (releases.includes('No Release')) sortedReleases.push('No Release');

  return {
    filePath,
    fileSizeKb:  Math.round(stat.size / 1024),
    timestamp,
    cpiArts:     rows.length,
    Stories: stories.length,
    streamArts:  streamMap.size,
    releases:    sortedReleases.map(r => ({
      name:  r,
      count: rows.filter(row => (row.cpiArt.release || 'No Release') === r).length,
    })),
    health: {
      green: rows.filter(r => r.health === 'Green').length,
      amber: rows.filter(r => r.health === 'Amber').length,
      red:   rows.filter(r => r.health === 'Red').length,
    },
    orphans: {
      total:    orphanStories.length,
      noParent: orphanStories.filter(s => isOrphan(s).type.includes('No Parent')).length,
      nonCpi:   orphanStories.filter(s => isOrphan(s).type.includes('Non-CPI')).length,
    },
  };
}
