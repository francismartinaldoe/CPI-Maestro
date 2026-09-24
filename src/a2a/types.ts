// src/a2a/types.ts — A2A (Agent-to-Agent) protocol type definitions
// Based on the A2A open specification: https://google.github.io/A2A

// ── Message parts ────────────────────────────────────────────────────────────

export interface TextPart {
  type: 'text';
  text: string;
  metadata?: Record<string, unknown>;
}

export interface FilePart {
  type: 'file';
  file: {
    name?: string;
    mimeType?: string;
    bytes?: string;   // base64-encoded content
    uri?: string;     // alternative to bytes
  };
  metadata?: Record<string, unknown>;
}

export interface DataPart {
  type: 'data';
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type Part = TextPart | FilePart | DataPart;

// ── Message ──────────────────────────────────────────────────────────────────

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: Part[];
  metadata?: Record<string, unknown>;
}

// ── Task lifecycle ───────────────────────────────────────────────────────────

export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'completed'
  | 'failed'
  | 'input-required'
  | 'canceled';

export interface A2ATaskStatus {
  state: A2ATaskState;
  message?: A2AMessage;  // optional status message from the agent
  timestamp?: string;    // ISO-8601
}

export interface A2AArtifact {
  name?: string;
  description?: string;
  parts: Part[];
  index?: number;
  append?: boolean;
  lastChunk?: boolean;
  metadata?: Record<string, unknown>;
}

export interface A2ATask {
  id: string;
  sessionId?: string;
  status: A2ATaskStatus;
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
  metadata?: Record<string, unknown>;
}

// ── JSON-RPC 2.0 ─────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess<T> {
  jsonrpc: '2.0';
  id: string | number | null;
  result: T;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError;

// ── A2A error codes ──────────────────────────────────────────────────────────

export const A2AErrorCode = {
  // A2A-specific
  TaskNotFound:                  -32001,
  TaskNotCancelable:             -32002,
  PushNotificationNotSupported:  -32003,
  UnsupportedOperation:          -32004,
  ContentTypeNotSupported:       -32005,
  // JSON-RPC standard
  ParseError:                    -32700,
  InvalidRequest:                -32600,
  MethodNotFound:                -32601,
  InvalidParams:                 -32602,
  InternalError:                 -32603,
} as const;

// ── Per-method param types ───────────────────────────────────────────────────

export interface TaskSendParams {
  id?: string;
  sessionId?: string;
  message: A2AMessage;
  acceptedOutputModes?: string[];
  historyLength?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskGetParams {
  id: string;
  historyLength?: number;
}

export interface TaskCancelParams {
  id: string;
  metadata?: Record<string, unknown>;
}
