// src/orchestrator/contextManager.ts — Maintains rolling conversation state
// Extracts and persists entities (iFlow names, environments, scripts) across turns.

import type { SessionContext, ConversationTurn, AgentTarget } from './types.js';

const ENV_PATTERN     = /\b(DEV|TEST|PROD)\b/i;
const IFLOW_PATTERN   = /\b([A-Za-z][A-Za-z0-9_]{3,}(?:Flow|iFlow|Integration|Process|Replication|Sync|Check|Update|Validate|Duplicate|Forecast|Contact|Opportunity|Quote|Party|Master)[A-Za-z0-9_]*)\b/;

// Package names come from env so they can be updated without a code change.
// Set CPI_KNOWN_PACKAGES as a comma-separated list in your .env file.
const knownPackages = (process.env.CPI_KNOWN_PACKAGES ?? [
  'YOUR_PACKAGE_ID',
  'YOUR_PACKAGE_ID_2',
  'CNSDevelopment',
  'SAPSalesCloudVersion2IntegrationwithSAPCPQ',
].join(',')).split(',').map(p => p.trim()).filter(Boolean);

const PACKAGE_PATTERN = knownPackages.length > 0
  ? new RegExp(`\\b(${knownPackages.join('|')})\\b`, 'i')
  : null;

export class ContextManager {
  private ctx: SessionContext;
  private maxHistory: number;

  constructor(maxHistory = 20) {
    this.maxHistory      = maxHistory;
    this.ctx             = { turns: [] };
  }

  get context(): SessionContext {
    return this.ctx;
  }

  addUserTurn(content: string): void {
    this.extractEntities(content);
    this.appendTurn({ role: 'user', content, timestamp: new Date() });
  }

  addAssistantTurn(content: string, agentsInvoked?: AgentTarget[]): void {
    this.appendTurn({ role: 'assistant', content, timestamp: new Date(), agentsInvoked });
  }

  updateLastGroovyScript(script: string): void {
    this.ctx.lastGroovyScript = script;
  }

  reset(): void {
    this.ctx = { turns: [] };
  }

  private appendTurn(turn: ConversationTurn): void {
    this.ctx.turns.push(turn);
    if (this.ctx.turns.length > this.maxHistory) {
      this.ctx.turns = this.ctx.turns.slice(-this.maxHistory);
    }
  }

  private extractEntities(text: string): void {
    const envMatch = ENV_PATTERN.exec(text);
    if (envMatch) {
      this.ctx.lastEnvironment = envMatch[1].toUpperCase() as 'DEV' | 'TEST' | 'PROD';
    }

    const iflowMatch = IFLOW_PATTERN.exec(text);
    if (iflowMatch) {
      this.ctx.lastIflow = iflowMatch[1];
    }

    if (PACKAGE_PATTERN) {
      const pkgMatch = PACKAGE_PATTERN.exec(text);
      if (pkgMatch) {
        this.ctx.lastPackage = pkgMatch[1];
      }
    }
  }
}
