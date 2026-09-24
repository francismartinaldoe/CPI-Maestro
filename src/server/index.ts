// src/server/index.ts — CPIMAESTRO A2A HTTP Server
//
// Exposes the Maestro orchestrator as an A2A-compliant HTTP endpoint:
//   GET  /.well-known/agent.json  — Agent Card (public, no auth)
//   GET  /health                  — Liveness probe (public, no auth)
//   POST /                        — JSON-RPC 2.0: tasks/send, tasks/sendSubscribe,
//                                   tasks/get, tasks/cancel
//
// Start: npm run dev:server   (dev)
//        npm run start:server (production — run "npm run build" first)

import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { Maestro } from '../orchestrator/maestro.js';
import { loadAgentConfig, requireAnthropicKey } from '../utils/config.js';
import { createAgentCardRouter } from '../a2a/agentCard.js';
import { createA2ARouter } from '../a2a/router.js';
import { logger } from '../utils/logger.js';

function main(): void {
  // Fail fast if no Anthropic credential is available
  requireAnthropicKey();

  const config  = loadAgentConfig();
  const maestro = new Maestro(config);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // ── Public routes (no auth) ──────────────────────────────────────────────
  app.use(createAgentCardRouter());

  // ── Optional bearer auth ─────────────────────────────────────────────────
  // Enabled only when A2A_API_KEY is set in the environment.
  // /.well-known/agent.json and /health are always public (registered above).
  const apiKey = process.env.A2A_API_KEY;
  if (apiKey) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.headers.authorization === `Bearer ${apiKey}`) {
        next();
        return;
      }
      res.status(401).json({ error: 'Unauthorized' });
    });
    logger.info('[server] bearer auth enabled (A2A_API_KEY is set)');
  }

  // ── A2A JSON-RPC endpoint ────────────────────────────────────────────────
  app.use('/', createA2ARouter(maestro));

  // ── Start listening ──────────────────────────────────────────────────────
  const port   = parseInt(process.env.A2A_PORT ?? '3000', 10);
  const server = app.listen(port, () => {
    logger.info(`[server] CPIMAESTRO A2A Server listening on port ${port}`);
    logger.info(`[server] Agent Card : http://localhost:${port}/.well-known/agent.json`);
    logger.info(`[server] Health     : http://localhost:${port}/health`);
    logger.info(`[server] A2A RPC    : POST http://localhost:${port}/`);
    if (process.env.A2A_BASE_URL) {
      logger.info(`[server] Public URL : ${process.env.A2A_BASE_URL}`);
    }
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = (): void => {
    logger.info('[server] shutdown signal received — closing gracefully');
    server.close(() => {
      maestro.shutdown();
      process.exit(0);
    });
    // Force-exit after 10 s if graceful shutdown stalls
    setTimeout(() => {
      logger.warn('[server] forced exit after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

try {
  main();
} catch (err) {
  logger.error(`[server] Fatal startup error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
