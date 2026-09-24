// src/mcp/CPI_MCP/config.ts — Re-exports from the shared credential service.
//
// All tool handlers inside this package import from here, so their paths
// are unchanged. The canonical implementation lives in src/services/credentialService.ts.

export {
  type CpiProfile,
  type CpiCredentials,
  getProfiles,
  loadProfileCredentials,
  loadCredentials,
  defaultEnvironment,
} from '../../services/credentialService.js';

// Environment type is still local to this package's types.ts
export type { Environment } from './types.js';
