// checks/endpointReachability.ts
import { CheckContext, CheckResult } from '../types';

/**
 * Resolves the iFlow's runtime endpoint from the tenant URL pattern
 * and pings it. In real CPI you'd extract receiver adapter endpoints from
 * design-time configuration; here we derive the inbound HTTPS endpoint.
 */
export async function checkEndpointReachability(ctx: CheckContext): Promise<CheckResult> {
  const start = Date.now();

  // CPI inbound HTTPS URL pattern
  const endpointUrl = `${ctx.config.tenantUrl}/http/${ctx.iflowId}`;
  const endpointLabel = endpointUrl;

  try {
    const result = await ctx.cpiClient.pingEndpoint(endpointUrl);

    if (result.reachable) {
      return {
        id: 'endpoint_reachability',
        category: 'Endpoint URL Reachability',
        status: 'PASS',
        detail: `Endpoint reachable — HTTP ${result.statusCode} → ${endpointLabel}`,
        autoFix: false,
        durationMs: Date.now() - start,
      };
    }

    // 401/403 is actually reachable (auth wall = service is up)
    if (result.statusCode && [401, 403].includes(result.statusCode)) {
      return {
        id: 'endpoint_reachability',
        category: 'Endpoint URL Reachability',
        status: 'PASS',
        detail: `Endpoint live (HTTP ${result.statusCode} – auth required) → ${endpointLabel}`,
        autoFix: false,
        durationMs: Date.now() - start,
      };
    }

    const isProd = ctx.environment === 'PROD';
    return {
      id: 'endpoint_reachability',
      category: 'Endpoint URL Reachability',
      status: isProd ? 'FAIL' : 'WARN',
      detail: `Endpoint unreachable${result.error ? ': ' + result.error : ` (HTTP ${result.statusCode})`} → ${endpointLabel}`,
      autoFix: false,
      escalation: isProd ? 'Immediate escalate' : 'Notify go-live lead',
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: 'endpoint_reachability',
      category: 'Endpoint URL Reachability',
      status: 'FAIL',
      detail: `Ping error: ${(err as Error).message}`,
      autoFix: false,
      escalation: 'Immediate escalate',
      durationMs: Date.now() - start,
    };
  }
}
