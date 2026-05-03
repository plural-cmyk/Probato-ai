/**
 * v1 Schedules - List & Create
 * GET  /api/v1/schedules  — List all schedules
 * POST /api/v1/schedules  — Create a new schedule
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, getPagination, paginatedResponse } from "../helpers";
import { apiError, apiSuccess } from "@/lib/api/middleware";

export async function GET(request: NextRequest) {
  return withAuth(request, ["read"], async (auth) => {
    const { limit, offset } = getPagination(request);

    const [schedules, total] = await Promise.all([
      db.schedule.findMany({
        where: { userId: auth.userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.schedule.count({ where: { userId: auth.userId } }),
    ]);

    return paginatedResponse(schedules, total, limit, offset, auth.rateLimitHeaders);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, ["write"], async (auth) => {
    const body = await request.json();
    const { name, url, preset, cronExpression, projectId, enabled } = body;

    if (!name || !url || !cronExpression) {
      return apiError("name, url, and cronExpression are required", 400);
    }

    // Check schedule limit
    const { checkScheduleLimit } = await import("@/lib/billing/subscription");
    const limitCheck = await checkScheduleLimit(auth.userId);
    if (!limitCheck.allowed) {
      return apiError(limitCheck.reason ?? "Schedule limit reached", 403);
    }

    const schedule = await db.schedule.create({
      data: {
        name,
        url,
        preset: preset ?? "smoke",
        cronExpression,
        enabled: enabled ?? true,
        userId: auth.userId,
        projectId: projectId ?? null,
      },
    });

    return apiSuccess(schedule, 201, auth.rateLimitHeaders);
  });
}
