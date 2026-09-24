// checks/activationStatus.ts
import { CheckContext, CheckResult } from '../types';

export async function checkActivationStatus(ctx: CheckContext): Promise<CheckResult> {
  const start = Date.now();
  try {
    const artifact = await ctx.cpiClient.getRuntimeArtifact(ctx.iflowId);

    if (!artifact) {
      return {
        id: 'activation_status',
        category: 'iFlow Activation Status',
        status: 'FAIL',
        detail: `iFlow '${ctx.iflowId}' not found in runtime – not deployed`,
        autoFix: false,
        escalation: 'P1 — Block deploy',
        durationMs: Date.now() - start,
      };
    }

    if (artifact.Status === 'STARTED') {
      return {
        id: 'activation_status',
        category: 'iFlow Activation Status',
        status: 'PASS',
        detail: `Status: STARTED | Version: ${artifact.Version} | Deployed: ${artifact.DeployedOn}`,
        autoFix: false,
        durationMs: Date.now() - start,
        rawData: artifact,
      };
    }

    if (artifact.Status === 'ERROR') {
      return {
        id: 'activation_status',
        category: 'iFlow Activation Status',
        status: 'FAIL',
        detail: `iFlow is in ERROR state – runtime deployment failed`,
        autoFix: true,
        autoFixDetail: 'Re-activation attempted via deploy_artifact',
        escalation: 'P1 — Block deploy',
        durationMs: Date.now() - start,
        rawData: artifact,
      };
    }

    return {
      id: 'activation_status',
      category: 'iFlow Activation Status',
      status: 'WARN',
      detail: `iFlow status is ${artifact.Status} – expected STARTED`,
      autoFix: false,
      escalation: 'Notify go-live lead',
      durationMs: Date.now() - start,
      rawData: artifact,
    };
  } catch (err) {
    return {
      id: 'activation_status',
      category: 'iFlow Activation Status',
      status: 'FAIL',
      detail: `API error: ${(err as Error).message}`,
      autoFix: false,
      escalation: 'Immediate escalate',
      durationMs: Date.now() - start,
    };
  }
}
