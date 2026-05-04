/**
 * v1 Visual Diffs - List
 * GET /api/v1/visual/diffs  — List visual diffs
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, getPagination, paginatedResponse } from "../../helpers";

export async function GET(request: NextRequest) {
  return withAuth(request, ["read"], async (auth) => {
    const { limit, offset } = getPagination(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const projectId = url.searchParams.get("projectId");

    // Get user's projects for scoping
    const userProjects = await db.project.findMany({
      where: { userId: auth.userId },
      select: { id: true },
    });
    const projectIds = userProjects.map((p) => p.id);

    const where = {
      projectId: { in: projectIds },
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
    };

    const [diffs, total] = await Promise.all([
      db.visualDiff.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          status: true,
          mismatchPercent: true,
          mismatchPixels: true,
          totalPixels: true,
          threshold: true,
          reviewNote: true,
          reviewedAt: true,
          createdAt: true,
          baselineId: true,
          projectId: true,
          testRunId: true,
        },
      }),
      db.visualDiff.count({ where }),
    ]);

    return paginatedResponse(diffs, total, limit, offset, auth.rateLimitHeaders);
  });
}
