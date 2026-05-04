/**
 * v1 API Usage Stats
 * GET /api/v1/usage  — Get API usage statistics for the authenticated user
 */

import { NextRequest } from "next/server";
import { withAuth } from "../helpers";
import { getApiUsageStats } from "@/lib/api/keys";

export async function GET(request: NextRequest) {
  return withAuth(request, ["read"], async (auth) => {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") ?? "30");
    const apiKeyId = url.searchParams.get("apiKeyId") ?? undefined;

    const stats = await getApiUsageStats(auth.userId, {
      days: Math.min(days, 90),
      apiKeyId,
    });

    return new Response(JSON.stringify({ data: stats }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...(auth.rateLimitHeaders ?? {}),
      },
    });
  });
}
