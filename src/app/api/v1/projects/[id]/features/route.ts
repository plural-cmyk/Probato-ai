/**
 * v1 Project Features - List & Create
 * GET  /api/v1/projects/[id]/features  — List features for a project
 * POST /api/v1/projects/[id]/features  — Add a feature to a project
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, getPagination, paginatedResponse } from "../../../helpers";
import { apiError, apiSuccess } from "@/lib/api/middleware";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, ["read"], async (auth) => {
    const { id: projectId } = await params;
    const { limit, offset } = getPagination(request);

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: projectId, userId: auth.userId },
    });

    if (!project) {
      return apiError("Project not found", 404);
    }

    const [features, total] = await Promise.all([
      db.feature.findMany({
        where: { projectId },
        orderBy: { priority: "asc" },
        take: limit,
        skip: offset,
      }),
      db.feature.count({ where: { projectId } }),
    ]);

    return paginatedResponse(features, total, limit, offset, auth.rateLimitHeaders);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, ["write"], async (auth) => {
    const { id: projectId } = await params;
    const body = await request.json();

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: projectId, userId: auth.userId },
    });

    if (!project) {
      return apiError("Project not found", 404);
    }

    if (!body.name || !body.type) {
      return apiError("name and type are required", 400);
    }

    const feature = await db.feature.create({
      data: {
        name: body.name,
        type: body.type,
        path: body.path,
        route: body.route,
        selector: body.selector,
        description: body.description,
        priority: body.priority ?? 0,
        dependencies: body.dependencies ?? [],
        projectId,
      },
    });

    return apiSuccess(feature, 201, auth.rateLimitHeaders);
  });
}
