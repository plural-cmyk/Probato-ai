/**
 * v1 Billing Subscription
 * GET /api/v1/billing/subscription  — Get current subscription details
 */

import { NextRequest } from "next/server";
import { withAuth } from "../../helpers";
import { getSubscriptionInfo } from "@/lib/billing/subscription";

export async function GET(request: NextRequest) {
  return withAuth(request, ["billing"], async (auth) => {
    const info = await getSubscriptionInfo(auth.userId);
    return new Response(JSON.stringify({ data: info }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...(auth.rateLimitHeaders ?? {}),
      },
    });
  });
}
