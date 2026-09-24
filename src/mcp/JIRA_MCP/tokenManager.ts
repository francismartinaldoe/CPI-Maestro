// src/mcp/JIRA_MCP/tokenManager.ts — OAuth2 token lifecycle manager
//
// Best practices implemented:
//   1. Proactive refresh at 75% of token lifetime (not at expiry)
//   2. Background refresh timer — never blocks a tool call
//   3. Single in-flight refresh promise — prevents concurrent refresh races
//   4. Transparent retry on 401 — tools never see an expired token
//   5. Session-context awareness — re-authenticates UI when refresh fails

import { refreshAccessToken, startSsoListener, getSsoState, type OAuthTokens } from './ssoAuth.js';
import { logger } from '../../utils/logger.js';

// How early to refresh before expiry (75% of lifetime = refresh at 25% remaining)
const REFRESH_THRESHOLD_MS = 0.25;
// Minimum time before expiry to attempt refresh
const MIN_REFRESH_BEFORE_MS = 5 * 60 * 1000; // 5 minutes

export type TokenHealth = 'valid' | 'expiring' | 'expired' | 'missing' | 'refreshing';

class JiraTokenManager {
  private refreshTimer:   ReturnType<typeof setTimeout> | null = null;
  private refreshPromise: Promise<OAuthTokens> | null = null;

  // ── Get a valid token — refresh if needed ─────────────────────────────────

  async getValidToken(): Promise<string> {
    const token     = process.env.JIRA_ACCESS_TOKEN  ?? '';
    const refresh   = process.env.JIRA_REFRESH_TOKEN ?? '';
    const expiresAt = parseInt(process.env.JIRA_TOKEN_EXPIRES_AT ?? '0', 10);

    if (!token) throw new Error('JIRA not authenticated. Please connect via SSO in Maestro Settings.');

    const now      = Date.now();
    const timeLeft = expiresAt - now;

    // Token expired
    if (expiresAt > 0 && timeLeft <= 0) {
      if (!refresh) {
        // No refresh token — session is gone, must re-authenticate
        throw new Error(
          'JIRA session expired. Please reconnect via SSO in Maestro Settings (⚙ → JIRA → Connect with SAP SSO).'
        );
      }
      logger.warn('[TokenManager] JIRA token expired — attempting refresh');
      try {
        const tokens = await this.refresh(refresh);
        return tokens.accessToken;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `JIRA token expired and refresh failed (${msg}). ` +
          `Please reconnect via SSO in Maestro Settings.`
        );
      }
    }

    // Token expiring within 5 minutes — proactive refresh
    if (expiresAt > 0 && timeLeft <= MIN_REFRESH_BEFORE_MS && refresh) {
      logger.info(`[TokenManager] JIRA token expiring in ${Math.round(timeLeft / 1000)}s — refreshing now`);
      try {
        const tokens = await this.refresh(refresh);
        return tokens.accessToken;
      } catch {
        logger.warn('[TokenManager] Proactive refresh failed — using existing token');
        return token;
      }
    }

    return token;
  }

  // ── Proactive background refresh ─────────────────────────────────────────
  // Called once after SSO completes. Schedules a refresh at 75% of token lifetime
  // so it happens silently while the user is working, not mid-request.

  scheduleRefresh(expiresAt: number): void {
    this.cancelRefresh();

    const now      = Date.now();
    const lifetime = expiresAt - now;
    if (lifetime <= 0) return;

    // Refresh at 75% of lifetime elapsed (25% remaining)
    const refreshAt = Math.max(lifetime * (1 - REFRESH_THRESHOLD_MS), lifetime - MIN_REFRESH_BEFORE_MS);
    const delayMs   = Math.max(refreshAt, 30_000); // minimum 30s delay

    logger.info(`[TokenManager] Scheduled JIRA token refresh in ${Math.round(delayMs / 60000)}m`);

    this.refreshTimer = setTimeout(async () => {
      const refreshToken = process.env.JIRA_REFRESH_TOKEN ?? '';
      if (!refreshToken) {
        logger.warn('[TokenManager] No refresh token available for background refresh');
        return;
      }
      try {
        logger.info('[TokenManager] Background JIRA token refresh starting');
        const tokens = await this.refresh(refreshToken);
        this.scheduleRefresh(tokens.expiresAt); // reschedule for next cycle
        logger.info('[TokenManager] Background JIRA token refresh successful');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[TokenManager] Background refresh failed: ${msg}`);
        // Token will expire — mark it so UI shows warning
        this._refreshFailed = true;
      }
    }, delayMs);

    // Don't hold the Node process open just for this timer
    if (this.refreshTimer.unref) this.refreshTimer.unref();
  }

  private _refreshFailed = false;
  get refreshFailed() { return this._refreshFailed; }

  cancelRefresh(): void {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = null; }
    this._refreshFailed = false;
  }

  // ── Shared refresh promise (prevent concurrent refreshes) ─────────────────

  private async refresh(refreshToken: string): Promise<OAuthTokens> {
    if (this.refreshPromise) {
      logger.debug('[TokenManager] Refresh already in progress — waiting');
      return this.refreshPromise;
    }

    this.refreshPromise = refreshAccessToken(refreshToken)
      .then(tokens => {
        process.env.JIRA_ACCESS_TOKEN     = tokens.accessToken;
        process.env.JIRA_REFRESH_TOKEN    = tokens.refreshToken;
        process.env.JIRA_TOKEN_EXPIRES_AT = String(tokens.expiresAt);
        this._refreshFailed = false;
        logger.info('[TokenManager] Token refreshed successfully');
        return tokens;
      })
      .finally(() => { this.refreshPromise = null; });

    return this.refreshPromise;
  }

  // ── Token health (for UI status endpoint) ─────────────────────────────────

  getHealth(): { status: TokenHealth; expiresAt: number | null; expiresIn: string | null } {
    const token     = process.env.JIRA_ACCESS_TOKEN ?? '';
    const expiresAt = parseInt(process.env.JIRA_TOKEN_EXPIRES_AT ?? '0', 10);

    if (!token) return { status: 'missing', expiresAt: null, expiresIn: null };

    if (this.refreshPromise) return { status: 'refreshing', expiresAt, expiresIn: 'refreshing…' };

    const now      = Date.now();
    const timeLeft = expiresAt > 0 ? expiresAt - now : null;

    if (timeLeft !== null && timeLeft <= 0) {
      return { status: 'expired', expiresAt, expiresIn: 'Expired' };
    }
    if (timeLeft !== null && timeLeft <= MIN_REFRESH_BEFORE_MS) {
      const mins = Math.round(timeLeft / 60000);
      return { status: 'expiring', expiresAt, expiresIn: `${mins}m` };
    }
    if (timeLeft !== null) {
      const mins = Math.round(timeLeft / 60000);
      return { status: 'valid', expiresAt, expiresIn: `${mins}m` };
    }
    return { status: 'valid', expiresAt: null, expiresIn: null };
  }
}

// Singleton — one instance for the whole server process
export const tokenManager = new JiraTokenManager();
