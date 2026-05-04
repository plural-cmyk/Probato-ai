/**
 * Probato SDK - Main Entry Point
 *
 * @example
 * ```typescript
 * import { Probato } from '@probato/sdk';
 *
 * const client = new Probato({
 *   apiKey: 'pb_live_xxxxx',
 *   baseUrl: 'https://probato.ai/api/v1',  // optional
 * });
 *
 * // List projects
 * const { items } = await client.projects.list();
 *
 * // Create a project
 * const project = await client.projects.create({
 *   name: 'My App',
 *   repoUrl: 'https://github.com/user/my-app',
 * });
 *
 * // Discover features
 * const discovery = await client.discovery.discover({
 *   url: 'https://my-app.com',
 *   projectId: project.id,
 * });
 *
 * // Trigger a test run
 * const run = await client.projects.triggerTestRun(project.id);
 *
 * // Get billing summary
 * const billing = await client.billing.getSummary();
 * ```
 */

import { HttpClient, type HttpClientConfig } from "./http-client";
import { ProjectsResource } from "./resources/projects";
import { DiscoveryResource } from "./resources/discovery";
import { GenerationResource } from "./resources/generation";
import { SchedulesResource } from "./resources/schedules";
import { VisualResource } from "./resources/visual";
import { BillingResource } from "./resources/billing";
import { UsageResource } from "./resources/usage";

export interface ProbatoConfig {
  /** API key (starts with pb_live_ or pb_test_) */
  apiKey: string;
  /** Base URL for the API (default: https://probato.ai/api/v1) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Additional default headers */
  defaultHeaders?: Record<string, string>;
}

export class Probato {
  /** Project management */
  public readonly projects: ProjectsResource;

  /** Feature discovery */
  public readonly discovery: DiscoveryResource;

  /** Test generation */
  public readonly generation: GenerationResource;

  /** Schedule management */
  public readonly schedules: SchedulesResource;

  /** Visual regression */
  public readonly visual: VisualResource;

  /** Billing & subscription */
  public readonly billing: BillingResource;

  /** API usage stats */
  public readonly usage: UsageResource;

  private client: HttpClient;

  constructor(config: ProbatoConfig) {
    if (!config.apiKey) {
      throw new Error(
        "Probato SDK: apiKey is required. Get your API key from https://probato.ai/dashboard"
      );
    }

    this.client = new HttpClient({
      baseUrl: config.baseUrl ?? "https://probato.ai/api/v1",
      apiKey: config.apiKey,
      timeout: config.timeout,
      defaultHeaders: config.defaultHeaders,
    });

    this.projects = new ProjectsResource(this.client);
    this.discovery = new DiscoveryResource(this.client);
    this.generation = new GenerationResource(this.client);
    this.schedules = new SchedulesResource(this.client);
    this.visual = new VisualResource(this.client);
    this.billing = new BillingResource(this.client);
    this.usage = new UsageResource(this.client);
  }

  /**
   * Check if the API is healthy
   */
  async health(): Promise<{
    status: string;
    version: string;
    timestamp: string;
  }> {
    const response = await this.client.request<{
      status: string;
      version: string;
      timestamp: string;
    }>({
      method: "GET",
      path: "/health",
    });
    return response.data;
  }
}

// ── Exports ──────────────────────────────────────────────────────

export default Probato;

// Resources
export { ProjectsResource } from "./resources/projects";
export { DiscoveryResource } from "./resources/discovery";
export { GenerationResource } from "./resources/generation";
export { SchedulesResource } from "./resources/schedules";
export { VisualResource } from "./resources/visual";
export { BillingResource } from "./resources/billing";
export { UsageResource } from "./resources/usage";

// Errors
export {
  ProbatoError,
  AuthenticationError,
  RateLimitError,
  InsufficientCreditsError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "./errors";

// Types
export type * from "./types";
