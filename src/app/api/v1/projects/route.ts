/**
 * v1 Projects - List & Create
 * GET  /api/v1/projects   — List all projects for the authenticated user
 * POST /api/v1/projects   — Create a new project
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, getPagination, paginatedResponse } from "../helpers";
import { apiError, apiSuccess } from "@/lib/api/middleware";

export async function GET(request: NextRequest) {
  return withAuth(request, ["read"], async (auth) => {
    const { limit, offset } = getPagination(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");

    const where = {
      userId: auth.userId,
      ...(status ? { status } : {}),
    };

    const [projects, total] = await Promise.all([
      db.project.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          repoUrl: true,
          repoName: true,
          branch: true,
          status: true,
          lastRunAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { features: true, testRuns: true },
          },
        },
      }),
      db.project.count({ where }),
    ]);

    return paginatedResponse(projects, total, limit, offset, auth.rateLimitHeaders);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, ["write"], async (auth) => {
    const body = await request.json();
    const { name, repoUrl, repoName, branch } = body;

    if (!name || !repoUrl) {
      return apiError("name and repoUrl are required", 400);
    }

    // Check project limit
    const { checkProjectLimit } = await import("@/lib/billing/subscription");
    const limitCheck = await checkProjectLimit(auth.userId);
    if (!limitCheck.allowed) {
      return apiError(limitCheck.reason ?? "Project limit reached", 403);
    }

    const project = await db.project.create({
      data: {
        name,
        repoUrl,
        repoName: repoName ?? name,
        branch: branch ?? "main",
        userId: auth.userId,
      },
    });

    return apiSuccess(project, 201, auth.rateLimitHeaders);
  });
}
