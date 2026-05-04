/**
 * v1 Billing Credits
 * GET /api/v1/billing/credits  — Get credit balance and recent transactions
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, getPagination, paginatedResponse } from "../../helpers";
import { getCreditBalance, getCreditHistory, ensureUserBilling } from "@/lib/billing/credits";

export async function GET(request: NextRequest) {
  return withAuth(request, ["billing"], async (auth) => {
    await ensureUserBilling(auth.userId);
    const { limit, offset } = getPagination(request);

    const [balance, history] = await Promise.all([
      getCreditBalance(auth.userId),
      getCreditHistory(auth.userId, { limit, offset }),
    ]);

    return new Response(
      JSON.stringify({
        data: {
          balance,
          recentTransactions: history,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...(auth.rateLimitHeaders ?? {}),
        },
      }
    );
  });
}
