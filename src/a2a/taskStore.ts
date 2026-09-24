// src/a2a/taskStore.ts — In-memory A2A task store with 24-hour TTL

import { randomUUID } from 'node:crypto';
import type { A2ATask, A2ATaskStatus, A2ATaskState } from './types.js';
import { logger } from '../utils/logger.js';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const TERMINAL_STATES: ReadonlySet<A2ATaskState> = new Set(['completed', 'failed', 'canceled']);

class TaskStore {
  private readonly tasks = new Map<string, { task: A2ATask; expiresAt: number }>();

  create(id?: string): A2ATask {
    const taskId = id ?? randomUUID();
    const task: A2ATask = {
      id: taskId,
      status: {
        state: 'submitted',
        timestamp: new Date().toISOString(),
      },
    };
    this.set(taskId, task);
    logger.debug(`[taskStore] created task ${taskId}`);
    return task;
  }

  get(id: string): A2ATask | undefined {
    const entry = this.tasks.get(id);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.tasks.delete(id);
      logger.debug(`[taskStore] task ${id} expired and removed`);
      return undefined;
    }
    return entry.task;
  }

  set(id: string, task: A2ATask): void {
    const expiresAt = Date.now() + TTL_MS;
    this.tasks.set(id, { task, expiresAt });
    this.scheduleCleanup(id);
  }

  updateStatus(id: string, status: A2ATaskStatus): A2ATask | undefined {
    const task = this.get(id);
    if (!task) return undefined;
    task.status = status;
    this.set(id, task);
    return task;
  }

  cancel(id: string): A2ATask | undefined {
    const task = this.get(id);
    if (!task) return undefined;
    if (TERMINAL_STATES.has(task.status.state)) {
      // Already in a terminal state — cannot cancel
      return undefined;
    }
    task.status = { state: 'canceled', timestamp: new Date().toISOString() };
    this.set(id, task);
    logger.debug(`[taskStore] task ${id} canceled`);
    return task;
  }

  private scheduleCleanup(id: string): void {
    const timer = setTimeout(() => {
      this.tasks.delete(id);
      logger.debug(`[taskStore] task ${id} cleaned up after TTL`);
    }, TTL_MS);
    timer.unref(); // do not prevent process exit
  }
}

export const taskStore = new TaskStore();
