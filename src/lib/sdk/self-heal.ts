/**
 * Probato SDK — Self-Heal Resource
 *
 * SDK resource for Self-Healing v2 (M30).
 * Provides methods for auto-repairing selectors, listing repairs,
 * running maintenance scans, and checking deprecations.
 */

export interface AutoRepairOptions {
  testRunId?: string;
  projectId?: string;
  maxRepairs?: number;
}

export interface AutoRepairResult {
  success: boolean;
  totalHealed: number;
  totalFailed: number;
  duration: number;
  repairs: Array<{
    testCaseId: string;
    oldSelector: string;
    newSelector: string;
    confidence: number;
    status: string;
  }>;
}

export interface SelectorRepairEntry {
  id: string;
  testCaseId: string;
  oldSelector: string;
  newSelector: string;
  confidence: number;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
}

export interface SelectorRepairsResult {
  success: boolean;
  repairs: SelectorRepairEntry[];
  total: number;
}

export interface MaintenanceScanResult {
  success: boolean;
  records: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    effort: number;
    status: string;
  }>;
  summary: {
    deprecation: number;
    assertion_drift: number;
    step_staleness: number;
    code_quality: number;
  };
}

export interface DeprecationEntry {
  id: string;
  testCaseId: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  suggestedDiff: string | null;
  effort: number;
  status: string;
  createdAt: string;
}

export interface DeprecationsResult {
  success: boolean;
  deprecations: DeprecationEntry[];
  total: number;
}

export class SelfHealResource {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: { baseUrl: string; apiKey: string }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };
  }

  /** Auto-repair selectors for failed/flaky tests */
  async autoRepair(options: AutoRepairOptions): Promise<AutoRepairResult> {
    const res = await fetch(`${this.baseUrl}/api/self-heal/auto-repair`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(options),
    });

    if (!res.ok) {
      throw new SelfHealError(
        `Auto-repair failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Get selector repairs for a project */
  async getSelectorRepairs(
    projectId: string
  ): Promise<SelectorRepairsResult> {
    const res = await fetch(
      `${this.baseUrl}/api/self-heal/selector-repairs?projectId=${encodeURIComponent(projectId)}`,
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new SelfHealError(
        `Get selector repairs failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Run maintenance scan */
  async scanMaintenance(
    projectId: string
  ): Promise<MaintenanceScanResult> {
    const res = await fetch(
      `${this.baseUrl}/api/self-heal/maintenance/scan`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ projectId }),
      }
    );

    if (!res.ok) {
      throw new SelfHealError(
        `Maintenance scan failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Get deprecations for a project */
  async getDeprecations(projectId: string): Promise<DeprecationsResult> {
    const res = await fetch(
      `${this.baseUrl}/api/self-heal/deprecations?projectId=${encodeURIComponent(projectId)}`,
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new SelfHealError(
        `Get deprecations failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }
}

export class SelfHealError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SelfHealError";
    this.status = status;
  }
}
