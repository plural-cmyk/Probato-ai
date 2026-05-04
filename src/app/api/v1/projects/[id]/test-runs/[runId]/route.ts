/**
 * v1 Test Run Detail
 * GET /api/v1/projects/[id]/test-runs/[runId]  — Get test run details with results
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "../../../../helpers";
import { apiError, apiSuccess } from "@/lib/api/middleware";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  return withAuth(request, ["read"], async (auth) => {
    const { id: projectId, runId } = await params;

    const project = await db.project.findFirst({
      where: { id: projectId, userId: auth.userId },
    });

    if (!project) {
      return apiError("Project not found", 404);
    }

    const testRun = await db.testRun.findFirst({
      where: { id: runId, projectId },
      include: {
        results: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!testRun) {
      return apiError("Test run not found", 404);
    }

    return apiSuccess(testRun, 200, auth.rateLimitHeaders);
  });
}
