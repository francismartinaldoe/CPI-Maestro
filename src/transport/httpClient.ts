// src/transport/httpClient.ts — HTTP client for FlowLens AI (Express backend)
// Also supports Gatekeeper-Goofy when running in HTTP transport mode.

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { logger } from '../utils/logger.js';

export class HttpClient {
  private client: AxiosInstance;

  constructor(baseUrl: string, defaultHeaders?: Record<string, string>) {
    this.client = axios.create({
      baseURL: baseUrl.replace(/\/$/, ''),
      timeout: 60_000,
      headers: {
        'Content-Type': 'application/json',
        ...defaultHeaders,
      },
    });

    this.client.interceptors.response.use(
      (r) => r,
      (err) => {
        const msg = err?.response?.data?.error ?? err?.message ?? String(err);
        logger.debug(`HTTP error: ${msg}`);
        return Promise.reject(new Error(msg));
      },
    );
  }

  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.get<T>(path, config);
    return res.data;
  }

  async post<T>(path: string, body: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.post<T>(path, body, config);
    return res.data;
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.get('/api/ping', { timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }
}
