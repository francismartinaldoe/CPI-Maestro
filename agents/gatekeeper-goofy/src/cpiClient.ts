// ─────────────────────────────────────────────
//  cpiClient.ts  –  OAuth2 + CPI REST API calls
// ─────────────────────────────────────────────
import axios, { AxiosInstance } from 'axios';
import { Config } from './config';
import {
  CpiArtifact,
  CpiCredential,
  CpiKeystoreEntry,
  CpiMessageLog,
  CpiOAuthCredential,
  CpiRuntimeArtifact,
  CpiValueMapping,
} from './types';
import logger from './utils/logger';

export class CpiClient {
  private http!: AxiosInstance;
  private token = '';
  private tokenExpiry = 0;

  constructor(private cfg: Config) {}

  // ── OAuth2 token management ───────────────
  private async ensureToken(): Promise<void> {
    if (Date.now() < this.tokenExpiry - 30_000) return;

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
    });

    const res = await axios.post(this.cfg.tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.token = res.data.access_token;
    this.tokenExpiry = Date.now() + (res.data.expires_in ?? 3600) * 1000;

    this.http = axios.create({
      baseURL: this.cfg.tenantUrl,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });

    logger.debug('OAuth token refreshed');
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    await this.ensureToken();
    const r = await this.http.get(path, { params });
    return (r.data?.d?.results ?? r.data?.d ?? r.data) as T;
  }

  // ── Runtime artifacts ─────────────────────
  async getRuntimeArtifacts(): Promise<CpiRuntimeArtifact[]> {
    return this.get<CpiRuntimeArtifact[]>(
      '/api/v1/IntegrationRuntimeArtifacts'
    );
  }

  async getRuntimeArtifact(id: string): Promise<CpiRuntimeArtifact | null> {
    try {
      const list = await this.getRuntimeArtifacts();
      return list.find((a) => a.Id === id) ?? null;
    } catch {
      return null;
    }
  }

  // ── Design-time artifact ──────────────────
  async getArtifact(id: string, type = 'IntegrationFlow'): Promise<CpiArtifact | null> {
    try {
      const r = await this.get<CpiArtifact>(
        `/api/v1/IntegrationDesigntimeArtifacts(Id='${encodeURIComponent(id)}',Version='active')`
      );
      return r;
    } catch {
      return null;
    }
  }

  // ── Security: keystores ───────────────────
  async getKeystoreEntries(): Promise<CpiKeystoreEntry[]> {
    return this.get<CpiKeystoreEntry[]>('/api/v1/KeystoreEntries');
  }

  // ── Security: user credentials ───────────
  async getCredentials(): Promise<CpiCredential[]> {
    return this.get<CpiCredential[]>('/api/v1/UserCredentials');
  }

  // ── Security: OAuth2 credentials ─────────
  async getOAuthCredentials(): Promise<CpiOAuthCredential[]> {
    return this.get<CpiOAuthCredential[]>('/api/v1/OAuth2ClientCredentials');
  }

  // ── Value mappings ────────────────────────
  async getValueMappings(packageId: string): Promise<CpiValueMapping[]> {
    try {
      return this.get<CpiValueMapping[]>(
        `/api/v1/IntegrationPackages('${encodeURIComponent(packageId)}')/IntegrationDesigntimeArtifacts`,
        { $filter: "Type eq 'ValueMapping'" }
      );
    } catch {
      return [];
    }
  }

  async getDeployedValueMappings(): Promise<CpiRuntimeArtifact[]> {
    try {
      const all = await this.getRuntimeArtifacts();
      return all.filter((a) => a.Type === 'VALUE_MAPPING');
    } catch {
      return [];
    }
  }

  // ── Message processing logs ───────────────
  async getRecentMessages(iflowId: string, top = 5): Promise<CpiMessageLog[]> {
    try {
      return this.get<CpiMessageLog[]>('/api/v1/MessageProcessingLogs', {
        $top: String(top),
        $orderby: 'LogStart desc',
        $filter: `IntegrationFlowName eq '${iflowId}'`,
      });
    } catch {
      return [];
    }
  }

  // ── Message stats: error count (7d) + last success ────────────────────
  async getMessageStats(iflowId: string): Promise<{ errorCount7d: number; lastSuccessfulRun: string }> {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const allMsgs = await this.get<CpiMessageLog[]>('/api/v1/MessageProcessingLogs', {
        $orderby: 'LogStart desc',
        $filter: `IntegrationFlowName eq '${iflowId}' and LogStart ge datetime'${since.replace('Z', '')}'`,
        $top: '200',
      });
      const errorCount7d = allMsgs.filter((m) => m.Status === 'FAILED' || m.Status === 'ABANDONED').length;
      const lastSuccess = allMsgs.find((m) => m.Status === 'COMPLETED');
      return {
        errorCount7d,
        lastSuccessfulRun: lastSuccess?.LogEnd ?? lastSuccess?.LogStart ?? '—',
      };
    } catch {
      return { errorCount7d: 0, lastSuccessfulRun: '—' };
    }
  }

  // ── Externalized / configurable parameters ────────────────────────────
  async getIflowConfigurations(iflowId: string): Promise<Record<string, string>> {
    try {
      const result = await this.get<Array<{ ParameterKey: string; ParameterValue: string }>>(
        `/api/v1/IntegrationDesigntimeArtifacts(Id='${encodeURIComponent(iflowId)}',Version='active')/Configurations`
      );
      const out: Record<string, string> = {};
      if (Array.isArray(result)) {
        for (const item of result) {
          if (item.ParameterKey) out[item.ParameterKey] = item.ParameterValue ?? '';
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  // ── iFlow content (BPMN) for adapter/description extraction ──────────
  async getIflowDescription(iflowId: string): Promise<string> {
    try {
      const artifact = await this.getArtifact(iflowId);
      return (artifact as unknown as Record<string, string>)?.Description ?? '—';
    } catch {
      return '—';
    }
  }

  // ── Smoke-test: send synthetic payload ───
  async sendSmokeTestMessage(
    endpointUrl: string,
    payload: string,
    timeoutMs: number
  ): Promise<{ status: number; ok: boolean; error?: string }> {
    await this.ensureToken();
    try {
      const r = await this.http.post(endpointUrl, payload, {
        headers: { 'Content-Type': 'application/json', 'x-spot-check': 'true' },
        timeout: timeoutMs,
        validateStatus: () => true, // capture all statuses
      });
      return { status: r.status, ok: r.status >= 200 && r.status < 300 };
    } catch (err: unknown) {
      return { status: 0, ok: false, error: (err as Error).message };
    }
  }

  // ── Search deployed artifacts by name / deployed date ────────────────────
  async searchRuntimeArtifacts(opts: {
    nameFilter?: string;
    deployedAfter?: Date;
  }): Promise<CpiRuntimeArtifact[]> {
    const all = await this.getRuntimeArtifacts();
    return all.filter((a) => {
      if (opts.nameFilter) {
        const needle = opts.nameFilter.toLowerCase();
        if (!a.Name.toLowerCase().includes(needle) && !a.Id.toLowerCase().includes(needle)) {
          return false;
        }
      }
      if (opts.deployedAfter && a.DeployedOn) {
        const deployedTs = new Date(a.DeployedOn).getTime();
        if (isNaN(deployedTs) || deployedTs < opts.deployedAfter.getTime()) {
          return false;
        }
      }
      return true;
    });
  }

  // ── Endpoint ping ─────────────────────────
  async pingEndpoint(url: string): Promise<{ reachable: boolean; statusCode?: number; error?: string }> {
    await this.ensureToken();
    try {
      const r = await axios.head(url, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 8_000,
        validateStatus: () => true,
      });
      return { reachable: r.status < 500, statusCode: r.status };
    } catch (err: unknown) {
      return { reachable: false, error: (err as Error).message };
    }
  }

  // ── Packages ──────────────────────────────
  async getPackages(): Promise<Array<{ Id: string; Name: string; Version: string; ShortText?: string }>> {
    return this.get('/api/v1/IntegrationPackages');
  }

  async getPackageArtifacts(packageId: string): Promise<Array<{
    Id: string; Name: string; Version: string; PackageId: string;
    Type: string; Description?: string;
  }>> {
    try {
      return this.get(
        `/api/v1/IntegrationPackages('${encodeURIComponent(packageId)}')/IntegrationDesigntimeArtifacts`
      );
    } catch { return []; }
  }

  // ── iFlow ZIP content (BPMN2 + scripts) ──
  async getIflowContent(iflowId: string): Promise<Buffer | null> {
    await this.ensureToken();
    try {
      const r = await this.http.get(
        `/api/v1/IntegrationDesigntimeArtifacts(Id='${encodeURIComponent(iflowId)}',Version='active')/$value`,
        { responseType: 'arraybuffer', timeout: 30_000 }
      );
      return Buffer.from(r.data as ArrayBuffer);
    } catch { return null; }
  }

  // ── Failed messages ───────────────────────
  async getFailedMessages(opts: {
    artifactName?: string;
    fromDate?: string;
    top?: number;
  } = {}): Promise<CpiMessageLog[]> {
    try {
      const filters: string[] = ["Status eq 'FAILED'"];
      if (opts.artifactName) filters.push(`IntegrationFlowName eq '${opts.artifactName}'`);
      if (opts.fromDate)    filters.push(`LogStart ge datetime'${opts.fromDate.replace('Z', '')}'`);
      return this.get<CpiMessageLog[]>('/api/v1/MessageProcessingLogs', {
        $filter:  filters.join(' and '),
        $orderby: 'LogStart desc',
        $top:     String(opts.top ?? 20),
      });
    } catch { return []; }
  }

  // ── Message detail ────────────────────────
  async getMessageDetails(messageId: string): Promise<CpiMessageLog | null> {
    try {
      return this.get<CpiMessageLog>(
        `/api/v1/MessageProcessingLogs('${encodeURIComponent(messageId)}')`
      );
    } catch { return null; }
  }

  // ── Service endpoints ─────────────────────
  async getServiceEndpoints(protocol?: string): Promise<Array<{
    Name: string; Id: string; Protocol: string; Url: string; Type?: string;
  }>> {
    try {
      const params: Record<string, string> = {};
      if (protocol) params.$filter = `Protocol eq '${protocol}'`;
      return this.get('/api/v1/ServiceEndpoints', params);
    } catch { return []; }
  }

  // ── Log level ─────────────────────────────
  async setLogLevel(artifactId: string, logLevel: string): Promise<boolean> {
    await this.ensureToken();
    try {
      await this.http.put(
        `/api/v1/IntegrationRuntimeArtifacts('${encodeURIComponent(artifactId)}')/LogConfiguration`,
        { LogLevel: logLevel }
      );
      return true;
    } catch { return false; }
  }

  // ── Deploy artifact ───────────────────────
  async deployArtifact(artifactId: string, artifactType = 'IntegrationFlow'): Promise<{ taskId?: string; error?: string }> {
    await this.ensureToken();
    try {
      const r = await this.http.post(
        `/api/v1/DeployIntegrationDesigntimeArtifact?Id='${encodeURIComponent(artifactId)}'&Version='active'`,
        {}
      );
      const taskId = (r.data as Record<string, string>)?.TaskId ?? r.data?.d?.TaskId;
      return { taskId };
    } catch (err) { return { error: (err as Error).message }; }
  }

  // ── Deploy status ─────────────────────────
  async getDeployStatus(taskId: string): Promise<{ status: string; error?: string } | null> {
    try {
      return this.get(`/api/v1/BuildAndDeployStatus(TaskId='${encodeURIComponent(taskId)}')`);
    } catch { return null; }
  }

  // ── JMS queues ────────────────────────────
  async getJmsQueues(): Promise<Array<{ Name: string; Size: number; MaxSize: number; ConsumerCount?: number }>> {
    try { return this.get('/api/v1/JmsResources'); } catch { return []; }
  }

  // ── Data store entries ────────────────────
  async getDataStoreEntries(opts: {
    dataStoreName?: string;
    integrationFlow?: string;
    top?: number;
  } = {}): Promise<Array<{ Id: string; DataStoreName: string; IntegrationFlow?: string; Type: string; Status?: string }>> {
    try {
      const filters: string[] = [];
      if (opts.dataStoreName)  filters.push(`DataStoreName eq '${opts.dataStoreName}'`);
      if (opts.integrationFlow) filters.push(`IntegrationFlow eq '${opts.integrationFlow}'`);
      const params: Record<string, string> = { $top: String(opts.top ?? 50) };
      if (filters.length) params.$filter = filters.join(' and ');
      return this.get('/api/v1/DataStoreEntries', params);
    } catch { return []; }
  }

  // ── Variables ─────────────────────────────
  async getVariables(integrationFlow?: string): Promise<Array<{
    VariableName: string; IntegrationFlow?: string; Visibility?: string;
    UpdatedAt?: string; RetainUntil?: string;
  }>> {
    try {
      const params: Record<string, string> = {};
      if (integrationFlow) params.$filter = `IntegrationFlow eq '${integrationFlow}'`;
      return this.get('/api/v1/Variables', params);
    } catch { return []; }
  }

  // ── System status / alert count ───────────
  async getSystemStatus(): Promise<{ total: number; started: number; error: number; stopped: number }> {
    try {
      const all = await this.getRuntimeArtifacts();
      return {
        total:   all.length,
        started: all.filter((a) => a.Status === 'STARTED').length,
        error:   all.filter((a) => a.Status === 'ERROR').length,
        stopped: all.filter((a) => a.Status === 'STOPPED').length,
      };
    } catch { return { total: 0, started: 0, error: 0, stopped: 0 }; }
  }
}
