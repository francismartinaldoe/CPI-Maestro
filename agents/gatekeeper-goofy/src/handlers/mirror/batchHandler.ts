// handlers/mirror/batchHandler.ts — batch_compare watchlist handler

import * as fs from 'fs';
import * as path from 'path';
import { runCompass, mirrorDriftLabel } from '../../modes/compassEngine';
import { Environment } from '../../types';
import { END_MENU } from '../shared/menus';

export async function handleBatchCompare(args: {
  sourceEnv?: 'DEV' | 'TEST' | 'PROD';
  targetEnv?: 'DEV' | 'TEST' | 'PROD';
}) {
  const watchlistPath = path.join(process.cwd(), 'iflow-watchlist.json');
  if (!fs.existsSync(watchlistPath)) {
    return { content: [{ type: 'text', text: '❌ `iflow-watchlist.json` not found. Create it in the project root with a list of iFlows to compare.' }] };
  }

  const watchlist = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8')) as {
    defaultSource: string; defaultTarget: string;
    iflows: Array<{ id: string; name: string; package?: string; notes?: string }>;
  };

  const srcEnv: Environment = (args.sourceEnv ?? watchlist.defaultSource ?? 'DEV') as Environment;
  const tgtEnv: Environment = (args.targetEnv ?? watchlist.defaultTarget ?? 'TEST') as Environment;

  if (!watchlist.iflows?.length) {
    return { content: [{ type: 'text', text: '❌ No iFlows found in `iflow-watchlist.json`. Add entries to the `iflows` array.' }] };
  }

  const lines: string[] = [
    `## 🟣 Batch MIRROR — ${srcEnv} → ${tgtEnv}`,
    `Running comparison for **${watchlist.iflows.length}** iFlow(s) from watchlist...`,
    '',
  ];

  const allReports = [];
  const summaryRows: Array<{ name: string; label: string; match: number; drift: number; missing: number; extra: number }> = [];

  for (let i = 0; i < watchlist.iflows.length; i++) {
    const entry = watchlist.iflows[i];
    lines.push(`⏳ [${i + 1}/${watchlist.iflows.length}] Comparing \`${entry.name}\`...`);

    try {
      const report = await runCompass(
        [{ id: entry.id, name: entry.name }], srcEnv, tgtEnv, {}
      );
      const r     = report.results[0];
      const label = mirrorDriftLabel(r.diffs);
      const cnt   = { MATCH: 0, DRIFT: 0, MISSING: 0, EXTRA: 0 };
      r.diffs.forEach((d) => { cnt[d.verdict as keyof typeof cnt]++; });
      const icon  = label === 'IN SYNC' ? '🟢' : label === 'DRIFT' ? '🟡' : '🔴';
      lines.push(`${icon} [${i + 1}/${watchlist.iflows.length}] ${label} — ${r.driftCount} diff(s)`);
      allReports.push(report);
      summaryRows.push({ name: entry.name, label, match: cnt.MATCH, drift: cnt.DRIFT, missing: cnt.MISSING, extra: cnt.EXTRA });
    } catch (err) {
      lines.push(`❌ [${i + 1}/${watchlist.iflows.length}] ERROR: ${(err as Error).message}`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push(`## 🏁 Batch Complete — ${srcEnv} ↔ ${tgtEnv}`);
  lines.push('');
  lines.push(`| iFlow | ✅ Match | ⚠️ Drift | ❌ Missing | ➕ Extra | Verdict |`);
  lines.push(`|-------|---------|---------|----------|---------|---------|`);
  summaryRows.forEach((r) => {
    const badge = r.label === 'IN SYNC' ? '🟢 IN SYNC' : r.label === 'DRIFT' ? '🟡 DRIFT' : '🔴 INCOMPLETE';
    lines.push(`| ${r.name} | ${r.match} | ${r.drift} | ${r.missing} | ${r.extra} | ${badge} |`);
  });

  if (allReports.length > 0) {
    try {
      // report generation removed
    } catch (err) {
      lines.push(`⚠️ Report generation failed: ${(err as Error).message}`);
    }
  }

  lines.push(END_MENU);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
