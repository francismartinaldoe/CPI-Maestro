// checks/logLevelCheck.ts
import { CheckContext, CheckResult } from '../types';

/**
 * Checks that TRACE / DEBUG log levels are not left on in PROD.
 * CPI exposes log level via the runtime artifact configuration endpoint.
 * We infer from recent message logs if trace data is present.
 */
export async function checkLogLevel(ctx: CheckContext): Promise<CheckResult> {
  const start = Date.now();

  try {
    // Fetch recent messages and look for trace-level data
    const messages = await ctx.cpiClient.getRecentMessages(ctx.iflowId, 10);

    // If trace logs are attached to recent messages, TRACE mode is likely ON
    const withTrace = messages.filter((m) => {
      const status = (m as unknown as Record<string, string>)['LogLevel'];
      return status === 'TRACE' || status === 'DEBUG';
    });

    if (withTrace.length > 0 && ctx.environment === 'PROD') {
      return {
        id: 'log_level',
        category: 'Log Level Check',
        status: 'WARN',
        detail: `${withTrace.length} recent messages show TRACE/DEBUG log level — performance impact in PROD`,
        autoFix: true,
        autoFixDetail: 'Reset log level to INFO via CPI Operations → Manage Integration Content',
        escalation: 'WARN to dev channel',
        durationMs: Date.now() - start,
        rawData: { traceCount: withTrace.length },
      };
    }

    // Check MPL retention (indirect indicator of trace-mode if messages are very detailed)
    const traceIndicators = messages.filter((m) => {
      const attachments = (m as unknown as Record<string, unknown[]>)['MessageStoreEntries'];
      return attachments && attachments.length > 5; // many attachments = likely TRACE
    });

    if (traceIndicators.length > 2 && ctx.environment === 'PROD') {
      return {
        id: 'log_level',
        category: 'Log Level Check',
        status: 'WARN',
        detail: 'High MPL attachment count suggests TRACE mode may be active',
        autoFix: true,
        autoFixDetail: 'Reset to INFO recommended',
        escalation: 'WARN to dev channel',
        durationMs: Date.now() - start,
      };
    }

    return {
      id: 'log_level',
      category: 'Log Level Check',
      status: 'PASS',
      detail: `Log level appears INFO/ERROR — no TRACE indicators in last ${messages.length} messages`,
      autoFix: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: 'log_level',
      category: 'Log Level Check',
      status: 'WARN',
      detail: `Could not verify log level: ${(err as Error).message}`,
      autoFix: false,
      durationMs: Date.now() - start,
    };
  }
}
