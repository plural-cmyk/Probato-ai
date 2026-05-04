/**
 * Probato SDK - Projects Resource
 */

import type { HttpClient, RawResponse } from "../http-client";
import type {
  Project,
  CreateProjectParams,
  UpdateProjectParams,
  Feature,
  CreateFeatureParams,
  TestRun,
  TestResult,
  TriggerTestRunParams,
  PaginatedResponse,
  PaginationParams,
  AsyncActionResponse,
} from "../types";

export class ProjectsResource {
  constructor(private client: HttpClient) {}

  /**
   * List all projects
   */
  async list(params?: PaginationParams & { status?: string }): Promise<
    PaginatedResponse<Project> & { rateLimit?: unknown }
  > {
    const response = await this.client.request<PaginatedResponse<Project>>({
      method: "GET",
      path: "/projects",
      params: params as Record<string, string | number | undefined>,
    });
    return { ...response.data, rateLimit: response.rateLimit };
  }

  /**
   * Create a new project
   */
  async create(params: CreateProjectParams): Promise<Project> {
    const response = await this.client.request<Project>({
      method: "POST",
      path: "/projects",
      body: params,
    });
    return response.data;
  }

  /**
   * Get a project by ID
   */
  async get(id: string): Promise<Project> {
    const response = await this.client.request<Project>({
      method: "GET",
      path: `/projects/${id}`,
    });
    return response.data;
  }

  /**
   * Update a project
   */
  async update(id: string, params: UpdateProjectParams): Promise<Project> {
    const response = await this.client.request<Project>({
      method: "PATCH",
      path: `/projects/${id}`,
      body: params,
    });
    return response.data;
  }

  /**
   * Delete a project
   */
  async delete(id: string): Promise<void> {
    await this.client.request({
      method: "DELETE",
      path: `/projects/${id}`,
    });
  }

  // ── Nested: Features ────────────────────────────────────────

  /**
   * List features for a project
   */
  async listFeatures(
    projectId: string,
    params?: PaginationParams
  ): Promise<PaginatedResponse<Feature>> {
    const response = await this.client.request<PaginatedResponse<Feature>>({
      method: "GET",
      path: `/projects/${projectId}/features`,
      params: params as Record<string, string | number | undefined>,
    });
    return response.data;
  }

  /**
   * Add a feature to a project
   */
  async addFeature(
    projectId: string,
    params: CreateFeatureParams
  ): Promise<Feature> {
    const response = await this.client.request<Feature>({
      method: "POST",
      path: `/projects/${projectId}/features`,
      body: params,
    });
    return response.data;
  }

  // ── Nested: Test Runs ───────────────────────────────────────

  /**
   * List test runs for a project
   */
  async listTestRuns(
    projectId: string,
    params?: PaginationParams
  ): Promise<PaginatedResponse<TestRun>> {
    const response = await this.client.request<PaginatedResponse<TestRun>>({
      method: "GET",
      path: `/projects/${projectId}/test-runs`,
      params: params as Record<string, string | number | undefined>,
    });
    return response.data;
  }

  /**
   * Trigger a new test run for a project
   */
  async triggerTestRun(
    projectId: string,
    params?: TriggerTestRunParams
  ): Promise<{ id: string; status: string; message: string }> {
    const response = await this.client.request<{
      id: string;
      status: string;
      message: string;
    }>({
      method: "POST",
      path: `/projects/${projectId}/test-runs`,
      body: params ?? {},
    });
    return response.data;
  }

  /**
   * Get test run details with results
   */
  async getTestRun(
    projectId: string,
    runId: string
  ): Promise<TestRun & { results: TestResult[] }> {
    const response = await this.client.request<TestRun & { results: TestResult[] }>({
      method: "GET",
      path: `/projects/${projectId}/test-runs/${runId}`,
    });
    return response.data;
  }
}
