/**
 * v1 Project Test Runs - List & Create
 * GET  /api/v1/projects/[id]/test-runs   — List test runs for a project
 * POST /api/v1/projects/[id]/test-runs   — Trigger a new test run
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, getPagination, paginatedResponse } from "../../../helpers";
import { apiError, apiSuccess } from "@/lib/api/middleware";
import { checkCredits, deductCredits } from "@/lib/billing/credits";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, ["read"], async (auth) => {
    const { id: projectId } = await params;
    const { limit, offset } = getPagination(request);

    const project = await db.project.findFirst({
      where: { id: projectId, userId: auth.userId },
    });

    if (!project) {
      return apiError("Project not found", 404);
    }

    const [testRuns, total] = await Promise.all([
      db.testRun.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          _count: { select: { results: true } },
        },
      }),
      db.testRun.count({ where: { projectId } }),
    ]);

    return paginatedResponse(testRuns, total, limit, offset, auth.rateLimitHeaders);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, ["write"], async (auth) => {
    const { id: projectId } = await params;
    const body = await request.json();

    const project = await db.project.findFirst({
      where: { id: projectId, userId: auth.userId },
    });

    if (!project) {
      return apiError("Project not found", 404);
    }

    // Check credits for test execution (2 credits/min, minimum 1 minute)
    const creditCheck = await checkCredits(auth.userId, "test_execution");
    if (!creditCheck.hasCredits) {
      return apiError(
        `Insufficient credits. Required: ${creditCheck.required}, Balance: ${creditCheck.balance}`,
        402
      );
    }

    // Create test run
    const testRun = await db.testRun.create({
      data: {
        projectId,
        status: "pending",
        triggeredBy: body.triggeredBy ?? "api",
      },
    });

    // Deduct credits (minimum 1 minute = 2 credits)
    await deductCredits(
      auth.userId,
      "test_execution",
      `Test run ${testRun.id} via API`,
      testRun.id,
      "test_run",
      1
    );

    return apiSuccess(
      {
        id: testRun.id,
        status: testRun.status,
        message: "Test run created. Use the dashboard to monitor execution.",
      },
      201,
      auth.rateLimitHeaders
    );
  });
}
