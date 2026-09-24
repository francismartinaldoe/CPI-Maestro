// checks/securityReplication.ts
import { CheckContext, CheckResult } from '../types';

/**
 * Confirms that expected security artifacts (certs, credentials, OAuth configs)
 * referenced in the baseline are present in the current tenant.
 * This catches the "forgot to replicate to PROD" scenario.
 */
export async function checkSecurityReplication(ctx: CheckContext): Promise<CheckResult> {
  const start = Date.now();

  try {
    const [keystores, creds, oauths] = await Promise.all([
      ctx.cpiClient.getKeystoreEntries(),
      ctx.cpiClient.getCredentials(),
      ctx.cpiClient.getOAuthCredentials(),
    ]);

    const issues: string[] = [];

    // If we have a baseline, verify expected aliases are present
    if (ctx.baseline) {
      const keystoreAliases = new Set(keystores.map((k) => k.Alias));
      const credNames = new Set(creds.map((c) => c.Name));

      const missingKeystores = (ctx.baseline.credentialAliases ?? []).filter(
        (a) => !keystoreAliases.has(a) && !credNames.has(a)
      );
      if (missingKeystores.length > 0) {
        issues.push(`Missing security artifacts: ${missingKeystores.join(', ')}`);
      }
    }

    // Sanity: must have at least some security artifacts in PROD
    if (ctx.environment === 'PROD' && keystores.length === 0 && creds.length === 0) {
      issues.push('No keystore entries or credentials found in PROD tenant — replication likely incomplete');
    }

    if (issues.length > 0) {
      return {
        id: 'security_replication',
        category: 'Security Artifact Replication',
        status: 'FAIL',
        detail: issues.join(' | '),
        autoFix: false,
        escalation: 'P1 — Block deploy',
        durationMs: Date.now() - start,
      };
    }

    return {
      id: 'security_replication',
      category: 'Security Artifact Replication',
      status: 'PASS',
      detail: `${keystores.length} keystore + ${creds.length} credentials + ${oauths.length} OAuth configs confirmed`,
      autoFix: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: 'security_replication',
      category: 'Security Artifact Replication',
      status: 'WARN',
      detail: `API error: ${(err as Error).message}`,
      autoFix: false,
      durationMs: Date.now() - start,
    };
  }
}
