/**
 * Probato SDK - Type Definitions
 *
 * Shared types used across the SDK.
 */

// ── Common ──────────────────────────────────────────────────────

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ApiResponse<T> {
  data: T;
  status: number;
}

export interface ApiError {
  error: string;
  status: number;
}

// ── Projects ────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  repoUrl: string;
  repoName: string;
  branch: string;
  status: "pending" | "cloning" | "ready" | "error";
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    features: number;
    testRuns: number;
  };
}

export interface CreateProjectParams {
  name: string;
  repoUrl: string;
  repoName?: string;
  branch?: string;
}

export interface UpdateProjectParams {
  name?: string;
  branch?: string;
  status?: string;
}

// ── Features ────────────────────────────────────────────────────

export interface Feature {
  id: string;
  name: string;
  type: "route" | "component" | "form" | "api-endpoint" | "page";
  path: string | null;
  route: string | null;
  selector: string | null;
  description: string | null;
  priority: number;
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeatureParams {
  name: string;
  type: Feature["type"];
  path?: string;
  route?: string;
  selector?: string;
  description?: string;
  priority?: number;
  dependencies?: string[];
}

// ── Test Runs ───────────────────────────────────────────────────

export interface TestRun {
  id: string;
  status: "pending" | "running" | "passed" | "failed" | "error";
  triggeredBy: "manual" | "auto" | "auto-heal" | "push" | "pr" | "schedule" | "api";
  startedAt: string | null;
  endedAt: string | null;
  logs: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { results: number };
}

export interface TestResult {
  id: string;
  testName: string;
  featureName: string | null;
  status: "passed" | "failed" | "skipped" | "error";
  duration: number | null;
  error: string | null;
  screenshot: string | null;
  createdAt: string;
}

export interface TriggerTestRunParams {
  triggeredBy?: string;
}

// ── Discovery & Generation ──────────────────────────────────────

export interface DiscoverParams {
  url: string;
  projectId?: string;
}

export interface GenerateParams {
  projectId?: string;
  featureIds?: string[];
  url?: string;
}

export interface AsyncActionResponse {
  status: "initiated";
  message: string;
  creditsDeducted: number;
}

// ── Schedules ───────────────────────────────────────────────────

export interface Schedule {
  id: string;
  name: string;
  url: string;
  preset: "smoke" | "navigation" | "login" | "form" | "full-page-screenshot";
  cronExpression: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  nextRunAt: string | null;
  runCount: number;
  failCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleParams {
  name: string;
  url: string;
  cronExpression: string;
  preset?: Schedule["preset"];
  projectId?: string;
  enabled?: boolean;
}

export interface UpdateScheduleParams {
  name?: string;
  url?: string;
  preset?: Schedule["preset"];
  cronExpression?: string;
  enabled?: boolean;
}

// ── Visual Regression ───────────────────────────────────────────

export interface VisualBaseline {
  id: string;
  name: string;
  url: string;
  selector: string | null;
  viewportWidth: number;
  viewportHeight: number;
  captureIndex: number;
  approvedAt: string | null;
  createdAt: string;
  projectId: string;
}

export interface VisualDiff {
  id: string;
  status: "pending" | "approved" | "rejected";
  mismatchPercent: number;
  mismatchPixels: number;
  totalPixels: number;
  threshold: number;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  baselineId: string;
  projectId: string;
  testRunId: string | null;
}

export interface VisualCompareParams {
  baselineId?: string;
  url?: string;
  selector?: string;
  projectId?: string;
}

// ── Billing ─────────────────────────────────────────────────────

export interface CreditBalance {
  balance: number;
  monthlyAllowance: number;
  rolloverBalance: number;
  purchasedBalance: number;
  totalUsed: number;
  totalReceived: number;
}

export interface SubscriptionInfo {
  plan: "free" | "pro" | "team" | "enterprise";
  status: "active" | "past_due" | "canceling" | "canceled" | "trialing";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface BillingSummary {
  subscription: SubscriptionInfo;
  credits: CreditBalance;
  plan: {
    name: string;
    maxProjects: number;
    maxSchedules: number;
    features: string[];
  };
}

// ── Usage ───────────────────────────────────────────────────────

export interface UsageStats {
  usage: Array<{
    id: string;
    endpoint: string;
    method: string;
    statusCode: number;
    creditsUsed: number;
    responseTime: number | null;
    errorMessage: string | null;
    createdAt: string;
    apiKey: { name: string; prefix: string };
  }>;
  totalCount: number;
  aggregated: {
    totalCredits: number;
    avgResponseTime: number;
    totalRequests: number;
  };
  statusBreakdown: Array<{ statusCode: number; count: number }>;
  endpointBreakdown: Array<{ endpoint: string; count: number }>;
}

// ── Rate Limit Headers ──────────────────────────────────────────

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number;
}
