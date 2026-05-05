/**
 * Probato SDK — Intelligence Resource
 *
 * SDK resource for AI Test Intelligence (M29).
 * Provides methods for smart test selection, flakiness analysis,
 * impact prioritization, and dependency graph queries.
 */

export interface IntelligenceSelectOptions {
  changedFiles?: string[];
  impactThreshold?: number;
}

export interface IntelligenceSelectResult {
  success: boolean;
  projectId: string;
  selectedTests: Array<{
    testCaseId: string;
    testName: string;
    reason: string;
    priorityScore: number;
  }>;
  skippedTests: string[];
  coveragePercent: number;
  rationale?: string;
}

export interface FlakinessAnalysisResult {
  success: boolean;
  projectId: string;
  reports: Array<{
    testCaseId: string;
    testName: string;
    flakinessScore: number;
    classification: string;
    primaryIndicator?: string;
    confidence: number;
  }>;
  summary: {
    stable: number;
    flaky: number;
    failing: number;
    unknown: number;
  };
}

export interface PrioritizeResult {
  success: boolean;
  projectId: string;
  priorityOrder: Array<{
    testCaseId: string;
    priorityScore: number;
    reason: string;
  }>;
  totalAffected: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export interface DependenciesResult {
  success: boolean;
  projectId: string;
  nodes: Array<{ id: string; name: string; type: string }>;
  edges: Array<{ from: string; to: string; type: string; confidence: number }>;
  cycleCount: number;
}

export class IntelligenceResource {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: { baseUrl: string; apiKey: string }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };
  }

  /** Smart test selection based on changed files and impact analysis */
  async select(
    projectId: string,
    options?: IntelligenceSelectOptions
  ): Promise<IntelligenceSelectResult> {
    const res = await fetch(`${this.baseUrl}/api/intelligence/select`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        projectId,
        changedFiles: options?.changedFiles,
        impactThreshold: options?.impactThreshold,
      }),
    });

    if (!res.ok) {
      throw new IntelligenceError(
        `Smart selection failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Flakiness analysis for a project's tests */
  async analyzeFlakiness(projectId: string): Promise<FlakinessAnalysisResult> {
    const res = await fetch(
      `${this.baseUrl}/api/intelligence/flakiness?projectId=${encodeURIComponent(projectId)}`,
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new IntelligenceError(
        `Flakiness analysis failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Impact prioritization for a project */
  async prioritize(projectId: string): Promise<PrioritizeResult> {
    const res = await fetch(`${this.baseUrl}/api/intelligence/prioritize`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ projectId }),
    });

    if (!res.ok) {
      throw new IntelligenceError(
        `Prioritization failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Dependency graph for a project */
  async getDependencies(projectId: string): Promise<DependenciesResult> {
    const res = await fetch(
      `${this.baseUrl}/api/intelligence/dependencies?projectId=${encodeURIComponent(projectId)}`,
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new IntelligenceError(
        `Dependencies query failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }
}

export class IntelligenceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "IntelligenceError";
    this.status = status;
  }
}
