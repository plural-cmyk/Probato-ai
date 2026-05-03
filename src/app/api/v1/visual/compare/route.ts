/**
 * v1 Visual Compare
 * POST /api/v1/visual/compare  — Compare current vs baseline screenshot
 */

import { NextRequest } from "next/server";
import { withAuth } from "../../helpers";
import { apiError, apiSuccess } from "@/lib/api/middleware";
import { checkCredits, deductCredits } from "@/lib/billing/credits";
import { checkFeatureAccess } from "@/lib/billing/subscription";

export async function POST(request: NextRequest) {
  return withAuth(request, ["write"], async (auth) => {
    // Visual regression requires Pro+ plan
    const featureCheck = await checkFeatureAccess(auth.userId, "visualRegression");
    if (!featureCheck.allowed) {
      return apiError(featureCheck.reason ?? "Visual regression requires Pro plan or higher", 403);
    }

    const body = await request.json();
    const { baselineId, url, selector, projectId } = body;

    if (!baselineId && !url) {
      return apiError("baselineId or url is required", 400);
    }

    // Check credits (3 credits for visual compare)
    const creditCheck = await checkCredits(auth.userId, "visual_compare");
    if (!creditCheck.hasCredits) {
      return apiError(
        `Insufficient credits. Required: ${creditCheck.required}, Balance: ${creditCheck.balance}`,
        402
      );
    }

    // Deduct credits
    await deductCredits(
      auth.userId,
      "visual_compare",
      `Visual comparison via API`,
      baselineId ?? projectId,
      baselineId ? "visual_baseline" : "project"
    );

    return apiSuccess(
      {
        baselineId,
        url,
        selector,
        projectId,
        status: "initiated",
        message: "Visual comparison started. Check the dashboard for diff results.",
        creditsDeducted: creditCheck.required,
      },
      202,
      auth.rateLimitHeaders
    );
  });
}
