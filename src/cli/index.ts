#!/usr/bin/env node
// src/cli/index.ts — Maestro interactive REPL
//
// Usage:
//   npm run dev              # development (tsx)
//   node dist/cli/index.js   # production
//   npx maestro              # when installed globally

import 'dotenv/config';
import * as readline from 'node:readline';
import { Maestro } from '../orchestrator/maestro.js';
import { loadAgentConfig, requireAnthropicKey } from '../utils/config.js';
import { logger } from '../utils/logger.js';

// ── ANSI colour helpers ─────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  grey:   '\x1b[90m',
  blue:   '\x1b[34m',
};

function banner(): void {
  console.log(`
${C.cyan}${C.bold}╔═══════════════════════════════════════════════════════╗
║          MAESTRO  –  SAP CPI Intelligence Hub         ║
║   Orchestrating Gatekeeper-Goofy  ·  FlowLens AI     ║
╚═══════════════════════════════════════════════════════╝${C.reset}

Type your request in plain English.  Examples:
  ${C.grey}• Spot-check DuplicateOpportunityForecastExclusion in PROD
  • Compare UpdateOpportunityInC4CPostHook from DEV to TEST
  • Generate a Groovy script that maps JSON fields to SOAP headers
  • Explain the iFlow YOUR_PACKAGE_ID/ValidateContactAndDuplicateCheck
  • List all keystores
  • help${C.reset}

Commands: ${C.yellow}/status${C.reset} | ${C.yellow}/reset${C.reset} | ${C.yellow}/exit${C.reset}
`);
}

async function showStatus(maestro: Maestro): Promise<void> {
  process.stdout.write(`${C.grey}Checking agent availability…${C.reset}\n`);
  const avail = await maestro.checkAgentAvailability();
  console.log(`
${C.bold}Agent Status:${C.reset}
  ${avail.gatekeeper ? C.green + '●' : C.red + '○'}${C.reset} Gatekeeper-Goofy  ${avail.gatekeeper ? C.green + 'ONLINE' : C.red + 'OFFLINE'}${C.reset}
  ${avail.flowlens   ? C.green + '●' : C.red + '○'}${C.reset} FlowLens AI       ${avail.flowlens   ? C.green + 'ONLINE' : C.red + 'OFFLINE'}${C.reset}
`);
  if (!avail.gatekeeper) {
    console.log(`  ${C.yellow}Gatekeeper-Goofy: make sure GATEKEEPER_MCP_PATH points to dist/mcp/CPI_MCP/index.js${C.reset}`);
  }
  if (!avail.flowlens) {
    console.log(`  ${C.yellow}FlowLens AI: run "npm start" inside your FlowLens directory first${C.reset}`);
  }
}

async function main(): Promise<void> {
  requireAnthropicKey();
  const config  = loadAgentConfig();
  const maestro = new Maestro(config);

  banner();
  await showStatus(maestro);

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    prompt: `\n${C.cyan}${C.bold}You:${C.reset} `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // ── Built-in commands ──────────────────────────────────────────────────
    if (input === '/exit' || input === '/quit' || input === 'exit') {
      console.log(`\n${C.grey}Goodbye.${C.reset}\n`);
      maestro.shutdown();
      process.exit(0);
    }

    if (input === '/status') {
      await showStatus(maestro);
      rl.prompt();
      return;
    }

    if (input === '/reset') {
      maestro.resetSession();
      console.log(`${C.yellow}Session context cleared.${C.reset}`);
      rl.prompt();
      return;
    }

    if (input === '/help' || input === 'help') {
      console.log(`
${C.bold}Commands:${C.reset}
  /status   Show agent availability
  /reset    Clear session context (conversation history)
  /exit     Exit Maestro

${C.bold}Just type your request naturally. Examples:${C.reset}
  Spot-check ValidateContactAndDuplicateCheck in DEV
  Compare DuplicateOpportunityForecastExclusion DEV vs TEST
  Generate a Groovy script that escapes OData filter values
  Explain iFlow UpdateInvPartyInSAPCPQ2QuoteFromC4CV2Opportunity
  List all credentials
  What failed messages are there in the last 24h?
`);
      rl.prompt();
      return;
    }

    // ── Process natural language request ────────────────────────────────────
    process.stdout.write(`\n${C.grey}Thinking…${C.reset}\n`);

    try {
      const result = await maestro.process(input);

      // Show routing decision in debug mode
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(
          `\n${C.grey}[routing] taskId=${result.taskId} state=${result.taskState}` +
          ` target=${result.intent.target}` +
          ` tool=${result.intent.gatekeeperTool ?? result.intent.flowlensAction ?? '-'}` +
          ` confidence=${result.intent.confidence.toFixed(2)}` +
          ` reason=${result.intent.reasoning}${C.reset}`,
        );
      }

      // Print synthesized answer
      console.log(`\n${C.blue}${C.bold}Maestro:${C.reset}\n`);
      console.log(result.synthesizedAnswer);
      console.log();

      // Show timing stats in debug
      if (process.env.LOG_LEVEL === 'debug' && result.agentResponses.length) {
        const stats = result.agentResponses
          .map(r => `${r.agent}=${r.durationMs}ms`)
          .join(' | ');
        console.log(`${C.grey}[timing] ${stats}${C.reset}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\n${C.red}Error: ${msg}${C.reset}\n`);
      logger.error(msg);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${C.grey}Session ended.${C.reset}\n`);
    maestro.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`${C.red}Fatal error: ${err.message}${C.reset}`);
  process.exit(1);
});
