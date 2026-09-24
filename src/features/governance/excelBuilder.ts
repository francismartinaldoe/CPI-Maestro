// src/governance/excelBuilder.ts — Build the 16-sheet governance workbook

import ExcelJS from 'exceljs';
import type { ParsedArt, ParsedStory } from './parser.js';
import {
  DONE_STATUSES, COMMENT_CHECK_STATUSES, STORY_CLOSED_STATUSES,
  deriveMilestone, deriveHealth, cpiIncompleteness, streamIncompleteness,
  intelligenceSignals, deriveStreamActions, isOrphan, sortReleases, parsePDD,
} from './logic.js';

// ── Colour palette ─────────────────────────────────────────────────────────

const C = {
  navy:     'FF001F5B',
  darkBlue: 'FF002B6C',
  stream:   { header: 'FF0F3460', data: 'FFE8EAF6' },
  cpi:      { header: 'FF1565C0', data: 'FFE3F2FD' },
  :     { header: 'FF1B5E20', data: 'FFE8F5E9' },
  comment:  { header: 'FFE65100', data: 'FFFFF3E0' },
  inc:      { header: 'FFB71C1C', data: 'FFFFEBEE' },
  mile:     { header: 'FF4A148C', data: 'FFF3E5F5' },
  orphan:   { header: 'FF6A0572', data: 'FFF3E5F5' },
  action:   { header: 'FF4A148C', data: 'FFF3E5F5' },
  committed:   { bg: 'FFE8F5E9', font: 'FF276221' },
  uncommitted: { bg: 'FFFCE4D6', font: 'FF833C00' },
  green:  { bg: 'FFC6EFCE', font: 'FF276221' },
  amber:  { bg: 'FFFFEB9C', font: 'FF9C5700' },
  red:    { bg: 'FFFFC7CE', font: 'FF9B0006' },
  alt:    'FFEBF3FB',
  grey:   'FFF2F2F2',
  white:  'FFFFFFFF',
  border: 'FFD0D0D0',
  groupBorder: 'FF002B6C',
  actionMsg: 'FF006400',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thin(argb = C.border): ExcelJS.BorderStyle {
  return 'thin' as ExcelJS.BorderStyle;
}

function borders(argb = C.border): Partial<ExcelJS.Borders> {
  const b = { style: thin(argb) as ExcelJS.BorderStyle, color: { argb } };
  return { top: b, bottom: b, left: b, right: b };
}

function applyCell(
  cell: ExcelJS.Cell,
  value: unknown,
  opts: {
    fill?: string; font?: string; bold?: boolean; size?: number;
    wrap?: boolean; align?: ExcelJS.Alignment['horizontal'];
    border?: string; groupBorder?: boolean;
  } = {},
) {
  cell.value = value as ExcelJS.CellValue;
  if (opts.fill)  cell.fill  = fill(opts.fill);
  if (opts.font || opts.bold || opts.size) {
    cell.font = {
      name: 'Calibri',
      size:  opts.size ?? 10,
      bold:  opts.bold ?? false,
      color: opts.font ? { argb: opts.font } : undefined,
    };
  }
  cell.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle', wrapText: opts.wrap ?? false };
  cell.border = borders(opts.border ?? C.border);
}

function headerCell(cell: ExcelJS.Cell, value: string, fillColor: string, groupBorder = false) {
  applyCell(cell, value, { fill: fillColor, font: C.white, bold: true, size: 11, wrap: true });
  if (groupBorder) {
    cell.border = { ...borders(C.border), left: { style: 'medium', color: { argb: C.groupBorder } } };
  }
}

function commitColor(commit: string): { bg: string; font: string } | null {
  if (commit === 'Committed')   return C.committed;
  if (commit === 'Uncommitted') return C.uncommitted;
  return null;
}

function healthColor(h: string): string {
  if (h === 'Green') return C.green.bg;
  if (h === 'Amber') return C.amber.bg;
  if (h === 'Red')   return C.red.bg;
  return C.grey;
}

function daysColor(d: number): string {
  if (d > 14) return C.red.bg;
  if (d > 7)  return C.amber.bg;
  return C.green.bg;
}

function setupSheet(ws: ExcelJS.Worksheet) {
  ws.properties.showGridLines = false;
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1 };
}

// ── Main builder ───────────────────────────────────────────────────────────

export interface GovernanceRow {
  cpiArt:    ParsedArt;
  streamArt: ParsedArt | null;
  stories:   ParsedStory[];
  milestone: string;
  health:    string;
  cpiInc:    string[];
  streamInc: string[];
}

export async function buildWorkbook(
  rows: GovernanceRow[],
  orphans: ParsedStory[],
  outputPath: string,
  timestamp: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Maestro';
  wb.created  = new Date();

  const today = new Date();

  buildDashboard(wb, rows, timestamp);
  buildMasterReport(wb, rows, today);
  buildIncompleteness(wb, rows, timestamp);
  buildArtMapping(wb, rows, today);
  buildReleaseSheets(wb, rows, timestamp, today);
  buildMaxAttention(wb, rows, today, timestamp);
  buildRawData(wb, rows, today, timestamp);
  buildIntelligenceSignals(wb, rows, today, timestamp);
  buildStreamActionRegister(wb, rows, today, timestamp);
  buildOrphanSheet(wb, orphans, today, timestamp);

  await wb.xlsx.writeFile(outputPath);
}

// ── SHEET 1: Dashboard ────────────────────────────────────────────────────

function buildDashboard(wb: ExcelJS.Workbook, rows: GovernanceRow[], ts: string) {
  const ws = wb.addWorksheet('Dashboard');
  ws.properties.tabColor = { argb: 'FF001F5B' };
  setupSheet(ws);

  ws.columns = [
    { width: 35 }, { width: 20 }, { width: 12 }, { width: 12 },
  ];

  const addSection = (title: string, data: [string, string | number][]) => {
    const titleRow = ws.addRow([title]);
    titleRow.getCell(1).fill = fill(C.darkBlue);
    titleRow.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: C.white } };
    titleRow.height = 22;

    data.forEach(([label, value], i) => {
      const r = ws.addRow([label, value]);
      r.getCell(1).fill = fill(i % 2 === 0 ? 'FFEBF3FB' : C.white);
      r.getCell(2).fill = fill(i % 2 === 0 ? 'FFEBF3FB' : C.white);
      r.getCell(1).font = { name: 'Calibri', size: 10 };
      r.getCell(2).font = { name: 'Calibri', size: 10, bold: true };
      r.height = 18;
    });
    ws.addRow([]);
  };

  const total  = rows.length;
  const inDev  = rows.filter(r => COMMENT_CHECK_STATUSES.has(r.cpiArt.status)).length;
  const done   = rows.filter(r => DONE_STATUSES.has(r.cpiArt.status)).length;
  const inc    = rows.filter(r => r.cpiInc.length + r.streamInc.length > 0).length;
  const withStream = rows.filter(r => r.streamArt).length;
  const stories    = rows.flatMap(r => r.stories);
  const noPdd  = rows.filter(r => !r.cpiArt.pdd).length;
  const noSprint = rows.filter(r => !r.cpiArt.sprint).length;

  addSection('A. Overall Totals', [
    ['CPI ARTs', total],
    ['In Development+', inDev],
    ['Complete / Done', done],
    ['Incomplete (issues found)', inc],
    ['Stream ARTs linked', withStream],
    ['YOUR_JIRA_PROJECT Stories', stories.length],
    ['No PDD', noPdd],
    ['No Sprint', noSprint],
  ]);

  const cpiIssueTypes = [
    'Missing Release','Missing Component','Missing Assignee','Missing INT-CPI Label',
    'Missing Stream Mapping','Missing YOUR_JIRA_PROJECT Mapping','Missing PDD',
    'Comment Not Updated','Status Mismatch',
  ];
  addSection('B. CPI Incompleteness Breakdown',
    cpiIssueTypes.map(t => [t, rows.filter(r => r.cpiInc.includes(t)).length])
  );

  const streamIssueTypes = [
    'Missing Stream ART','Missing BGL or TGL','Missing Commitment',
    'Missing Owner','Missing Release','Missing PDD','Status Mismatch',
  ];
  addSection('C. Stream Incompleteness Breakdown',
    streamIssueTypes.map(t => [t, rows.filter(r => r.streamInc.includes(t)).length])
  );

  const green = rows.filter(r => r.health === 'Green').length;
  const amber = rows.filter(r => r.health === 'Amber').length;
  const red   = rows.filter(r => r.health === 'Red').length;
  addSection('H. Health Summary', [
    ['🟢 Green', green],
    ['🟡 Amber', amber],
    ['🔴 Red',   red],
  ]);

  ws.getRow(1).height = 28;
}

// ── SHEET 2: MASTER_REPORT ────────────────────────────────────────────────

function buildMasterReport(wb: ExcelJS.Workbook, rows: GovernanceRow[], today: Date) {
  const ws = wb.addWorksheet('MASTER_REPORT');
  ws.properties.tabColor = { argb: C.darkBlue };
  setupSheet(ws);

  const headers = [
    // Stream
    ['Stream ART', C.stream.header, true], ['Stream Commitment', C.stream.header, false],
    ['Stream Status', C.stream.header, false], ['Stream Owner', C.stream.header, false],
    ['Stream BGL', C.stream.header, false], ['Stream TGL', C.stream.header, false],
    ['Stream PDD', C.stream.header, false], ['Stream Last Comment', C.stream.header, false],
    // CPI
    ['CPI ART', C.cpi.header, true], ['CPI Commitment', C.cpi.header, false],
    ['CPI Status', C.cpi.header, false], ['CPI Release', C.cpi.header, false],
    ['CPI Owner', C.cpi.header, false], ['CPI Summary', C.cpi.header, false],
    ['CPI Sprint', C.cpi.header, false], ['CPI PDD', C.cpi.header, false],
    ['CPI Last Comment', C.cpi.header, false], ['CPI Comment Date', C.cpi.header, false],
    // YOUR_JIRA_PROJECT
    ['YOUR_JIRA_PROJECT Story', C..header, true], ['YOUR_JIRA_PROJECT Summary', C..header, false],
    ['YOUR_JIRA_PROJECT Owner', C..header, false], ['YOUR_JIRA_PROJECT Status', C..header, false],
    ['YOUR_JIRA_PROJECT Sprint', C..header, false],
    // Comment/PDD
    ['Story PDD', C.comment.header, true], ['Story Last Comment', C.comment.header, false],
    ['Story Comment Date', C.comment.header, false], ['Story 24Hr', C.comment.header, false],
    // Incompleteness
    ['Stream Incompleteness', C.inc.header, true], ['CPI Incompleteness', C.inc.header, false],
    // Milestone/Health
    ['Milestone', C.mile.header, true], ['Health', C.mile.header, false],
  ];

  const headerRow = ws.addRow(headers.map(h => h[0]));
  headerRow.height = 20;
  headers.forEach(([, color, grpBorder], i) => {
    headerCell(headerRow.getCell(i + 1), headers[i][0] as string, color as string, grpBorder as boolean);
  });

  ws.columns = headers.map(() => ({ width: 18 }));
  ws.columns[13].width = 35; // CPI Summary
  ws.columns[19].width = 35; // YOUR_JIRA_PROJECT Summary
  ws.columns[24].width = 30; // Story Last Comment
  ws.columns[27].width = 30; // Stream Inc
  ws.columns[28].width = 30; // CPI Inc

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: `AF1` };

  let rowIdx = 2;
  for (const row of rows) {
    const { cpiArt: art, streamArt, stories, milestone, health, cpiInc, streamInc } = row;
    const rowData = stories.length > 0 ? stories : [null];

    for (const story of rowData) {
      const r = ws.addRow([
        streamArt?.key ?? '', streamArt?.commit ?? '', streamArt?.status ?? '',
        streamArt?.assignee ?? '', streamArt?.bgl ?? '', streamArt?.tgl ?? '',
        streamArt?.pdd ?? '', streamArt?.lastComment.text.slice(0, 100) ?? '',
        art.key, art.commit, art.status, art.release, art.assignee,
        art.summary, art.sprint, art.pdd, art.lastComment.text.slice(0, 100),
        art.lastComment.date,
        story?.key ?? '', story?.summary ?? '', story?.assignee ?? '',
        story?.status ?? '', story?.sprint ?? '',
        story?.pdd ?? '', story?.lastComment.text.slice(0, 100) ?? '',
        story?.lastComment.date ?? '', story?.lastComment.has24h ?? '',
        streamInc.join('; '), cpiInc.join('; '),
        milestone, health,
      ]);
      r.height = 20;
      const bg = rowIdx % 2 === 0 ? C.alt : C.white;
      r.eachCell(c => { if (!c.fill || (c.fill as ExcelJS.FillPattern).fgColor?.argb === C.white) c.fill = fill(bg); });
      // Health colour
      const healthCell = r.getCell(32);
      healthCell.fill = fill(healthColor(health));
      rowIdx++;
    }
  }
}

// ── SHEET 3: Incompleteness Check ─────────────────────────────────────────

function buildIncompleteness(wb: ExcelJS.Workbook, rows: GovernanceRow[], ts: string) {
  const ws = wb.addWorksheet('Incompleteness Check');
  ws.properties.tabColor = { argb: 'FFC00000' };
  setupSheet(ws);

  const title = ws.addRow(['CPI ART Governance — Incompleteness Check']);
  title.getCell(1).fill = fill(C.navy);
  title.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: C.white } };
  title.height = 28;
  ws.mergeCells('A1:P1');

  const note = ws.addRow(['Dev & Comment checks: In Dev/Dev Completed/Done only | Stream Commitment from live labels | PDD: DD/MON/YYYY']);
  note.getCell(1).fill = fill(C.amber.bg);
  note.getCell(1).font = { name: 'Calibri', size: 9, italic: true };
  note.height = 14;
  ws.mergeCells('A2:P2');

  const hdrs: [string, string, boolean][] = [
    ['Stream ART', C.stream.header, true], ['Stream Status', C.stream.header, false],
    ['Stream Commitment', C.stream.header, false],
    ['CPI ART ID', C.cpi.header, true], ['CPI Summary', C.cpi.header, false],
    ['CPI Commitment', C.cpi.header, false], ['CPI Release', C.cpi.header, false],
    ['CPI Owner', C.cpi.header, false], ['CPI Status', C.cpi.header, false],
    ['Component', C.cpi.header, false], ['INT-CPI', C.cpi.header, false], ['CPI PDD', C.cpi.header, false],
    ['YOUR_JIRA_PROJECT Mapping', C..header, true], ['Story Count', C..header, false],
    ['Stream Incompleteness', C.inc.header, true], ['CPI Incompleteness', C.inc.header, false],
    ['Health', C.mile.header, true],
  ];

  const hRow = ws.addRow(hdrs.map(h => h[0]));
  hRow.height = 20;
  hdrs.forEach(([, color, gb], i) => headerCell(hRow.getCell(i + 1), hdrs[i][0], color, gb));
  ws.views = [{ state: 'frozen', ySplit: 3 }];
  ws.autoFilter = { from: 'A3', to: `Q3` };

  rows.forEach(({ cpiArt, streamArt, stories, health, cpiInc, streamInc }, idx) => {
    const r = ws.addRow([
      streamArt?.key ?? '', streamArt?.status ?? '', streamArt?.commit ?? '',
      cpiArt.key, cpiArt.summary, cpiArt.commit, cpiArt.release,
      cpiArt.assignee, cpiArt.status, cpiArt.component, cpiArt.intCpi, cpiArt.pdd,
      stories.map(s => s.key).join(', ') || '—', stories.length,
      streamInc.join('; ') || '✓', cpiInc.join('; ') || '✓',
      health,
    ]);
    r.height = 20;
    const issueCount = cpiInc.length + streamInc.length;
    const bg = issueCount === 0 ? C.green.bg : issueCount <= 2 ? C.amber.bg : C.red.bg;
    r.getCell(17).fill = fill(bg);
  });
}

// ── SHEET 4: ART-YOUR_JIRA_PROJECT Mapping ────────────────────────────────────────

function buildArtMapping(wb: ExcelJS.Workbook, rows: GovernanceRow[], today: Date) {
  const ws = wb.addWorksheet('ART-YOUR_JIRA_PROJECT Mapping');
  ws.properties.tabColor = { argb: C.darkBlue };
  setupSheet(ws);

  const hdrs: [string, string, boolean][] = [
    ['Stream ART ID', C.stream.header, true], ['Stream Summary', C.stream.header, false],
    ['Stream Owner', C.stream.header, false], ['Stream Release', C.stream.header, false],
    ['Stream Status', C.stream.header, false], ['Stream Commitment', C.stream.header, false],
    ['CPI ART ID', C.cpi.header, true], ['CPI Summary', C.cpi.header, false],
    ['CPI Owner', C.cpi.header, false], ['CPI Release', C.cpi.header, false],
    ['CPI Status', C.cpi.header, false], ['CPI Commitment', C.cpi.header, false],
    ['YOUR_JIRA_PROJECT Story', C..header, true], ['YOUR_JIRA_PROJECT Summary', C..header, false],
    ['YOUR_JIRA_PROJECT Owner', C..header, false], ['YOUR_JIRA_PROJECT Release', C..header, false],
    ['YOUR_JIRA_PROJECT Status', C..header, false],
    ['Story PDD', C.comment.header, true], ['Last Comment', C.comment.header, false],
    ['Commented By', C.comment.header, false], ['Comment Date', C.comment.header, false],
    ['24Hr', C.comment.header, false],
  ];

  const hRow = ws.addRow(hdrs.map(h => h[0]));
  hRow.height = 20;
  hdrs.forEach(([, c, gb], i) => headerCell(hRow.getCell(i + 1), hdrs[i][0], c, gb));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: 'V1' };

  rows.forEach(({ cpiArt, streamArt, stories }) => {
    const storyList = stories.length > 0 ? stories : [null];
    storyList.forEach((story, si) => {
      ws.addRow([
        streamArt?.key ?? '', streamArt?.summary ?? '', streamArt?.assignee ?? '',
        streamArt?.release ?? '', streamArt?.status ?? '', streamArt?.commit ?? '',
        cpiArt.key, cpiArt.summary, cpiArt.assignee, cpiArt.release, cpiArt.status, cpiArt.commit,
        story?.key ?? '', story?.summary ?? '', story?.assignee ?? '',
        story?.release ?? '', story?.status ?? '',
        story?.pdd ?? '', story?.lastComment.text.slice(0, 100) ?? '',
        story?.lastComment.by ?? '', story?.lastComment.date ?? '',
        story?.lastComment.has24h ?? '',
      ]).height = 20;
    });
  });
}

// ── SHEETS 5+: Release sheets ──────────────────────────────────────────────

const RELEASE_TAB_COLORS = [
  'FF1565C0','FF1F4E79','FF0D47A1','FF006064','FF4A148C',
  'FF880E4F','FF37474F','FF1B5E20','FF4E342E','FF424242',
];

function buildReleaseSheets(wb: ExcelJS.Workbook, rows: GovernanceRow[], ts: string, today: Date) {
  const releases = [...new Set(rows.map(r => r.cpiArt.release || 'No_Release'))];
  const sorted   = sortReleases(releases.filter(r => r !== 'No_Release'));
  if (releases.includes('No_Release')) sorted.push('No_Release');

  sorted.forEach((release, idx) => {
    const sheetName = release.replace(/\./g, '_');
    const ws = wb.addWorksheet(sheetName);
    ws.properties.tabColor = { argb: RELEASE_TAB_COLORS[idx % RELEASE_TAB_COLORS.length] };
    setupSheet(ws);

    const title = ws.addRow([`${release} — Integration Stories Hierarchy`]);
    title.getCell(1).fill = fill(C.navy);
    title.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: C.white } };
    title.height = 28;
    ws.mergeCells(`A1:O1`);

    const filtered = rows.filter(r => (r.cpiArt.release || 'No_Release') === release);
    const sub = ws.addRow([`${filtered.length} ARTs | ${filtered.flatMap(r => r.stories).length} stories | Generated: ${ts}`]);
    sub.getCell(1).fill = fill('FFEBF3FB');
    sub.height = 14;
    ws.mergeCells(`A2:O2`);

    const hdrs: [string, string, boolean][] = [
      ['Story ID (Tree)', C.cpi.header, true], ['Summary', C.cpi.header, false],
      ['Owner', C.cpi.header, false], ['Release', C.cpi.header, false],
      ['Status', C.cpi.header, false], ['Stream Commitment', C.stream.header, true],
      ['CPI Commitment', C.cpi.header, false],
      ['Sprint', C..header, true], ['Suggested Sprint', C..header, false],
      ['PDD', C.comment.header, true], ['Last Comment', C.comment.header, false],
      ['Commented By', C.comment.header, false], ['Comment Date', C.comment.header, false],
      ['24Hr', C.comment.header, false], ['Milestone', C.mile.header, true],
    ];
    const hRow = ws.addRow(hdrs.map(h => h[0]));
    hRow.height = 20;
    hdrs.forEach(([, c, gb], i) => headerCell(hRow.getCell(i + 1), hdrs[i][0], c, gb));
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    ws.autoFilter = { from: 'A3', to: 'O3' };

    filtered.forEach(({ cpiArt, streamArt, stories, milestone }) => {
      // CPI ART row
      const artRow = ws.addRow([
        `  ${cpiArt.key}`, cpiArt.summary, cpiArt.assignee, cpiArt.release,
        cpiArt.status, streamArt?.commit ?? '', cpiArt.commit,
        cpiArt.sprint, '', cpiArt.pdd, '', '', '', '', milestone,
      ]);
      artRow.height = 20;
      artRow.eachCell(c => c.fill = fill(C.navy));
      artRow.eachCell(c => c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } });
      artRow.outlineLevel = 0;

      stories.forEach((story, si) => {
        const isLast = si === stories.length - 1;
        const r = ws.addRow([
          `  |  ${isLast ? '└' : '├'}── ${story.key}`,
          story.summary, story.assignee, story.release, story.status,
          streamArt?.commit ?? '', cpiArt.commit, story.sprint, '',
          story.pdd, story.lastComment.text.slice(0, 100),
          story.lastComment.by, story.lastComment.date, story.lastComment.has24h, '',
        ]);
        r.height = 20;
        r.outlineLevel = 1;
        r.eachCell(c => c.fill = fill(si % 2 === 0 ? 'FFEBF3FB' : C.white));
        const days = story.lastComment.daysAgo;
        r.getCell(14).fill = fill(days <= 1 ? C.green.bg : days <= 7 ? C.green.bg : days <= 14 ? C.amber.bg : C.red.bg);
      });
    });
  });
}

// ── Max Attention ─────────────────────────────────────────────────────────

function buildMaxAttention(wb: ExcelJS.Workbook, rows: GovernanceRow[], today: Date, ts: string) {
  const ws = wb.addWorksheet('Max Attention Stories');
  ws.properties.tabColor = { argb: 'FFB33000' };
  setupSheet(ws);

  const title = ws.addRow(['Max Attention Stories — CPI ART Governance']);
  title.getCell(1).fill = fill('FFB33000');
  title.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: C.white } };
  title.height = 28;

  const maRows = rows.filter(r =>
    r.cpiArt.labels.some(l => l.toLowerCase().includes('maxattention')) ||
    r.cpiArt.summary.toLowerCase().includes('max attention') ||
    r.stories.some(s => s.labels.some(l => l.toLowerCase().includes('maxattention')))
  );

  const hRow = ws.addRow(['CPI ART', 'CPI Summary', 'CPI Status', 'CPI Owner', 'Stream ART',
    'Stream Status', 'YOUR_JIRA_PROJECT Story', 'Story Summary', 'Story Status', 'PDD', 'Last Comment',
    'Comment Date', 'MA Type', 'Health']);
  hRow.height = 20;
  hRow.eachCell((c, i) => headerCell(c, hRow.getCell(i).value as string, 'FFB33000'));
  ws.views = [{ state: 'frozen', ySplit: 2 }];

  maRows.forEach(({ cpiArt, streamArt, stories, health }) => {
    const maType = cpiArt.labels.some(l => l.toLowerCase().includes('maxattention'))
      ? 'ART is MaxAttention'
      : 'Child story MaxAttention';
    const storyList = stories.length > 0 ? stories : [null];
    storyList.forEach(story => {
      ws.addRow([
        cpiArt.key, cpiArt.summary, cpiArt.status, cpiArt.assignee,
        streamArt?.key ?? '', streamArt?.status ?? '',
        story?.key ?? '', story?.summary ?? '', story?.status ?? '',
        story?.pdd ?? cpiArt.pdd,
        story?.lastComment.text.slice(0, 100) ?? cpiArt.lastComment.text.slice(0, 100),
        story?.lastComment.date ?? cpiArt.lastComment.date,
        maType, health,
      ]).height = 20;
    });
  });
}

// ── Raw Data ──────────────────────────────────────────────────────────────

function buildRawData(wb: ExcelJS.Workbook, rows: GovernanceRow[], today: Date, ts: string) {
  const ws = wb.addWorksheet('Raw Data');
  ws.properties.tabColor = { argb: 'FF607D8B' };
  setupSheet(ws);

  const hRow = ws.addRow([
    'Stream ART','Stream Status','Stream Commitment','Stream BGL','Stream TGL',
    'Stream Sprint','Stream PDD','Stream Last Comment','Stream Commented By','Stream Comment Date',
    'CPI ART ID','Summary','Status','Status Category','Release','CPI Commitment',
    'Owner','Component','Created By','Sprint','PDD','CPI Last Comment',
    'CPI Commented By','CPI Comment Date','CPI 24Hr','INT-CPI Label','BGL','TGL',
    'Labels','Updated','YOUR_JIRA_PROJECT Count','Story Keys','Milestone','Health',
    'Issues Count','CPI Incompleteness',
  ]);
  hRow.height = 20;
  hRow.eachCell(c => {
    c.fill = fill('FF37474F');
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: 'AJ1' };

  rows.forEach(({ cpiArt, streamArt, stories, milestone, health, cpiInc }, i) => {
    const r = ws.addRow([
      streamArt?.key ?? '', streamArt?.status ?? '', streamArt?.commit ?? '',
      streamArt?.bgl ?? '', streamArt?.tgl ?? '', streamArt?.sprint ?? '',
      streamArt?.pdd ?? '', streamArt?.lastComment.text.slice(0, 100) ?? '',
      streamArt?.lastComment.by ?? '', streamArt?.lastComment.date ?? '',
      cpiArt.key, cpiArt.summary, cpiArt.status, cpiArt.statusCat,
      cpiArt.release, cpiArt.commit, cpiArt.assignee, cpiArt.component,
      cpiArt.reporter, cpiArt.sprint, cpiArt.pdd,
      cpiArt.lastComment.text.slice(0, 100), cpiArt.lastComment.by,
      cpiArt.lastComment.date, cpiArt.lastComment.has24h,
      cpiArt.intCpi, cpiArt.bgl, cpiArt.tgl, cpiArt.labels.join(', '), cpiArt.updated,
      stories.length, stories.map(s => s.key).join(', '),
      milestone, health, cpiInc.length, cpiInc.join('; '),
    ]);
    r.height = 20;
    r.eachCell(c => c.fill = fill(i % 2 === 0 ? 'FAFAFAFA' : C.white));
    r.getCell(34).fill = fill(healthColor(health));
  });
}

// ── Intelligence Signals ──────────────────────────────────────────────────

function buildIntelligenceSignals(wb: ExcelJS.Workbook, rows: GovernanceRow[], today: Date, ts: string) {
  const ws = wb.addWorksheet('Intelligence Signals');
  ws.properties.tabColor = { argb: 'FF4A148C' };
  setupSheet(ws);

  const title = ws.addRow(['CPI ART — Intelligence Signals']);
  title.getCell(1).fill = fill('FF4A148C');
  title.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: C.white } };
  title.height = 28;
  ws.mergeCells('A1:T1');

  const note = ws.addRow(['Signals auto-generated from live Jira data. Done ARTs: only STORIES NOT CLOSED checked.']);
  note.getCell(1).fill = fill(C.amber.bg);
  note.height = 14;
  ws.mergeCells('A2:T2');

  const hRow = ws.addRow([
    'CPI ART','CPI Summary','CPI Owner','Release','CPI Status','Commitment',
    'Milestone','Completion %','PDD','Days to PDD',
    'Signal Type','Signal Detail','Urgency',
    'Story Key','Story Summary','Story Status','Story Last Comment',
    'Story Commented By','Story Comment Date','Story Days Since',
  ]);
  hRow.height = 20;
  hRow.eachCell(c => {
    c.fill = fill('FF4A148C');
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } };
  });
  ws.views = [{ state: 'frozen', ySplit: 3 }];
  ws.autoFilter = { from: 'A3', to: 'T3' };

  let rowIdx = 0;
  rows.forEach(({ cpiArt, streamArt, stories, milestone }) => {
    const signals = intelligenceSignals(cpiArt, streamArt, stories, today);
    if (signals.length === 0) return;

    const done    = stories.filter(s => STORY_CLOSED_STATUSES.has(s.status)).length;
    const pct     = stories.length > 0 ? Math.round((done / stories.length) * 100) : 0;
    const pddDate = parsePDD(cpiArt.pdd);
    const daysLeft= pddDate ? Math.floor((pddDate.getTime() - today.getTime()) / 86400000) : null;

    signals.forEach(sig => {
      const r = ws.addRow([
        cpiArt.key, cpiArt.summary, cpiArt.assignee, cpiArt.release,
        cpiArt.status, cpiArt.commit, milestone, `${pct}%`,
        cpiArt.pdd, daysLeft !== null ? daysLeft : 'N/A',
        sig.type, sig.detail, sig.urgency,
        sig.story?.key ?? '', sig.story?.summary ?? '', sig.story?.status ?? '',
        sig.story?.lastComment.text.slice(0, 100) ?? '',
        sig.story?.lastComment.by ?? '', sig.story?.lastComment.date ?? '',
        sig.story?.lastComment.daysAgo ?? '',
      ]);
      r.height = 20;
      const urgCell = r.getCell(13);
      urgCell.fill = fill(sig.urgency === 'Red' ? C.red.bg : sig.urgency === 'Amber' ? C.amber.bg : C.green.bg);
      rowIdx++;
    });
  });
}

// ── Stream Action Register ────────────────────────────────────────────────

function buildStreamActionRegister(wb: ExcelJS.Workbook, rows: GovernanceRow[], today: Date, ts: string) {
  const ws = wb.addWorksheet('Stream Action Register');
  ws.properties.tabColor = { argb: 'FFE65100' };
  setupSheet(ws);

  const title = ws.addRow(['Stream Action Register — CPI ART Governance']);
  title.getCell(1).fill = fill('FFE65100');
  title.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: C.white } };
  title.height = 28;
  ws.mergeCells('A1:R1');

  const note = ws.addRow(['✗ iFlow: CPI ART only  ✗ Sprint: YOUR_JIRA_PROJECT only  |  1 row per CPI ART  |  Red actions first']);
  note.getCell(1).fill = fill('FFFFF3E0');
  note.height = 14;
  ws.mergeCells('A2:R2');

  const hRow = ws.addRow([
    'CPI ART','CPI Summary','CPI Owner','CPI Release','CPI Status','CPI Commitment',
    'Stream ART','Stream Owner','Stream Status','Stream Commitment','Stream Release',
    'Stream PDD','Stream BGL','Stream TGL','Days Since Update',
    'Action Count','Overall Urgency','All Actions','📋 Copy-Paste Message',
  ]);
  hRow.height = 20;
  hRow.eachCell(c => {
    c.fill = fill('FFE65100');
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } };
  });
  ws.views = [{ state: 'frozen', ySplit: 3 }];
  ws.autoFilter = { from: 'A3', to: 'S3' };

  const actionRows: { row: GovernanceRow; actions: ReturnType<typeof deriveStreamActions>; urgency: string }[] = [];

  rows.forEach(row => {
    const actions = deriveStreamActions(row.cpiArt, row.streamArt, row.stories);
    if (actions.length === 0) return;
    const urgency = actions.some(a => a.urgency === 'Red') ? 'Red' : 'Amber';
    actionRows.push({ row, actions, urgency });
  });

  // Sort: Red first, then by CPI owner
  actionRows.sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency === 'Red' ? -1 : 1;
    return a.row.cpiArt.assignee.localeCompare(b.row.cpiArt.assignee);
  });

  actionRows.forEach(({ row: { cpiArt, streamArt }, actions, urgency }, idx) => {
    const days = streamArt?.lastComment.daysAgo ?? 999;
    const allActions = actions.map((a, i) => `${i + 1}. [${a.urgency}] ${a.action} → ${a.detail}`).join('\n');
    const msg = `Hi Team, Please action the following for CPI ART ${cpiArt.key} — ${cpiArt.summary}:\n${
      actions.map((a, i) => `${i + 1}. [${a.urgency === 'Red' ? '🚨' : '⚠️'} ${a.urgency}] ${a.action}\n   ${a.detail}\n   → Escalate to: ${a.escalateTo}`).join('\n')
    }\nStream ART: ${streamArt?.key ?? 'None'}\nCPI Owner: ${cpiArt.assignee} | Stream Owner: ${streamArt?.assignee ?? '—'}\nGenerated: ${ts}`;

    const r = ws.addRow([
      cpiArt.key, cpiArt.summary, cpiArt.assignee, cpiArt.release, cpiArt.status, cpiArt.commit,
      streamArt?.key ?? '', streamArt?.assignee ?? '', streamArt?.status ?? '',
      streamArt?.commit ?? '', streamArt?.release ?? '', streamArt?.pdd ?? '',
      streamArt?.bgl ?? '', streamArt?.tgl ?? '',
      days < 999 ? days : 'Never',
      actions.length, urgency, allActions, msg,
    ]);
    r.height = 20;
    r.getCell(17).fill = fill(urgency === 'Red' ? C.red.bg : C.amber.bg);
    r.getCell(19).fill = fill('FF006400');
    r.getCell(19).font = { name: 'Calibri', size: 10, color: { argb: C.white } };
    r.getCell(18).alignment = { wrapText: true, vertical: 'top' };
    r.getCell(19).alignment = { wrapText: true, vertical: 'top' };
  });
}

// ── Orphan CPI Stories ────────────────────────────────────────────────────

function buildOrphanSheet(wb: ExcelJS.Workbook, orphans: ParsedStory[], today: Date, ts: string) {
  const ws = wb.addWorksheet('Orphan CPI Stories');
  ws.properties.tabColor = { argb: 'FF6A0572' };
  setupSheet(ws);

  const title = ws.addRow(['Orphan CPI Stories — No Parent YOUR_JIRA_PROJECT Link']);
  title.getCell(1).fill = fill('FF6A0572');
  title.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: C.white } };
  title.height = 28;
  ws.mergeCells('A1:Q1');

  const note = ws.addRow(['RICEFW + (INT-CPI|YOUR-TEAM-LABEL|Interface_Build|IF_Type_CPI) + no YOUR_JIRA_PROJECT parent link']);
  note.getCell(1).fill = fill('FFE8EAF6');
  note.height = 14;
  ws.mergeCells('A2:Q2');

  const stats = ws.addRow([`Total orphans: ${orphans.length} | Generated: ${ts}`]);
  stats.height = 14;
  ws.mergeCells('A3:Q3');

  const hRow = ws.addRow([
    'Story ID','Summary','Status','Owner','Reporter',
    'Release','Component','Sprint','PDD','Qualifying Labels','All Labels',
    'Last Comment','Commented By','Comment Date','Days Since','24Hr',
    'Orphan Type','Suggested Action',
  ]);
  hRow.height = 20;
  hRow.eachCell(c => {
    c.fill = fill('FF6A0572');
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } };
  });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.autoFilter = { from: 'A4', to: 'R4' };

  // Sort: no-parent first
  const sorted = [...orphans].sort((a, b) => {
    const { type: ta } = isOrphan(a);
    const { type: tb } = isOrphan(b);
    if (ta.includes('No Parent') && !tb.includes('No Parent')) return -1;
    if (!ta.includes('No Parent') && tb.includes('No Parent')) return 1;
    return a.key.localeCompare(b.key);
  });

  sorted.forEach((story, i) => {
    const { type: orphanType } = isOrphan(story);
    const qualifying = story.labels.filter(l =>
      ['RICEFW','INT-CPI','YOUR-TEAM-LABEL','Interface_Build','IF_Type_CPI'].includes(l)
    ).join(', ');
    const action = orphanType.includes('No Parent')
      ? `Link to an YOUR_JIRA_PROJECT-XXXX feature or raise with ${story.assignee}`
      : `Verify parent ART is correct — current parent is not YOUR_JIRA_PROJECT`;

    const r = ws.addRow([
      story.key, story.summary, story.status, story.assignee, story.reporter,
      story.release, story.component, story.sprint, story.pdd,
      qualifying, story.labels.join(', '),
      story.lastComment.text.slice(0, 100), story.lastComment.by,
      story.lastComment.date, story.lastComment.daysAgo < 999 ? story.lastComment.daysAgo : 'Never',
      story.lastComment.has24h, orphanType, action,
    ]);
    r.height = 20;
    r.getCell(17).fill = fill(orphanType.includes('No Parent') ? C.red.bg : C.amber.bg);
    const days = story.lastComment.daysAgo;
    r.getCell(15).fill = fill(daysColor(days));
    r.eachCell((c, ci) => {
      if (ci !== 17 && ci !== 15) c.fill = fill(i % 2 === 0 ? 'FFEBF3FB' : C.white);
    });
  });
}
