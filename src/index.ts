// src/index.ts — Public API exports (for programmatic use)

export { Maestro }             from './orchestrator/maestro.js';
export { IntentRouter }        from './orchestrator/intentRouter.js';
export { ContextManager }      from './orchestrator/contextManager.js';
export { ResponseSynthesizer } from './orchestrator/responseSynthesizer.js';
export { GatekeeperAgent }     from './agents/gatekeeperAgent.js';
export { FlowLensAgent }       from './agents/flowlensAgent.js';
export { McpRegistry, MCP_SERVERS } from './mcp/index.js';
export * from './orchestrator/types.js';
