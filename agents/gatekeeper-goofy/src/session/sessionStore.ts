// session/sessionStore.ts
// In-memory session that lives for the lifetime of the MCP server process.
// Context is retained across all tool calls within the same chat window session.
// It is lost only when the server process exits (i.e. the chat window is closed).

import { SpotCheckReport } from '../types';

export interface SessionEntry {
  runId: string;
  iflowId: string;
  iflowName: string;
  packageId: string;
  environment: string;
  deployedOn: string;
  overallStatus: string;
  summary: SpotCheckReport['summary'];
  triggeredAt: string;
  pptxPath?: string;
  jsonPath?: string;
  checks: SpotCheckReport['checks'];
}

export interface SpotCheckCriteria {
  iflowNameFilter?: string;
  deployedAfter?: string;
}

export interface PendingCandidate {
  id: string;
  name: string;
  status: string;
  deployedOn: string;
  version: string;
  packageId?: string;
}

// Credential set for a single environment (used by MIRROR mode)
export interface EnvCredentials {
  tenantUrl:    string;
  tokenUrl:     string;
  clientId:     string;
  clientSecret: string;
}

class SessionStore {
  private runs: SessionEntry[] = [];
  private lastIflowId = '';
  private lastPackageId = '';
  private lastEnvironment = '';

  // ── GUARDIAN flow state ──────────────────────────────────────────────
  pendingCriteria: SpotCheckCriteria | null = null;
  pendingCandidates: PendingCandidate[] = [];
  pendingEnvironment: 'DEV' | 'TEST' | 'PROD' | null = null;
  guardianStep: number = 0;   // 1=env, 2=creds, 3=scope, 4=execute

  // ── MIRROR flow state ────────────────────────────────────────────────
  mirrorSourceEnv: 'DEV' | 'TEST' | 'PROD' | null = null;
  mirrorTargetEnv: 'DEV' | 'TEST' | 'PROD' | null = null;
  mirrorSourceCreds: EnvCredentials | null = null;
  mirrorTargetCreds: EnvCredentials | null = null;
  mirrorCandidates: PendingCandidate[] = [];
  mirrorStep: number = 0;     // 1=src env, 2=tgt env, 3=src creds, 4=tgt creds, 5=scope, 6=execute

  // ── Mode ─────────────────────────────────────────────────────────────
  currentMode: 'GUARDIAN' | 'MIRROR' | null = null;

  addRun(entry: SessionEntry): void {
    this.runs.push(entry);
    this.lastIflowId = entry.iflowId;
    this.lastPackageId = entry.packageId;
    this.lastEnvironment = entry.environment;
    this.pendingCriteria = null;
    this.pendingCandidates = [];
  }

  getRuns(): SessionEntry[] { return this.runs; }
  getLastRun(): SessionEntry | null { return this.runs[this.runs.length - 1] ?? null; }

  getLastContext(): { iflowId: string; packageId: string; environment: string } {
    return { iflowId: this.lastIflowId, packageId: this.lastPackageId, environment: this.lastEnvironment };
  }

  resetMirror(): void {
    this.mirrorSourceEnv   = null;
    this.mirrorTargetEnv   = null;
    this.mirrorSourceCreds = null;
    this.mirrorTargetCreds = null;
    this.mirrorCandidates  = [];
    this.mirrorStep        = 0;
  }

  resetGuardian(): void {
    this.pendingEnvironment = null;
    this.pendingCandidates  = [];
    this.pendingCriteria    = null;
    this.guardianStep       = 0;
  }

  clear(): void {
    this.runs = [];
    this.lastIflowId = '';
    this.lastPackageId = '';
    this.lastEnvironment = '';
    this.currentMode = null;
    this.resetGuardian();
    this.resetMirror();
  }

  summarise(): string {
    if (this.runs.length === 0) return 'No spot-checks have been run in this session.';

    const lines: string[] = [
      `**Session Context** — ${this.runs.length} run(s) this session`,
      '',
      '| # | iFlow | Env | Status | Time |',
      '|---|-------|-----|--------|------|',
    ];

    this.runs.forEach((r, i) => {
      const icon = r.overallStatus === 'PASS' ? '✅' : r.overallStatus === 'WARN' ? '⚠️' : '❌';
      lines.push(`| ${i + 1} | ${r.iflowName} | ${r.environment} | ${icon} ${r.overallStatus} | ${r.triggeredAt.slice(0, 19).replace('T', ' ')} |`);
    });

    const last = this.getLastRun()!;
    lines.push('');
    lines.push(`**Last run:** \`${last.runId}\` — ${last.iflowName} (${last.environment})`);
    lines.push(`✅ ${last.summary.pass} PASS  ⚠️ ${last.summary.warn} WARN  ❌ ${last.summary.fail} FAIL  ⏭️ ${last.summary.skip} SKIP`);
    if (last.pptxPath) lines.push(`📊 PPTX: \`${last.pptxPath}\``);
    if (last.jsonPath) lines.push(`📄 Excel: \`${last.jsonPath}\``);

    return lines.join('\n');
  }
}

export const session = new SessionStore();

