/**
 * Probato SDK - Discovery Resource
 */

import type { HttpClient } from "../http-client";
import type { DiscoverParams, AsyncActionResponse } from "../types";

export class DiscoveryResource {
  constructor(private client: HttpClient) {}

  /**
   * Discover features from a URL
   * Costs 6 credits per use
   */
  async discover(params: DiscoverParams): Promise<AsyncActionResponse> {
    const response = await this.client.request<AsyncActionResponse>({
      method: "POST",
      path: "/discover",
      body: params,
    });
    return response.data;
  }
}
