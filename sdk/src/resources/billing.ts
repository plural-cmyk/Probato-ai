/**
 * Probato SDK - Billing Resource
 */

import type { HttpClient } from "../http-client";
import type {
  BillingSummary,
  CreditBalance,
  SubscriptionInfo,
} from "../types";

export class BillingResource {
  constructor(private client: HttpClient) {}

  /**
   * Get billing overview (plan, credits summary)
   * Requires billing scope
   */
  async getSummary(): Promise<BillingSummary> {
    const response = await this.client.request<BillingSummary>({
      method: "GET",
      path: "/billing",
    });
    return response.data;
  }

  /**
   * Get credit balance and recent transactions
   * Requires billing scope
   */
  async getCredits(): Promise<{
    balance: CreditBalance | null;
    recentTransactions: unknown[];
  }> {
    const response = await this.client.request<{
      balance: CreditBalance | null;
      recentTransactions: unknown[];
    }>({
      method: "GET",
      path: "/billing/credits",
    });
    return response.data;
  }

  /**
   * Get current subscription details
   * Requires billing scope
   */
  async getSubscription(): Promise<SubscriptionInfo> {
    const response = await this.client.request<SubscriptionInfo>({
      method: "GET",
      path: "/billing/subscription",
    });
    return response.data;
  }
}
