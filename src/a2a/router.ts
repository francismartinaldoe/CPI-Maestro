// src/a2a/router.ts — Express router implementing the A2A JSON-RPC 2.0 task protocol
//
// Handles: tasks/send (sync), tasks/sendSubscribe (SSE streaming),
//          tasks/get (poll), tasks/cancel

import { Router, type Request, type Response } from 'express';
import type { Maestro } from '../orchestrator/maestro.js';
import { taskStore } from './taskStore.js';
import { extractText, orchestratorResponseToTask } from './messageAdapter.js';
import {
  A2AErrorCode,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type A2ATask,
  type TaskSendParams,
  type TaskGetParams,
  type TaskCancelParams,
} from './types.js';
import { logger } from '../utils/logger.js';

// ── JSON-RPC helpers ─────────────────────────────────────────────────────────

function success<T>(id: string | number | null, result: T): JsonRpcResponse<T> {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse<never> {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

// ── Method handlers ──────────────────────────────────────────────────────────

async function handleTasksSend(
  maestro: Maestro,
  rpcId: string | number | null,
  params: TaskSendParams,
  res: Response,
): Promise<void> {
  if (!params?.message) {
    res.json(rpcError(rpcId, A2AErrorCode.InvalidParams, 'params.message is required'));
    return;
  }

  const userText = extractText(params.message);
  if (!userText) {
    res.json(rpcError(rpcId, A2AErrorCode.InvalidParams, 'message must contain at least one non-empty text part'));
    return;
  }

  const task = taskStore.create(params.id);
  logger.info(`[a2a] tasks/send taskId=${task.id}`);

  taskStore.updateStatus(task.id, { state: 'working', timestamp: new Date().toISOString() });

  const response = await maestro.process(userText);
  const completed = orchestratorResponseToTask(response, task.id);
  taskStore.set(task.id, completed);

  logger.info(`[a2a] tasks/send completed taskId=${task.id} state=${completed.status.state}`);
  res.json(success(rpcId, completed));
}

async function handleTasksSendSubscribe(
  maestro: Maestro,
  rpcId: string | number | null,
  params: TaskSendParams,
  res: Response,
): Promise<void> {
  if (!params?.message) {
    res.json(rpcError(rpcId, A2AErrorCode.InvalidParams, 'params.message is required'));
    return;
  }

  const userText = extractText(params.message);
  if (!userText) {
    res.json(rpcError(rpcId, A2AErrorCode.InvalidParams, 'message must contain at least one non-empty text part'));
    return;
  }

  // Set SSE headers before any data is written
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const sendEvent = (data: unknown): void => {
    res.write(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const task = taskStore.create(params.id);
  logger.info(`[a2a] tasks/sendSubscribe taskId=${task.id}`);

  try {
    sendEvent(success(rpcId, { ...task }));

    taskStore.updateStatus(task.id, { state: 'working', timestamp: new Date().toISOString() });
    const working = taskStore.get(task.id);
    if (working) sendEvent(success(rpcId, { ...working }));

    const response = await maestro.process(userText);
    const completed = orchestratorResponseToTask(response, task.id);
    taskStore.set(task.id, completed);

    logger.info(`[a2a] tasks/sendSubscribe completed taskId=${task.id} state=${completed.status.state}`);
    sendEvent(success(rpcId, completed));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[a2a] tasks/sendSubscribe error taskId=${task.id}: ${msg}`);

    const failed = taskStore.updateStatus(task.id, {
      state: 'failed',
      timestamp: new Date().toISOString(),
      message: { role: 'agent', parts: [{ type: 'text', text: msg }] },
    });
    if (failed) sendEvent(success(rpcId, failed));

    sendEvent(rpcError(rpcId, A2AErrorCode.InternalError, msg));
  } finally {
    res.end();
  }
}

function handleTasksGet(
  rpcId: string | number | null,
  params: TaskGetParams,
  res: Response,
): void {
  if (!params?.id) {
    res.json(rpcError(rpcId, A2AErrorCode.InvalidParams, 'params.id is required'));
    return;
  }

  const task = taskStore.get(params.id);
  if (!task) {
    res.json(rpcError(rpcId, A2AErrorCode.TaskNotFound, `Task not found: ${params.id}`));
    return;
  }

  res.json(success(rpcId, task));
}

function handleTasksCancel(
  rpcId: string | number | null,
  params: TaskCancelParams,
  res: Response,
): void {
  if (!params?.id) {
    res.json(rpcError(rpcId, A2AErrorCode.InvalidParams, 'params.id is required'));
    return;
  }

  // Check if the task exists at all before trying to cancel
  const exists = taskStore.get(params.id);
  if (!exists) {
    res.json(rpcError(rpcId, A2AErrorCode.TaskNotFound, `Task not found: ${params.id}`));
    return;
  }

  const canceled = taskStore.cancel(params.id);
  if (!canceled) {
    // Task exists but is already in a terminal state
    res.json(rpcError(
      rpcId,
      A2AErrorCode.TaskNotCancelable,
      `Task ${params.id} is already in a terminal state (${exists.status.state}) and cannot be canceled`,
    ));
    return;
  }

  res.json(success(rpcId, canceled));
}

// ── Router factory ───────────────────────────────────────────────────────────

export function createA2ARouter(maestro: Maestro): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const rpc = req.body as JsonRpcRequest;

    // Validate JSON-RPC envelope
    if (!rpc || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
      res.status(400).json(rpcError(
        rpc?.id ?? null,
        A2AErrorCode.InvalidRequest,
        'Invalid JSON-RPC 2.0 request',
      ));
      return;
    }

    const { id, method, params } = rpc;

    try {
      switch (method) {
        case 'tasks/send':
          await handleTasksSend(maestro, id, params as TaskSendParams, res);
          break;

        case 'tasks/sendSubscribe':
          await handleTasksSendSubscribe(maestro, id, params as TaskSendParams, res);
          break;

        case 'tasks/get':
          handleTasksGet(id, params as TaskGetParams, res);
          break;

        case 'tasks/cancel':
          handleTasksCancel(id, params as TaskCancelParams, res);
          break;

        default:
          res.json(rpcError(id, A2AErrorCode.MethodNotFound, `Method not found: ${method}`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[a2a] unhandled error in ${method}: ${msg}`);
      res.json(rpcError(id, A2AErrorCode.InternalError, msg));
    }
  });

  return router;
}
