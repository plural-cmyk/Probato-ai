/**
 * v1 Schedule Detail - Get, Update, Delete
 * GET    /api/v1/schedules/[id]  — Get schedule details
 * PATCH  /api/v1/schedules/[id]  — Update schedule
 * DELETE /api/v1/schedules/[id]  — Delete schedule
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

    const schedule = await db.schedule.findFirst({
      where: { id, userId: auth.userId },
    });

    if (!schedule) {
      return apiError("Schedule not found", 404);
    }

    return apiSuccess(schedule, 200, auth.rateLimitHeaders);
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, ["write"], async (auth) => {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.schedule.findFirst({
      where: { id, userId: auth.userId },
    });

    if (!existing) {
      return apiError("Schedule not found", 404);
    }

    const schedule = await db.schedule.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.url ? { url: body.url } : {}),
        ...(body.preset ? { preset: body.preset } : {}),
        ...(body.cronExpression ? { cronExpression: body.cronExpression } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });

    return apiSuccess(schedule, 200, auth.rateLimitHeaders);
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, ["write"], async (auth) => {
    const { id } = await params;

    const existing = await db.schedule.findFirst({
      where: { id, userId: auth.userId },
    });

    if (!existing) {
      return apiError("Schedule not found", 404);
    }

    await db.schedule.delete({ where: { id } });

    return apiSuccess({ deleted: true }, 200, auth.rateLimitHeaders);
  });
}
