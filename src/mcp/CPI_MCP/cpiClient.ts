// src/mcp/CPI_MCP/cpiClient.ts — Unified SAP CPI HTTP client
//
// Supports OAuth2 client-credentials and HTTP Basic auth.
// One instance per (environment, credentials) pair — token is cached in-process.

import axios, { type AxiosInstance } from 'axios';
import type { CpiCredentials } from './config.js';
import type {
  CpiArtifact, CpiCredential, CpiDataStoreEntry, CpiJmsQueue,
  CpiKeystoreEntry, CpiMessageLog, CpiOAuthCredential, CpiPackage,
  CpiRuntimeArtifact, CpiServiceEndpoint, CpiValueMapping, CpiVariable,
} from './types.js';

export class CpiClient {
  private http!: AxiosInstance;
  private token  = '';
  private tokenExpiry = 0;

  constructor(private readonly creds: CpiCredentials) {}

  // ── Auth ────────────────────────────────────────────────────────────────────

  private async ensureToken(): Promise<void> {
    if (this.creds.username && this.creds.password) {
      // Basic auth — build axios instance once
      if (!this.http) this.buildHttp(`Basic ${Buffer.from(`${this.creds.username}:${this.creds.password}`).toString('base64')}`);
      return;
    }

    if (Date.now() < this.tokenExpiry - 30_000) return;

    const params = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     this.creds.clientId,
      client_secret: this.creds.clientSecret,
    });

    const res = await axios.post(this.creds.tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.token       = res.data.access_token as string;
    this.tokenExpiry = Date.now() + ((res.data.expires_in as number) ?? 3600) * 1000;
    this.buildHttp(`Bearer ${this.token}`);
  }

  private buildHttp(authHeader: string): void {
    this.http = axios.create({
      baseURL:  this.creds.tenantUrl,
      timeout:  20_000,
      headers: {
        Authorization:  authHeader,
        Accept:         'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    await this.ensureToken();
    const r = await this.http.get(path, { params });
    return (r.data?.d?.results ?? r.data?.d ?? r.data) as T;
  }

  // ── Runtime artifacts ───────────────────────────────────────────────────────

  async getRuntimeArtifacts(): Promise<CpiRuntimeArtifact[]> {
    return this.get('/api/v1/IntegrationRuntimeArtifacts');
  }

  async searchRuntimeArtifacts(opts: { nameFilter?: string; deployedAfter?: Date } = {}): Promise<CpiRuntimeArtifact[]> {
    const all = await this.getRuntimeArtifacts();
    return all.filter(a => {
      if (opts.nameFilter) {
        const n = opts.nameFilter.toLowerCase();
        if (!a.Name.toLowerCase().includes(n) && !a.Id.toLowerCase().includes(n)) return false;
      }
      if (opts.deployedAfter && a.DeployedOn) {
        const ts = new Date(a.DeployedOn).getTime();
        if (isNaN(ts) || ts < opts.deployedAfter.getTime()) return false;
      }
      return true;
    });
  }

  async getSystemStatus(): Promise<{ total: number; started: number; error: number; stopped: number }> {
    const all = await this.getRuntimeArtifacts();
    return {
      total:   all.length,
      started: all.filter(a => a.Status === 'STARTED').length,
      error:   all.filter(a => a.Status === 'ERROR').length,
      stopped: all.filter(a => a.Status === 'STOPPED').length,
    };
  }

  // ── Design-time ─────────────────────────────────────────────────────────────

  async getArtifact(id: string): Promise<CpiArtifact | null> {
    try {
      return await this.get<CpiArtifact>(
        `/api/v1/IntegrationDesigntimeArtifacts(Id='${encodeURIComponent(id)}',Version='active')`
      );
    } catch { return null; }
  }

  async getIflowConfigurations(id: string): Promise<Record<string, string>> {
    try {
      const rows = await this.get<Array<{ ParameterKey: string; ParameterValue: string }>>(
        `/api/v1/IntegrationDesigntimeArtifacts(Id='${encodeURIComponent(id)}',Version='active')/Configurations`
      );
      const out: Record<string, string> = {};
      if (Array.isArray(rows)) rows.forEach(r => { if (r.ParameterKey) out[r.ParameterKey] = r.ParameterValue ?? ''; });
      return out;
    } catch { return {}; }
  }

  async getIflowContent(id: string): Promise<Buffer | null> {
    await this.ensureToken();
    try {
      const r = await this.http.get(
        `/api/v1/IntegrationDesigntimeArtifacts(Id='${encodeURIComponent(id)}',Version='active')/$value`,
        { responseType: 'arraybuffer', timeout: 30_000 }
      );
      return Buffer.from(r.data as ArrayBuffer);
    } catch { return null; }
  }

  // ── Packages ────────────────────────────────────────────────────────────────

  async getPackages(): Promise<CpiPackage[]> {
    return this.get('/api/v1/IntegrationPackages');
  }

  async getPackageArtifacts(packageId: string): Promise<CpiArtifact[]> {
    try {
      return this.get(
        `/api/v1/IntegrationPackages('${encodeURIComponent(packageId)}')/IntegrationDesigntimeArtifacts`
      );
    } catch { return []; }
  }

  async getValueMappings(packageId: string): Promise<CpiValueMapping[]> {
    try {
      return this.get(
        `/api/v1/IntegrationPackages('${encodeURIComponent(packageId)}')/IntegrationDesigntimeArtifacts`,
        { $filter: "Type eq 'ValueMapping'" }
      );
    } catch { return []; }
  }

  // ── Message processing logs ─────────────────────────────────────────────────

  async getFailedMessages(opts: { artifactName?: string; fromDate?: string; top?: number } = {}): Promise<CpiMessageLog[]> {
    try {
      const filters = ["Status eq 'FAILED'"];
      if (opts.artifactName) filters.push(`IntegrationFlowName eq '${opts.artifactName}'`);
      if (opts.fromDate)     filters.push(`LogStart ge datetime'${opts.fromDate.replace('Z', '')}'`);
      return this.get<CpiMessageLog[]>('/api/v1/MessageProcessingLogs', {
        $filter:  filters.join(' and '),
        $orderby: 'LogStart desc',
        $top:     String(opts.top ?? 20),
      });
    } catch { return []; }
  }

  async getMessageDetails(messageId: string): Promise<CpiMessageLog | null> {
    try {
      return this.get<CpiMessageLog>(`/api/v1/MessageProcessingLogs('${encodeURIComponent(messageId)}')`);
    } catch { return null; }
  }

  async getRecentMessages(iflowId: string, top = 5): Promise<CpiMessageLog[]> {
    try {
      return this.get<CpiMessageLog[]>('/api/v1/MessageProcessingLogs', {
        $top:     String(top),
        $orderby: 'LogStart desc',
        $filter:  `IntegrationFlowName eq '${iflowId}'`,
      });
    } catch { return []; }
  }

  // ── Security artifacts ──────────────────────────────────────────────────────

  async getKeystoreEntries(): Promise<CpiKeystoreEntry[]> {
    return this.get('/api/v1/KeystoreEntries');
  }

  async getCredentials(): Promise<CpiCredential[]> {
    return this.get('/api/v1/UserCredentials');
  }

  async getOAuthCredentials(): Promise<CpiOAuthCredential[]> {
    return this.get('/api/v1/OAuth2ClientCredentials');
  }

  // ── Monitoring resources ────────────────────────────────────────────────────

  async getServiceEndpoints(protocol?: string): Promise<CpiServiceEndpoint[]> {
    try {
      const params: Record<string, string> = {};
      if (protocol) params.$filter = `Protocol eq '${protocol}'`;
      return this.get('/api/v1/ServiceEndpoints', params);
    } catch { return []; }
  }

  async getJmsQueues(): Promise<CpiJmsQueue[]> {
    try { return this.get('/api/v1/JmsResources'); } catch { return []; }
  }

  async getDataStoreEntries(opts: { dataStoreName?: string; integrationFlow?: string; top?: number } = {}): Promise<CpiDataStoreEntry[]> {
    try {
      const filters: string[] = [];
      if (opts.dataStoreName)   filters.push(`DataStoreName eq '${opts.dataStoreName}'`);
      if (opts.integrationFlow) filters.push(`IntegrationFlow eq '${opts.integrationFlow}'`);
      const params: Record<string, string> = { $top: String(opts.top ?? 50) };
      if (filters.length) params.$filter = filters.join(' and ');
      return this.get('/api/v1/DataStoreEntries', params);
    } catch { return []; }
  }

  async getVariables(integrationFlow?: string): Promise<CpiVariable[]> {
    try {
      const params: Record<string, string> = {};
      if (integrationFlow) params.$filter = `IntegrationFlow eq '${integrationFlow}'`;
      return this.get('/api/v1/Variables', params);
    } catch { return []; }
  }

  // ── Smoke-test ──────────────────────────────────────────────────────────────

  async pingEndpoint(url: string): Promise<{ reachable: boolean; statusCode?: number; error?: string }> {
    await this.ensureToken();
    try {
      const r = await this.http.head(url, {
        validateStatus: () => true,
        timeout: 8_000,
      });
      return { reachable: r.status < 500, statusCode: r.status };
    } catch (err) {
      return { reachable: false, error: (err as Error).message };
    }
  }
}
