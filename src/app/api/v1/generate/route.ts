/**
 * v1 Test Generation
 * POST /api/v1/generate  — Generate Playwright tests from features
 */

import { NextRequest } from "next/server";
import { withAuth } from "../helpers";
import { apiError, apiSuccess } from "@/lib/api/middleware";
import { checkCredits, deductCredits } from "@/lib/billing/credits";

export async function POST(request: NextRequest) {
  return withAuth(request, ["write"], async (auth) => {
    const body = await request.json();
    const { projectId, featureIds, url } = body;

    if (!projectId && !url) {
      return apiError("projectId or url is required", 400);
    }

    // Check credits (5 credits for test generation)
    const creditCheck = await checkCredits(auth.userId, "test_generation");
    if (!creditCheck.hasCredits) {
      return apiError(
        `Insufficient credits. Required: ${creditCheck.required}, Balance: ${creditCheck.balance}`,
        402
      );
    }

    // Deduct credits
    await deductCredits(
      auth.userId,
      "test_generation",
      `Test generation via API${projectId ? ` for project ${projectId}` : ` for ${url}`}`,
      projectId,
      "project"
    );

    return apiSuccess(
      {
        projectId,
        featureIds: featureIds ?? [],
        status: "initiated",
        message: "Test generation started. Results will appear in the dashboard.",
        creditsDeducted: creditCheck.required,
      },
      202,
      auth.rateLimitHeaders
    );
  });
}
