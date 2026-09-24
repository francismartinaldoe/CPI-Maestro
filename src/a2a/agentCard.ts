// src/a2a/agentCard.ts — Express router serving the A2A Agent Card and health endpoint

import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Works from both src/a2a/ (tsx dev mode) and dist/a2a/ (compiled production)
const CARD_PATH = join(__dirname, '../../.well-known/agent.json');

export function createAgentCardRouter(): Router {
  const router = Router();

  // ── GET /.well-known/agent.json ─────────────────────────────────────────
  // Public — no auth required. A2A clients fetch this to discover capabilities.
  // A2A_BASE_URL is injected at request time so the card stays correct in all
  // environments without re-building the JSON file.
  router.get('/.well-known/agent.json', (_req, res) => {
    try {
      const raw  = readFileSync(CARD_PATH, 'utf-8');
      const card = JSON.parse(raw) as Record<string, unknown>;

      if (process.env.A2A_BASE_URL) {
        card['url'] = process.env.A2A_BASE_URL;
      }

      res.json(card);
    } catch (err) {
      logger.error(`[agentCard] failed to read agent card: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'Agent card unavailable' });
    }
  });

  // ── GET /health ──────────────────────────────────────────────────────────
  // Standard liveness probe — no auth required.
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'CPIMAESTRO A2A Server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
