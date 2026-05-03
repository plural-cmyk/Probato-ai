/**
 * Probato Schedule API — Single Schedule Operations
 *
 * GET    /api/schedules/[id]  — Get a single schedule
 * PATCH  /api/schedules/[id]  — Update a schedule
 * DELETE /api/schedules/[id]  — Delete a schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateCronExpression, getNextRunTime } from "@/lib/scheduler/engine";

export const dynamic = "force-dynamic";

// ── GET /api/schedules/[id] ─ Get schedule ─────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const schedule = await db.schedule.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, name: true, repoUrl: true },
        },
        testRuns: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            triggeredBy: true,
            startedAt: true,
            endedAt: true,
            logs: true,
          },
        },
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    if (schedule.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      schedule: {
        ...schedule,
        nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
        lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
        testRuns: schedule.testRuns.map((tr) => ({
          ...tr,
          startedAt: tr.startedAt?.toISOString() ?? null,
          endedAt: tr.endedAt?.toISOString() ?? null,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Schedule] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch schedule" }, { status: 500 });
  }
}

// ── PATCH /api/schedules/[id] ─ Update schedule ────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Find and verify ownership
    const existing = await db.schedule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }

    if (body.url !== undefined) {
      if (!body.url.trim()) {
        return NextResponse.json({ error: "URL cannot be empty" }, { status: 400 });
      }
      updateData.url = body.url.trim();
    }

    if (body.preset !== undefined) {
      const validPresets = ["smoke", "navigation", "login", "form", "full-page-screenshot"];
      updateData.preset = validPresets.includes(body.preset) ? body.preset : "smoke";
    }

    if (body.cronExpression !== undefined) {
      const cronValidation = validateCronExpression(body.cronExpression);
      if (!cronValidation.valid) {
        return NextResponse.json(
          { error: `Invalid cron expression: ${cronValidation.error}` },
          { status: 400 }
        );
      }
      updateData.cronExpression = body.cronExpression;
    }

    if (body.enabled !== undefined) {
      updateData.enabled = Boolean(body.enabled);
    }

    if (body.projectId !== undefined) {
      // Validate project ownership
      if (body.projectId) {
        const project = await db.project.findUnique({ where: { id: body.projectId } });
        if (!project || project.userId !== session.user.id) {
          return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }
      }
      updateData.projectId = body.projectId || null;
    }

    // Recalculate nextRunAt if cron or enabled changed
    if (body.cronExpression !== undefined || body.enabled !== undefined) {
      const newCron = (updateData.cronExpression as string) ?? existing.cronExpression;
      const newEnabled = updateData.enabled !== undefined ? Boolean(updateData.enabled) : existing.enabled;
      updateData.nextRunAt = newEnabled ? getNextRunTime(newCron) : null;
    }

    // Apply update
    const schedule = await db.schedule.update({
      where: { id },
      data: updateData,
      include: {
        project: {
          select: { id: true, name: true, repoUrl: true },
        },
      },
    });

    console.log(`[Schedule] Updated schedule "${schedule.name}" (${schedule.id})`);

    return NextResponse.json({
      schedule: {
        ...schedule,
        nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
        lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Schedule] PATCH failed:", message);
    return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
  }
}

// ── DELETE /api/schedules/[id] ─ Delete schedule ───────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.schedule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.schedule.delete({ where: { id } });

    console.log(`[Schedule] Deleted schedule "${existing.name}" (${id})`);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Schedule] DELETE failed:", message);
    return NextResponse.json({ error: "Failed to delete schedule" }, { status: 500 });
  }
}
