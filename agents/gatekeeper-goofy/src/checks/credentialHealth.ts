// checks/credentialHealth.ts
import { CheckContext, CheckResult } from '../types';

export async function checkCredentialHealth(ctx: CheckContext): Promise<CheckResult> {
  const start = Date.now();
  const issues: string[] = [];
  const warns: string[] = [];
  const warnDays = ctx.config.certExpiryWarnDays;
  const now = Date.now();

  try {
    // 1. Check keystores for expired / near-expiry certs
    const keystores = await ctx.cpiClient.getKeystoreEntries();
    const expiredCerts: string[] = [];
    const nearExpiryCerts: string[] = [];

    for (const entry of keystores) {
      if (!entry.ValidNotAfter) continue;
      const expiry = new Date(entry.ValidNotAfter).getTime();
      const daysLeft = Math.round((expiry - now) / 86_400_000);
      if (daysLeft < 0) {
        expiredCerts.push(`${entry.Alias} (expired ${Math.abs(daysLeft)}d ago)`);
      } else if (daysLeft <= warnDays) {
        nearExpiryCerts.push(`${entry.Alias} (${daysLeft}d left)`);
      }
    }

    if (expiredCerts.length > 0) {
      issues.push(`Expired certs: ${expiredCerts.join(', ')}`);
    }
    if (nearExpiryCerts.length > 0) {
      warns.push(`Near-expiry (≤${warnDays}d): ${nearExpiryCerts.join(', ')}`);
    }

    // 2. Check user credentials exist (non-zero list)
    const creds = await ctx.cpiClient.getCredentials();
    if (creds.length === 0) {
      warns.push('No user credentials found in tenant');
    }

    // 3. Check OAuth credentials & their scopes
    const oauths = await ctx.cpiClient.getOAuthCredentials();
    const missingScope = oauths.filter((o) => !o.Scope || o.Scope.trim() === '');
    if (missingScope.length > 0) {
      warns.push(`OAuth configs with empty scope: ${missingScope.map((o) => o.Name).join(', ')}`);
    }

    // ── Build result ──────────────────────────
    if (issues.length > 0) {
      return {
        id: 'credential_health',
        category: 'Credential / Keystore Health',
        status: 'FAIL',
        detail: issues.concat(warns).join(' | '),
        autoFix: false,
        escalation: 'P1 — Block deploy',
        durationMs: Date.now() - start,
        rawData: { expiredCerts, nearExpiryCerts, credCount: creds.length },
      };
    }
    if (warns.length > 0) {
      return {
        id: 'credential_health',
        category: 'Credential / Keystore Health',
        status: 'WARN',
        detail: warns.join(' | '),
        autoFix: false,
        escalation: 'Notify go-live lead',
        durationMs: Date.now() - start,
        rawData: { nearExpiryCerts, credCount: creds.length },
      };
    }

    return {
      id: 'credential_health',
      category: 'Credential / Keystore Health',
      status: 'PASS',
      detail: `${keystores.length} keystore entries OK, ${creds.length} credentials, ${oauths.length} OAuth configs`,
      autoFix: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: 'credential_health',
      category: 'Credential / Keystore Health',
      status: 'FAIL',
      detail: `API error: ${(err as Error).message}`,
      autoFix: false,
      escalation: 'P1 — Block deploy',
      durationMs: Date.now() - start,
    };
  }
}
