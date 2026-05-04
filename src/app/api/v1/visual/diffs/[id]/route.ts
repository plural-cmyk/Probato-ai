/**
 * v1 Visual Diff Detail
 * GET /api/v1/visual/diffs/[id]  — Get visual diff details
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "../../../helpers";
import { apiError, apiSuccess } from "@/lib/api/middleware";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, ["read"], async (auth) => {
    const { id } = await params;

    // Get user's projects for scoping
    const userProjects = await db.project.findMany({
      where: { userId: auth.userId },
      select: { id: true },
    });
    const projectIds = userProjects.map((p) => p.id);

    const diff = await db.visualDiff.findFirst({
      where: { id, projectId: { in: projectIds } },
    });

    if (!diff) {
      return apiError("Visual diff not found", 404);
    }

    return apiSuccess(diff, 200, auth.rateLimitHeaders);
  });
}
