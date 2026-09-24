// src/services/credentialService.ts — Single source of truth for CPI credential resolution
//
// Two resolution strategies, tried in order:
//   1. Named profiles  — MAESTRO_PROFILES env var (JSON array of CpiProfile)
//   2. Environment vars — CPI_TENANT_URL[_DEV|_TEST|_PROD] etc.

import type { Environment } from '../mcp/CPI_MCP/types.js';

// ── Shared credential types ───────────────────────────────────────────────────

export interface CpiProfile {
  id:           string;
  name:         string;
  tenantUrl:    string;
  tokenUrl:     string;
  clientId:     string;
  clientSecret: string;
  username?:    string;
  password?:    string;
}

export interface CpiCredentials {
  tenantUrl:    string;
  tokenUrl:     string;
  clientId:     string;
  clientSecret: string;
  username?:    string;
  password?:    string;
}

// ── Named-profile helpers ─────────────────────────────────────────────────────

export function getProfiles(): CpiProfile[] {
  const raw = process.env.MAESTRO_PROFILES;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CpiProfile[]) : [];
  } catch {
    return [];
  }
}

export function loadProfileCredentials(profileId: string): CpiCredentials | null {
  const profiles = getProfiles();
  const profile  = profiles.find(
    p => p.id === profileId || p.name.toLowerCase() === profileId.toLowerCase(),
  );
  if (!profile) return null;

  if (profile.username && profile.password) {
    return {
      tenantUrl:    profile.tenantUrl.replace(/\/$/, ''),
      tokenUrl:     '',
      clientId:     '',
      clientSecret: '',
      username:     profile.username,
      password:     profile.password,
    };
  }

  return {
    tenantUrl:    profile.tenantUrl.replace(/\/$/, ''),
    tokenUrl:     profile.tokenUrl,
    clientId:     profile.clientId,
    clientSecret: profile.clientSecret,
  };
}

// ── Environment-variable helpers ──────────────────────────────────────────────

const SUFFIX: Record<Environment, string> = {
  DEV:  'DEV',
  TEST: 'TEST',
  PROD: 'PROD',
};

function pick(base: string, suffix: string): string {
  return process.env[`${base}_${suffix}`] || process.env[base] || '';
}

function requireEnv(base: string, suffix: string): string {
  const v = pick(base, suffix);
  if (!v) throw new Error(`Missing env var: ${base}_${suffix} (or fallback ${base})`);
  return v;
}

export function loadCredentials(env: Environment): CpiCredentials {
  const s = SUFFIX[env];

  const username = pick('CPI_USERNAME', s);
  const password = pick('CPI_PASSWORD', s);

  if (username && password) {
    return {
      tenantUrl:    requireEnv('CPI_TENANT_URL', s).replace(/\/$/, ''),
      tokenUrl:     '',
      clientId:     '',
      clientSecret: '',
      username,
      password,
    };
  }

  return {
    tenantUrl:    requireEnv('CPI_TENANT_URL',    s).replace(/\/$/, ''),
    tokenUrl:     requireEnv('CPI_TOKEN_URL',     s),
    clientId:     requireEnv('CPI_CLIENT_ID',     s),
    clientSecret: requireEnv('CPI_CLIENT_SECRET', s),
  };
}

export function defaultEnvironment(): Environment {
  const raw = (process.env.CPI_DEFAULT_ENV ?? 'DEV').toUpperCase();
  if (raw === 'TEST' || raw === 'PROD') return raw;
  return 'DEV';
}
