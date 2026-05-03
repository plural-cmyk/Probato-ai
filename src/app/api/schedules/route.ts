/**
 * Probato Schedules API
 *
 * GET  /api/schedules          — List all schedules for the authenticated user
 * POST /api/schedules          — Create a new schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateCronExpression, getNextRunTime } from "@/lib/scheduler/engine";

export const dynamic = "force-dynamic";

// ── GET /api/schedules ─ List schedules ────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id as string;
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const enabledOnly = url.searchParams.get("enabled") === "true";

    const where: Record<string, unknown> = { userId };
    if (projectId) where.projectId = projectId;
    if (enabledOnly) where.enabled = true;

    const schedules = await db.schedule.findMany({
      where,
      include: {
        project: {
          select: { id: true, name: true, repoUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      schedules: schedules.map((s) => ({
        ...s,
        nextRunAt: s.nextRunAt?.toISOString() ?? null,
        lastRunAt: s.lastRunAt?.toISOString() ?? null,
      })),
      total: schedules.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Schedules] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
  }
}

// ── POST /api/schedules ─ Create schedule ──────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id as string;
    const body = await request.json();

    const { name, url, preset, cronExpression, projectId, enabled } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }
    if (!cronExpression || typeof cronExpression !== "string") {
      return NextResponse.json({ error: "Cron expression is required" }, { status: 400 });
    }

    // Validate cron expression
    const cronValidation = validateCronExpression(cronExpression);
    if (!cronValidation.valid) {
      return NextResponse.json(
        { error: `Invalid cron expression: ${cronValidation.error}` },
        { status: 400 }
      );
    }

    // Validate preset
    const validPresets = ["smoke", "navigation", "login", "form", "full-page-screenshot"];
    const resolvedPreset = validPresets.includes(preset) ? preset : "smoke";

    // Validate project ownership if projectId provided
    if (projectId) {
      const project = await db.project.findUnique({
        where: { id: projectId },
      });
      if (!project || project.userId !== userId) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
    }

    // Calculate next run time
    const nextRunAt = enabled !== false ? getNextRunTime(cronExpression) : null;

    // Create the schedule
    const schedule = await db.schedule.create({
      data: {
        name: name.trim(),
        url: url.trim(),
        preset: resolvedPreset,
        cronExpression,
        enabled: enabled !== false,
        nextRunAt,
        userId,
        projectId: projectId || null,
      },
      include: {
        project: {
          select: { id: true, name: true, repoUrl: true },
        },
      },
    });

    console.log(
      `[Schedules] Created schedule "${schedule.name}" (${schedule.id}) ` +
      `with cron "${cronExpression}" → next run: ${nextRunAt?.toISOString() ?? "disabled"}`
    );

    return NextResponse.json(
      {
        schedule: {
          ...schedule,
          nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
          lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
        },
        cronDescription: cronValidation.description,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Schedules] POST failed:", message);
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}
