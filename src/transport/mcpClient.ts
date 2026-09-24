// src/transport/mcpClient.ts — Spawns and communicates with a local MCP server via stdio
// Used by McpClientPool to manage individual MCP server processes.

import { spawn, type ChildProcess } from 'node:child_process';
import type { McpTransportConfig } from '../orchestrator/types.js';
import { logger } from '../utils/logger.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class McpClient {
  private proc: ChildProcess | null = null;
  private pendingCalls = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private config: McpTransportConfig;
  private initialized = false;
  private buffer = '';

  constructor(config: McpTransportConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.proc) return;

    const env = { ...process.env, ...this.config.env };
    this.proc = spawn('node', [this.config.serverScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    this.proc.stderr?.on('data', (d: Buffer) => {
      logger.debug(`[mcp-stderr:${this.config.serverScriptPath.split('/').pop()}] ${d.toString().trim()}`);
    });

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.proc.on('exit', (code) => {
      logger.warn(`MCP server exited with code ${code} (${this.config.serverScriptPath.split('/').pop()})`);
      this.proc = null;
      this.initialized = false;
      for (const [id, pending] of this.pendingCalls) {
        pending.reject(new Error(`MCP server exited with code ${code ?? 'unknown'}`));
        this.pendingCalls.delete(id);
      }
    });

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'maestro', version: '1.0.0' },
    });
    await this.notify('notifications/initialized', {});
    this.initialized = true;
    logger.info(`MCP server connected: ${this.config.serverScriptPath.split('/').pop()}`);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.initialized) await this.connect();

    const result = await this.request('tools/call', {
      name,
      arguments: args,
    }) as { content?: Array<{ type: string; text?: string }> };

    if (!result?.content) return '(no content)';
    return result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
  }

  async listTools(): Promise<string[]> {
    if (!this.initialized) await this.connect();
    const result = await this.request('tools/list', {}) as { tools?: Array<{ name: string }> };
    return result?.tools?.map((t) => t.name) ?? [];
  }

  disconnect(): void {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
      this.initialized = false;
    }
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        const pending = this.pendingCalls.get(msg.id);
        if (!pending) continue;
        this.pendingCalls.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result);
        }
      } catch {
        // Non-JSON lines (e.g. debug output) — ignore
      }
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pendingCalls.set(id, { resolve, reject });

      const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      const line = JSON.stringify(msg) + '\n';

      if (!this.proc?.stdin) {
        this.pendingCalls.delete(id);
        reject(new Error('MCP server process not running'));
        return;
      }

      this.proc.stdin.write(line, (err) => {
        if (err) {
          this.pendingCalls.delete(id);
          reject(err);
        }
      });

      const timer = setTimeout(() => {
        if (this.pendingCalls.has(id)) {
          this.pendingCalls.delete(id);
          reject(new Error(`MCP call "${method}" timed out after 30s`));
        }
      }, 30_000);
      timer.unref();
    });
  }

  private notify(method: string, params: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) { resolve(); return; }
      const msg = { jsonrpc: '2.0', method, params };
      this.proc.stdin.write(JSON.stringify(msg) + '\n', (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }
}
