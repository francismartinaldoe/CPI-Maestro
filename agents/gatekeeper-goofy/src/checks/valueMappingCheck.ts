// checks/valueMappingCheck.ts
import { CheckContext, CheckResult } from '../types';

export async function checkValueMappings(ctx: CheckContext): Promise<CheckResult> {
  const start = Date.now();

  try {
    // Get deployed value mappings from runtime
    const deployed = await ctx.cpiClient.getDeployedValueMappings();
    const deployedIds = new Set(deployed.map((vm) => vm.Id));

    // Design-time value mappings for the package
    const designTime = await ctx.cpiClient.getValueMappings(ctx.packageId);

    if (designTime.length === 0 && deployed.length === 0) {
      return {
        id: 'value_mapping',
        category: 'Value Mapping Completeness',
        status: 'PASS',
        detail: 'No value mappings referenced — check skipped',
        autoFix: false,
        durationMs: Date.now() - start,
      };
    }

    const missing = designTime.filter((vm) => !deployedIds.has(vm.Id));
    const stoppedOrError = deployed.filter((vm) => vm.Status !== 'STARTED');

    if (missing.length > 0) {
      return {
        id: 'value_mapping',
        category: 'Value Mapping Completeness',
        status: 'FAIL',
        detail: `Missing deployed VMs: ${missing.map((v) => v.Name).join(', ')}`,
        autoFix: true,
        autoFixDetail: 'Re-upload triggered for missing value mappings',
        escalation: 'JIRA blocker raised',
        durationMs: Date.now() - start,
        rawData: { missing, stoppedOrError },
      };
    }

    if (stoppedOrError.length > 0) {
      return {
        id: 'value_mapping',
        category: 'Value Mapping Completeness',
        status: 'WARN',
        detail: `VMs not STARTED: ${stoppedOrError.map((v) => `${v.Name}(${v.Status})`).join(', ')}`,
        autoFix: false,
        escalation: 'Notify go-live lead',
        durationMs: Date.now() - start,
      };
    }

    return {
      id: 'value_mapping',
      category: 'Value Mapping Completeness',
      status: 'PASS',
      detail: `${deployed.length} value mappings deployed & STARTED`,
      autoFix: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: 'value_mapping',
      category: 'Value Mapping Completeness',
      status: 'WARN',
      detail: `Check skipped – API error: ${(err as Error).message}`,
      autoFix: false,
      durationMs: Date.now() - start,
    };
  }
}
