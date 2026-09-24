// src/mcp/JIRA_MCP/ssoAuth.ts — SAP JIRA OAuth2 PKCE flow
//
// Uses the same auth server as the SAP JIRA MCP:
//   Authorization endpoint: https://mcp.jira.<YOUR-DOMAIN>/authorize
//   Token endpoint:         https://mcp.jira.<YOUR-DOMAIN>/token
//   Client ID:              <YOUR-JIRA-MCP-CLIENT-ID>
//   PKCE:                   S256 (no client secret needed)
//   Scope:                  mcp
//   Resource:               https://mcp.jira.<YOUR-DOMAIN>/mcp
//
// Flow:
//   1. startSsoListener() — generates PKCE pair, starts callback server, returns authUrl
//   2. UI opens authUrl in new tab — user logs in with SAP SSO
//   3. SAP redirects to http://localhost:{port}/callback?code=...
//   4. Callback server exchanges code for access_token using PKCE verifier
//   5. Token stored in process.env.JIRA_ACCESS_TOKEN

import http           from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { URL }        from 'node:url';
import { logger }     from '../../utils/logger.js';
import { tokenManager } from './tokenManager.js';

// ── SAP JIRA MCP OAuth2 constants ─────────────────────────────────────────────
const JIRA_MCP_AUTH_URL    = 'https://mcp.jira.<YOUR-DOMAIN>/authorize';
const JIRA_MCP_TOKEN_URL   = 'https://mcp.jira.<YOUR-DOMAIN>/token';
const JIRA_MCP_CLIENT_ID   = '<YOUR-JIRA-MCP-CLIENT-ID>';
const JIRA_MCP_SCOPE        = 'mcp';
const JIRA_MCP_RESOURCE     = 'https://mcp.jira.<YOUR-DOMAIN>/mcp';

export interface OAuthTokens {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number;
}

export type SsoState =
  | { status: 'idle' }
  | { status: 'waiting';  authUrl: string }
  | { status: 'success' }
  | { status: 'error';    message: string };

let _ssoState:   SsoState = { status: 'idle' };
let _ssoServer:  http.Server | null = null;
let _ssoTimeout: ReturnType<typeof setTimeout> | null = null;

export function getSsoState(): SsoState { return _ssoState; }

function resetSso() {
  if (_ssoServer)  { try { _ssoServer.close(); } catch { /* ignore */ } _ssoServer = null; }
  if (_ssoTimeout) { clearTimeout(_ssoTimeout); _ssoTimeout = null; }
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ── Start SSO listener ────────────────────────────────────────────────────────

export function startSsoListener(): string {
  resetSso();

  const callbackPort = parseInt(process.env.JIRA_OAUTH_CALLBACK_PORT ?? '4000', 10);
  const callbackUrl  = `http://localhost:${callbackPort}/callback`;

  const verifier  = generateVerifier();
  const challenge = generateChallenge(verifier);
  const state     = randomBytes(16).toString('hex');

  // Store verifier for exchange step
  process.env._JIRA_PKCE_VERIFIER = verifier;
  process.env._JIRA_OAUTH_STATE   = state;
  process.env._JIRA_CALLBACK_URL  = callbackUrl;

  // Build the authorization URL
  const authUrl = new URL(JIRA_MCP_AUTH_URL);
  authUrl.searchParams.set('response_type',         'code');
  authUrl.searchParams.set('client_id',             JIRA_MCP_CLIENT_ID);
  authUrl.searchParams.set('code_challenge',        challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('redirect_uri',          callbackUrl);
  authUrl.searchParams.set('state',                 state);
  authUrl.searchParams.set('scope',                 JIRA_MCP_SCOPE);
  authUrl.searchParams.set('resource',              JIRA_MCP_RESOURCE);

  _ssoState = { status: 'waiting', authUrl: authUrl.toString() };

  _ssoServer = http.createServer(async (req, res) => {
    if (!req.url?.startsWith('/callback')) { res.writeHead(404); res.end(); return; }

    const params        = new URL(req.url, `http://localhost:${callbackPort}`).searchParams;
    const code          = params.get('code');
    const returnedState = params.get('state');

    if (returnedState !== process.env._JIRA_OAUTH_STATE) {
      _ssoState = { status: 'error', message: 'State mismatch — possible CSRF attack.' };
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(callbackPage('error', 'State mismatch. Please try again.'));
      resetSso();
      return;
    }

    if (!code) {
      const msg = params.get('error_description') ?? params.get('error') ?? 'No code returned';
      _ssoState = { status: 'error', message: msg };
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(callbackPage('error', msg));
      resetSso();
      return;
    }

    try {
      const tokens = await exchangeCode(code, process.env._JIRA_PKCE_VERIFIER ?? '', callbackUrl);
      process.env.JIRA_ACCESS_TOKEN     = tokens.accessToken;
      process.env.JIRA_REFRESH_TOKEN    = tokens.refreshToken;
      process.env.JIRA_TOKEN_EXPIRES_AT = String(tokens.expiresAt);
      process.env.JIRA_AUTH_MODE        = 'sso';

      // Start proactive background refresh timer
      tokenManager.scheduleRefresh(tokens.expiresAt);

      // Fetch the authenticated user's identity so "assigned to me" works
      try {
        const base = process.env.JIRA_BASE_URL ?? 'https://jira.<YOUR-DOMAIN>';
        const me = await fetch(`${base}/rest/api/2/myself`, {
          headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' },
        });
        if (me.ok) {
          const user = await me.json() as { name?: string; emailAddress?: string; displayName?: string };
          const username = user.name ?? user.emailAddress ?? '';
          if (username) {
            process.env.JIRA_USERNAME = username;
            logger.info(`[JIRA SSO] Authenticated as: ${user.displayName ?? username}`);
          }
        }
      } catch { /* best-effort — currentUser() JQL still works without this */ }

      _ssoState = { status: 'success' };
      logger.info('[JIRA SSO] Authentication successful via SAP JIRA MCP OAuth2 PKCE.');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(callbackPage('success', 'JIRA authentication successful. You can close this tab.'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      _ssoState = { status: 'error', message: msg };
      logger.error(`[JIRA SSO] Token exchange failed: ${msg}`);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(callbackPage('error', `Token exchange failed: ${msg}`));
    } finally {
      resetSso();
    }
  });

  _ssoServer.listen(callbackPort, () => {
    logger.info(`[JIRA SSO] Callback listener ready on ${callbackUrl}`);
  });

  _ssoServer.on('error', (err: NodeJS.ErrnoException) => {
    const msg = err.code === 'EADDRINUSE'
      ? `Port ${callbackPort} is in use. Set JIRA_OAUTH_CALLBACK_PORT to a different port.`
      : err.message;
    _ssoState = { status: 'error', message: msg };
    logger.error(`[JIRA SSO] ${msg}`);
    resetSso();
  });

  // 10-minute timeout
  _ssoTimeout = setTimeout(() => {
    if (_ssoState.status === 'waiting') {
      _ssoState = { status: 'error', message: 'Authentication timed out after 10 minutes.' };
      logger.warn('[JIRA SSO] Timed out.');
    }
    resetSso();
  }, 10 * 60 * 1000);
  _ssoTimeout.unref();

  return authUrl.toString();
}

// ── Token exchange (PKCE — no client secret) ──────────────────────────────────

async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    client_id:     JIRA_MCP_CLIENT_ID,
    code_verifier: verifier,
    resource:      JIRA_MCP_RESOURCE,
  });

  const res = await fetch(JIRA_MCP_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${txt}`);
  }

  const data = await res.json() as {
    access_token:  string;
    refresh_token?: string;
    expires_in?:   number;
  };

  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt:    Date.now() + ((data.expires_in ?? 3600) * 1000),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     JIRA_MCP_CLIENT_ID,
    resource:      JIRA_MCP_RESOURCE,
  });

  const res = await fetch(JIRA_MCP_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) throw new Error('JIRA token refresh failed');

  const data = await res.json() as {
    access_token:  string;
    refresh_token?: string;
    expires_in?:   number;
  };

  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt:    Date.now() + ((data.expires_in ?? 3600) * 1000),
  };
}

export function disconnectSso(): void {
  resetSso();
  tokenManager.cancelRefresh();
  delete process.env.JIRA_ACCESS_TOKEN;
  delete process.env.JIRA_REFRESH_TOKEN;
  delete process.env.JIRA_TOKEN_EXPIRES_AT;
  delete process.env._JIRA_PKCE_VERIFIER;
  delete process.env._JIRA_OAUTH_STATE;
  process.env.JIRA_AUTH_MODE = 'basic';
  _ssoState = { status: 'idle' };
  logger.info('[JIRA SSO] Disconnected.');
}

// ── Callback page ─────────────────────────────────────────────────────────────

function callbackPage(type: 'success' | 'error', message: string): string {
  const colour = type === 'success' ? '#22c55e' : '#ef4444';
  const icon   = type === 'success' ? '✓' : '✗';
  return `<!DOCTYPE html><html><head><title>JIRA SSO — Maestro</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f1117;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px">
  <div style="font-size:3rem;color:${colour}">${icon}</div>
  <h2 style="color:${colour};margin:0">${type === 'success' ? 'JIRA Connected' : 'Authentication Failed'}</h2>
  <p style="color:#94a3b8;margin:0;text-align:center;max-width:360px">${message}</p>
  ${type === 'success' ? '<p style="color:#64748b;font-size:0.85rem">This tab will close automatically.</p>' : ''}
  <script>if('${type}'==='success'){setTimeout(()=>window.close(),1500)}</script>
</body></html>`;
}
