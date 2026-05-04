/**
 * Probato SDK - Generation Resource
 */

import type { HttpClient } from "../http-client";
import type { GenerateParams, AsyncActionResponse } from "../types";

export class GenerationResource {
  constructor(private client: HttpClient) {}

  /**
   * Generate Playwright tests from features
   * Costs 5 credits per use
   */
  async generate(params: GenerateParams): Promise<AsyncActionResponse> {
    const response = await this.client.request<AsyncActionResponse>({
      method: "POST",
      path: "/generate",
      body: params,
    });
    return response.data;
  }
}
