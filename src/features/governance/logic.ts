// src/governance/logic.ts — Business logic: milestone, health, incompleteness, signals

import type { ParsedArt, ParsedStory } from './parser.js';

export const DONE_STATUSES = new Set([
  'Done', 'Closed', 'Cancelled', 'Obsolete', 'DEPLOY',
]);
export const COMMENT_CHECK_STATUSES = new Set([
  'In Development', 'Ready for Validation', 'Validation',
  'Ready for Deployment', 'Deploy', 'In Releasing',
]);
export const STORY_CLOSED_STATUSES = new Set([
  'Done', 'Closed', 'Cancelled', 'Obsolete', 'Verification',
]);

// ── Milestone ──────────────────────────────────────────────────────────────

export function deriveMilestone(art: ParsedArt, stories: ParsedStory[]): string {
  const s = art.status;
  if (['Done', 'In Releasing', 'Deploy'].includes(s))     return 'Moved To Production';
  if (s === 'Ready for Deployment')                        return 'Functional Sign Off';
  if (['Validation', 'Ready for Validation'].includes(s)) return 'Moved To Test';
  if (stories.some(st => st.status === 'Verification'))   return 'Unit Test Completed';
  if (s === 'Development Completed' ||
      (stories.length > 0 && stories.every(st =>
        ['Done','Closed','Verification'].includes(st.status)))) return 'Build Completed';
  if (stories.some(st => st.status === 'Blocked'))        return 'Build Blocked';
  if (stories.some(st => ['In Progress','Development Ready',
      'In Development','In Refinement'].includes(st.status))) return 'Build Started';
  if (s === 'New' && stories.length === 0)                return 'In Design';
  return 'In Analysis';
}

// ── Health ─────────────────────────────────────────────────────────────────

export function deriveHealth(issueCount: number): string {
  if (issueCount === 0) return 'Green';
  if (issueCount <= 2)  return 'Amber';
  return 'Red';
}

// ── CPI ART incompleteness ─────────────────────────────────────────────────

export function cpiIncompleteness(
  art: ParsedArt,
  streamArt: ParsedArt | null,
  stories: ParsedStory[],
): string[] {
  const issues: string[] = [];
  if (!art.release)       issues.push('Missing Release');
  if (!art.component)     issues.push('Missing Component');
  if (!art.assignee || art.assignee === 'Unassigned') issues.push('Missing Assignee');
  if (art.intCpi !== 'Yes ✓') issues.push('Missing INT-CPI Label');
  if (!streamArt)         issues.push('Missing Stream Mapping');
  if (stories.length === 0) issues.push('Missing YOUR_JIRA_PROJECT Mapping');
  if (!art.pdd)           issues.push('Missing PDD');
  if (COMMENT_CHECK_STATUSES.has(art.status) && !DONE_STATUSES.has(art.status)) {
    if (art.daysAgo > 7)  issues.push('Comment Not Updated');
  }
  if (streamArt?.commit === 'Committed' &&
      !['In Development','Done','Development Completed'].some(s => art.status === s)) {
    issues.push('Status Mismatch');
  }
  return issues;
}

// ── Stream ART incompleteness ──────────────────────────────────────────────

export function streamIncompleteness(streamArt: ParsedArt | null, cpiArt: ParsedArt): string[] {
  if (!streamArt) return ['Missing Stream ART'];
  const issues: string[] = [];
  if (!streamArt.bgl && !streamArt.tgl) issues.push('Missing BGL or TGL');
  if (!streamArt.commit)                issues.push('Missing Commitment');
  if (!streamArt.assignee || streamArt.assignee === 'Unassigned') issues.push('Missing Owner');
  if (!streamArt.release)               issues.push('Missing Release');
  if (!streamArt.pdd)                   issues.push('Missing PDD');
  if (streamArt.commit === 'Committed' &&
      !['In Development','Done','Development Completed'].some(s => cpiArt.status === s)) {
    issues.push('Status Mismatch');
  }
  return issues;
}

// ── Intelligence signals ───────────────────────────────────────────────────

export interface Signal {
  type:   string;
  detail: string;
  urgency:'Red' | 'Amber' | 'Green';
  story?: ParsedStory;
}

export function intelligenceSignals(
  art: ParsedArt,
  streamArt: ParsedArt | null,
  stories: ParsedStory[],
  today = new Date(),
): Signal[] {
  const signals: Signal[] = [];
  const isDone = DONE_STATUSES.has(art.status);

  // Stories not closed — even for Done ARTs
  const unclosed = stories.filter(s => !STORY_CLOSED_STATUSES.has(s.status));
  if (isDone && unclosed.length > 0) {
    signals.push({
      type: '🔴 STORIES NOT CLOSED',
      detail: `${unclosed.length} open stor${unclosed.length > 1 ? 'ies' : 'y'}: ${unclosed.map(s => s.key).join(', ')}`,
      urgency: 'Red',
    });
  }

  if (isDone) return signals; // skip remaining signals for Done ARTs

  const pddDate = art.pdd ? parsePDD(art.pdd) : null;
  const daysLeft = pddDate ? Math.floor((pddDate.getTime() - today.getTime()) / 86400000) : null;

  if (pddDate) {
    if (daysLeft !== null && daysLeft < 0) {
      signals.push({ type: '🚨 PDD OVERDUE', detail: `PDD was ${art.pdd}`, urgency: 'Red' });
    } else if (daysLeft !== null && daysLeft <= 7) {
      signals.push({ type: '⚠️ PDD APPROACHING', detail: `${daysLeft} days left`, urgency: 'Amber' });
    } else if (daysLeft !== null && daysLeft <= 14 && stories.filter(s => STORY_CLOSED_STATUSES.has(s.status)).length === 0) {
      signals.push({ type: '⚠️ PDD RISK', detail: `Within 14 days, no stories done`, urgency: 'Amber' });
    }
  }

  // Stale checks
  if (COMMENT_CHECK_STATUSES.has(art.status)) {
    const active = stories.filter(s => !STORY_CLOSED_STATUSES.has(s.status));
    if (active.length === 0) {
      // No stories — check ART comment
      if (art.lastComment.daysAgo > 7) {
        signals.push({
          type: '⏸ STALE (No Stories)',
          detail: `Last comment ${art.lastComment.daysAgo}d ago`,
          urgency: art.lastComment.daysAgo > 14 ? 'Red' : 'Amber',
        });
      }
      signals.push({ type: '❓ NO STORIES', detail: 'No child YOUR_JIRA_PROJECT stories linked', urgency: 'Red' });
    } else {
      const stale = active.filter(s => s.lastComment.daysAgo > 7);
      if (stale.length === active.length) {
        const worst = Math.max(...stale.map(s => s.lastComment.daysAgo));
        signals.push({
          type: '⏸ STALE',
          detail: `All ${active.length} active stor${active.length > 1 ? 'ies' : 'y'} stale (worst: ${worst}d)`,
          urgency: worst > 14 ? 'Red' : 'Amber',
          story: stale.reduce((a, b) => a.lastComment.daysAgo > b.lastComment.daysAgo ? a : b),
        });
      } else if (stale.length > 0) {
        signals.push({ type: '⏸ PARTIAL STALE', detail: `${stale.length}/${active.length} stories stale >7d`, urgency: 'Amber' });
      }
    }
  }

  const milestone = deriveMilestone(art, stories);
  if (art.commit === 'Committed' && ['In Design', 'In Analysis'].includes(milestone)) {
    signals.push({ type: '🎯 COMMITTED/NOT STARTED', detail: `Milestone: ${milestone}`, urgency: 'Amber' });
  }

  const blocked = stories.filter(s => s.status === 'Blocked');
  if (blocked.length > 0) {
    signals.push({
      type: '⛔ BLOCKED',
      detail: `${blocked.length} blocked: ${blocked.map(s => s.key).join(', ')}`,
      urgency: art.commit === 'Committed' ? 'Red' : 'Amber',
      story: blocked[0],
    });
  }

  if (streamArt && !streamArt.commit) {
    signals.push({ type: '🔗 STREAM UNCOMMITTED', detail: `${streamArt.key} has no commitment`, urgency: 'Amber' });
  }
  if (streamArt?.commit === 'Committed' && art.status === 'New') {
    signals.push({ type: '⚡ STREAM AHEAD', detail: 'Stream committed but CPI is New', urgency: 'Amber' });
  }

  const done = stories.filter(s => STORY_CLOSED_STATUSES.has(s.status)).length;
  if (stories.length > 0 && pddDate && daysLeft !== null && daysLeft <= 21) {
    const pct = Math.round((done / stories.length) * 100);
    if (pct < 50) {
      signals.push({ type: '📉 LOW COMPLETION', detail: `${pct}% done with ${daysLeft}d to PDD`, urgency: 'Amber' });
    }
  }

  return signals;
}

// ── Stream actions ─────────────────────────────────────────────────────────

export interface StreamAction {
  action:    string;
  detail:    string;
  urgency:   'Red' | 'Amber';
  escalateTo:string;
}

export function deriveStreamActions(
  art: ParsedArt,
  streamArt: ParsedArt | null,
  stories: ParsedStory[],
): StreamAction[] {
  const actions: StreamAction[] = [];
  if (!streamArt) {
    actions.push({ action: 'LINK STREAM ART', detail: 'No stream ART linked to this CPI ART', urgency: 'Red', escalateTo: art.assignee });
    return actions;
  }
  if (!streamArt.commit)
    actions.push({ action: 'SET COMMITMENT', detail: `${streamArt.key} has no Committed/Uncommitted label`, urgency: 'Amber', escalateTo: streamArt.assignee || art.assignee });
  if (!streamArt.bgl && !streamArt.tgl)
    actions.push({ action: 'ADD BGL OR TGL LABEL', detail: 'Neither BGLRD* nor TGLRD* label present', urgency: 'Amber', escalateTo: streamArt.assignee || art.assignee });
  if (!streamArt.release)
    actions.push({ action: 'SET RELEASE', detail: 'Stream ART has no fix version', urgency: 'Amber', escalateTo: streamArt.assignee || art.assignee });
  if (!streamArt.pdd)
    actions.push({ action: 'SET PDD', detail: 'Stream ART has no PDD', urgency: 'Amber', escalateTo: streamArt.assignee || art.assignee });
  if (COMMENT_CHECK_STATUSES.has(streamArt.status) && streamArt.lastComment.daysAgo > 7)
    actions.push({ action: 'REQUEST STATUS UPDATE', detail: `No update in ${streamArt.lastComment.daysAgo}d`, urgency: streamArt.lastComment.daysAgo > 14 ? 'Red' : 'Amber', escalateTo: streamArt.assignee });
  if (streamArt.commit === 'Committed' && !['In Development','Done','Development Completed'].includes(art.status))
    actions.push({ action: 'ESCALATE STATUS MISMATCH', detail: `Stream committed but CPI is ${art.status}`, urgency: 'Red', escalateTo: art.assignee });
  const blocked = stories.filter(s => s.status === 'Blocked');
  if (blocked.length > 0 && streamArt.commit === 'Committed')
    actions.push({ action: 'UNBLOCK STORY', detail: `${blocked.map(s => s.key).join(', ')} blocked`, urgency: 'Red', escalateTo: streamArt.assignee || art.assignee });
  return actions;
}

// ── Orphan detection ───────────────────────────────────────────────────────

const SECONDARY_LABELS = new Set(['INT-CPI','YOUR-TEAM-LABEL','Interface_Build','IF_Type_CPI']);

export function isOrphan(story: ParsedStory): { orphan: boolean; type: string } {
  const labels = story.labels;
  if (!labels.includes('RICEFW')) return { orphan: false, type: '' };
  if (!labels.some(l => SECONDARY_LABELS.has(l))) return { orphan: false, type: '' };
  if (story.parentArt) {
    if (!story.parentArt.startsWith('YOUR_JIRA_PROJECT-')) return { orphan: true, type: '⚠️ Non-CPI Parent' };
    return { orphan: false, type: '' };
  }
  // Check any parent-child inward link
  const hasParent = story.issuelinks.some(l =>
    l.dir === 'inward' && l.type.toLowerCase().includes('parent')
  );
  if (hasParent) return { orphan: true, type: '⚠️ Non-CPI Parent' };
  return { orphan: true, type: '🔴 No Parent ART' };
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MON_MAP: Record<string, number> = {
  JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11,
};

export function parsePDD(pdd: string): Date | null {
  // DD/MON/YYYY
  const m = pdd.match(/^(\d{2})\/([A-Z]{3})\/(\d{4})$/);
  if (!m) return null;
  const mon = MON_MAP[m[2]];
  if (mon === undefined) return null;
  return new Date(parseInt(m[3]), mon, parseInt(m[1]));
}

export function sortReleases(releases: string[]): string[] {
  const order = ['RD02','RD07','RD08','RD10','RD11','FD'];
  return [...releases].sort((a, b) => {
    const ia = order.findIndex(r => a.includes(r));
    const ib = order.findIndex(r => b.includes(r));
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}
