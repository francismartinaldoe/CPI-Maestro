// checks/smokeTest.ts
import { CheckContext, CheckResult } from '../types';

export async function checkSmokeTest(ctx: CheckContext): Promise<CheckResult> {
  const start = Date.now();

  if (!ctx.config.smokeTestEnabled) {
    return {
      id: 'smoke_test',
      category: 'Smoke Test — Synthetic Msg',
      status: 'SKIP',
      detail: 'Smoke test disabled via SMOKE_TEST_ENABLED=false',
      autoFix: false,
      durationMs: Date.now() - start,
    };
  }

  try {
    const endpointUrl = `${ctx.config.tenantUrl}/http/${ctx.iflowId}`;
    const payload = ctx.config.smokeTestPayload.replace(
      '__NOW__',
      new Date().toISOString()
    );

    const result = await ctx.cpiClient.sendSmokeTestMessage(
      endpointUrl,
      payload,
      ctx.config.smokeTestTimeoutMs
    );

    // If treat403AsSkip is set in agent-rules.json, don't fail on auth-protected endpoints
    const treat403AsSkip = ctx.config.rules?.smokeTest?.treat403AsSkip ?? false;
    if (result.status === 403 && treat403AsSkip) {
      return {
        id: 'smoke_test',
        category: 'Smoke Test — Synthetic Msg',
        status: 'SKIP',
        detail: 'HTTP 403 — endpoint requires caller auth; smoke test skipped (treat403AsSkip=true in agent-rules.json)',
        autoFix: false,
        durationMs: Date.now() - start,
      };
    }

    if (result.ok) {
      return {
        id: 'smoke_test',
        category: 'Smoke Test — Synthetic Msg',
        status: 'PASS',
        detail: `Synthetic message accepted — HTTP ${result.status} in ${Date.now() - start}ms`,
        autoFix: false,
        durationMs: Date.now() - start,
      };
    }

    // Retrieve recent MPL for error detail
    const logs = await ctx.cpiClient.getRecentMessages(ctx.iflowId, 1);
    const errMsg = logs[0]?.ErrorInfos?.[0]?.ErrorMessage ?? 'Unknown error';

    return {
      id: 'smoke_test',
      category: 'Smoke Test — Synthetic Msg',
      status: 'FAIL',
      detail: `HTTP ${result.status || 'timeout'} — ${result.error ?? errMsg}`,
      autoFix: false,
      escalation: 'P1 — Rollback flag',
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: 'smoke_test',
      category: 'Smoke Test — Synthetic Msg',
      status: 'FAIL',
      detail: `Smoke test exception: ${(err as Error).message}`,
      autoFix: false,
      escalation: 'P1 — Rollback flag',
      durationMs: Date.now() - start,
    };
  }
}
