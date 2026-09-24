// src/transport/mcpClientPool.ts — Shared MCP process pool
//
// Manages McpClient instances keyed by server path.
// get()       — returns/creates a client for a server path (shared, env-based creds)
// getKeyed()  — returns/creates a client for a (poolKey, serverPath, env) triple
//               used when different agents target different tenant profiles:
//               each unique tenantUrl gets its own process with the right credentials
//               injected at spawn time via env vars.

import { McpClient } from './mcpClient.js';
import { logger }   from '../utils/logger.js';

const pool = new Map<string, McpClient>();

export const McpClientPool = {
  /**
   * Returns an existing McpClient for this server path, or creates a new one.
   * Uses the server path as the pool key — all callers share the same process.
   * Credentials come from the ambient process.env at spawn time.
   */
  get(serverScriptPath: string, env?: Record<string, string>): McpClient {
    if (pool.has(serverScriptPath)) {
      return pool.get(serverScriptPath)!;
    }
    logger.debug(`[McpClientPool] creating client for ${serverScriptPath}`);
    const client = new McpClient({ type: 'mcp', serverScriptPath, env });
    pool.set(serverScriptPath, client);
    return client;
  },

  /**
   * Returns a McpClient keyed on poolKey (e.g. "serverPath::tenantUrl").
   * Creates a new process with the supplied env vars merged on top of process.env.
   * This is the correct pattern for multi-profile calls:
   * each tenant profile spawns its own child process so credentials never bleed
   * between tenants.
   */
  getKeyed(
    poolKey: string,
    serverScriptPath: string,
    env: Record<string, string>,
  ): McpClient {
    if (pool.has(poolKey)) {
      return pool.get(poolKey)!;
    }
    logger.debug(`[McpClientPool] creating keyed client key=${poolKey}`);
    const client = new McpClient({ type: 'mcp', serverScriptPath, env });
    pool.set(poolKey, client);
    return client;
  },

  /**
   * Disconnect and remove a single keyed client.
   * Call this when a profile's credentials change so the next request respawns
   * with the updated credentials.
   */
  disconnectKeyed(poolKey: string): void {
    const client = pool.get(poolKey);
    if (client) {
      client.disconnect();
      pool.delete(poolKey);
      logger.debug(`[McpClientPool] disconnected keyed client key=${poolKey}`);
    }
  },

  /** Disconnect and remove all pooled clients (call on Maestro shutdown or full credential reset). */
  disconnectAll(): void {
    for (const [key, client] of pool) {
      logger.debug(`[McpClientPool] disconnecting ${key}`);
      client.disconnect();
    }
    pool.clear();
  },
};
