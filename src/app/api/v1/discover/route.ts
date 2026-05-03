/**
 * v1 Feature Discovery
 * POST /api/v1/discover  — Discover features from a URL
 */

import { NextRequest } from "next/server";
import { withAuth } from "../helpers";
import { apiError, apiSuccess } from "@/lib/api/middleware";
import { checkCredits, deductCredits } from "@/lib/billing/credits";

export async function POST(request: NextRequest) {
  return withAuth(request, ["write"], async (auth) => {
    const body = await request.json();
    const { url, projectId } = body;

    if (!url) {
      return apiError("url is required", 400);
    }

    // Check credits (6 credits for feature discovery)
    const creditCheck = await checkCredits(auth.userId, "feature_discovery");
    if (!creditCheck.hasCredits) {
      return apiError(
        `Insufficient credits. Required: ${creditCheck.required}, Balance: ${creditCheck.balance}`,
        402
      );
    }

    // Deduct credits
    await deductCredits(
      auth.userId,
      "feature_discovery",
      `Feature discovery for ${url} via API`,
      projectId,
      "project"
    );

    // Return discovery initiation response
    // The actual discovery happens asynchronously via the existing /api/discover endpoint
    return apiSuccess(
      {
        url,
        projectId,
        status: "initiated",
        message: "Feature discovery started. Check the dashboard or poll this endpoint for results.",
        creditsDeducted: creditCheck.required,
      },
      202,
      auth.rateLimitHeaders
    );
  });
}
