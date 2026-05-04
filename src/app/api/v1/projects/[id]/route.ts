/**
 * v1 Project Detail - Get, Update, Delete
 * GET    /api/v1/projects/[id]  — Get project details
 * PATCH  /api/v1/projects/[id]  — Update project
 * DELETE /api/v1/projects/[id]  — Delete project
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "../../helpers";
import { apiError, apiSuccess } from "@/lib/api/middleware";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, ["read"], async (auth) => {
    const { id } = await params;
    const project = await db.project.findFirst({
      where: { id, userId: auth.userId },
      include: {
        _count: { select: { features: true, testRuns: true, schedules: true } },
      },
    });

    if (!project) {
      return apiError("Project not found", 404);
    }

    return apiSuccess(project, 200, auth.rateLimitHeaders);
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, ["write"], async (auth) => {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.project.findFirst({
      where: { id, userId: auth.userId },
    });

    if (!existing) {
      return apiError("Project not found", 404);
    }

    const project = await db.project.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.branch ? { branch: body.branch } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });

    return apiSuccess(project, 200, auth.rateLimitHeaders);
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, ["write"], async (auth) => {
    const { id } = await params;

    const existing = await db.project.findFirst({
      where: { id, userId: auth.userId },
    });

    if (!existing) {
      return apiError("Project not found", 404);
    }

    await db.project.delete({ where: { id } });

    return apiSuccess({ deleted: true }, 200, auth.rateLimitHeaders);
  });
}
