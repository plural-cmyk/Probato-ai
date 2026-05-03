/**
 * v1 Visual Baselines - List
 * GET /api/v1/visual/baselines  — List visual baselines
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, getPagination, paginatedResponse } from "../../helpers";

export async function GET(request: NextRequest) {
  return withAuth(request, ["read"], async (auth) => {
    const { limit, offset } = getPagination(request);
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");

    const where = {
      userId: auth.userId,
      ...(projectId ? { projectId } : {}),
    };

    const [baselines, total] = await Promise.all([
      db.visualBaseline.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          url: true,
          selector: true,
          viewportWidth: true,
          viewportHeight: true,
          captureIndex: true,
          approvedAt: true,
          createdAt: true,
          projectId: true,
          _count: { select: { diffs: true } },
        },
      }),
      db.visualBaseline.count({ where }),
    ]);

    return paginatedResponse(baselines, total, limit, offset, auth.rateLimitHeaders);
  });
}
