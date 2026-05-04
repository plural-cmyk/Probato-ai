/**
 * Probato SDK - Usage Resource
 */

import type { HttpClient } from "../http-client";
import type { UsageStats } from "../types";

export class UsageResource {
  constructor(private client: HttpClient) {}

  /**
   * Get API usage statistics
   */
  async getStats(params?: {
    days?: number;
    apiKeyId?: string;
  }): Promise<UsageStats> {
    const response = await this.client.request<UsageStats>({
      method: "GET",
      path: "/usage",
      params: params as Record<string, string | number | undefined>,
    });
    return response.data;
  }
}
