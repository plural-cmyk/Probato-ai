/**
 * v1 Billing Overview
 * GET /api/v1/billing  — Get billing overview (plan, credits summary)
 */

import { NextRequest } from "next/server";
import { withAuth } from "../helpers";
import { getBillingSummary } from "@/lib/billing/subscription";

export async function GET(request: NextRequest) {
  return withAuth(request, ["billing"], async (auth) => {
    const summary = await getBillingSummary(auth.userId);
    return new Response(JSON.stringify({ data: summary }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...(auth.rateLimitHeaders ?? {}),
      },
    });
  });
}
