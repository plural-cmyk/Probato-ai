/**
 * Probato SDK — Monitoring Resource
 *
 * SDK resource for Synthetic Monitoring (M31).
 * Provides methods for managing checkpoints, running them,
 * and accessing performance baselines/regressions.
 */

export interface Checkpoint {
  id: string;
  name: string;
  url: string;
  steps: Array<{ type: string; value?: string; selector?: string }>;
  intervalMinutes: number;
  severity: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  runCount: number;
  failCount: number;
  avgResponseTime: number;
  projectId: string | null;
  createdAt: string;
}

export interface CreateCheckpointData {
  name: string;
  url: string;
  steps: Array<{ type: string; value?: string; selector?: string }>;
  intervalMinutes?: number;
  severity?: string;
  projectId?: string;
}

export interface ListCheckpointsResult {
  success: boolean;
  checkpoints: Checkpoint[];
  total: number;
}

export interface CreateCheckpointResult {
  success: boolean;
  checkpoint: Checkpoint;
}

export interface RunCheckpointResult {
  success: boolean;
  result: {
    id: string;
    checkpointId: string;
    status: string;
    responseTime: number;
    stepResults: Array<{
      type: string;
      status: string;
      duration: number;
      error?: string;
    }>;
    lcp?: number;
    fid?: number;
    cls?: number;
    ttfb?: number;
  };
}

export interface Baseline {
  id: string;
  url: string;
  metricName: string;
  mean: number;
  stdDev: number;
  p50: number;
  p75: number;
  p95: number;
  sampleCount: number;
  warningThreshold: number;
  criticalThreshold: number;
}

export interface BaselinesResult {
  success: boolean;
  baselines: Baseline[];
  total: number;
}

export interface Regression {
  id: string;
  metricName: string;
  currentValue: number;
  baselineValue: number;
  degradationPercent: number;
  severity: string;
  status: string;
  createdAt: string;
}

export interface RegressionsResult {
  success: boolean;
  regressions: Regression[];
  total: number;
}

export class MonitoringResource {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: { baseUrl: string; apiKey: string }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };
  }

  /** List synthetic monitoring checkpoints */
  async listCheckpoints(projectId?: string): Promise<ListCheckpointsResult> {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);

    const res = await fetch(
      `${this.baseUrl}/api/monitoring/checkpoints?${params.toString()}`,
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new MonitoringError(
        `List checkpoints failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Create a new synthetic monitoring checkpoint */
  async createCheckpoint(
    data: CreateCheckpointData
  ): Promise<CreateCheckpointResult> {
    const res = await fetch(`${this.baseUrl}/api/monitoring/checkpoints`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      throw new MonitoringError(
        `Create checkpoint failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Run a synthetic monitoring checkpoint */
  async runCheckpoint(checkpointId: string): Promise<RunCheckpointResult> {
    const res = await fetch(
      `${this.baseUrl}/api/monitoring/checkpoints/${encodeURIComponent(checkpointId)}/run`,
      {
        method: "POST",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new MonitoringError(
        `Run checkpoint failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Get performance baselines */
  async getBaselines(url?: string): Promise<BaselinesResult> {
    const params = new URLSearchParams();
    if (url) params.set("url", url);

    const res = await fetch(
      `${this.baseUrl}/api/monitoring/baselines?${params.toString()}`,
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new MonitoringError(
        `Get baselines failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Get performance regressions */
  async getRegressions(status?: string): Promise<RegressionsResult> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);

    const res = await fetch(
      `${this.baseUrl}/api/monitoring/regressions?${params.toString()}`,
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new MonitoringError(
        `Get regressions failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }
}

export class MonitoringError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MonitoringError";
    this.status = status;
  }
}
