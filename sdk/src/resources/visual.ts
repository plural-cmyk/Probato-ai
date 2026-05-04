/**
 * Probato SDK - Visual Regression Resource
 */

import type { HttpClient } from "../http-client";
import type {
  VisualBaseline,
  VisualDiff,
  VisualCompareParams,
  PaginatedResponse,
  PaginationParams,
  AsyncActionResponse,
} from "../types";

export class VisualResource {
  constructor(private client: HttpClient) {}

  /**
   * List visual baselines
   * Requires Pro plan or higher
   */
  async listBaselines(
    params?: PaginationParams & { projectId?: string }
  ): Promise<PaginatedResponse<VisualBaseline>> {
    const response = await this.client.request<PaginatedResponse<VisualBaseline>>({
      method: "GET",
      path: "/visual/baselines",
      params: params as Record<string, string | number | undefined>,
    });
    return response.data;
  }

  /**
   * Compare current screenshot against baseline
   * Costs 3 credits per use. Requires Pro plan.
   */
  async compare(params: VisualCompareParams): Promise<AsyncActionResponse> {
    const response = await this.client.request<AsyncActionResponse>({
      method: "POST",
      path: "/visual/compare",
      body: params,
    });
    return response.data;
  }

  /**
   * List visual diffs
   */
  async listDiffs(
    params?: PaginationParams & {
      status?: string;
      projectId?: string;
    }
  ): Promise<PaginatedResponse<VisualDiff>> {
    const response = await this.client.request<PaginatedResponse<VisualDiff>>({
      method: "GET",
      path: "/visual/diffs",
      params: params as Record<string, string | number | undefined>,
    });
    return response.data;
  }

  /**
   * Get visual diff details
   */
  async getDiff(id: string): Promise<VisualDiff> {
    const response = await this.client.request<VisualDiff>({
      method: "GET",
      path: `/visual/diffs/${id}`,
    });
    return response.data;
  }
}
