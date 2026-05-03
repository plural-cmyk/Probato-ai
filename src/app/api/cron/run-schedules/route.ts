/**
 * Probato Cron Trigger — Run Due Schedules
 *
 * POST /api/cron/run-schedules
 *
 * Called by Vercel Cron Jobs every 5 minutes (or manually).
 * Finds all enabled schedules that are due and executes them.
 *
 * Security: Protected by CRON_SECRET environment variable.
 * If CRON_SECRET is set, the request must include an
 * Authorization: Bearer <CRON_SECRET> header.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeDueSchedules, recalculateNextRuns } from "@/lib/scheduler/engine";

export const maxDuration = 300; // 5 minutes max for cron execution
export const dynamic = "force-dynamic";

// ── POST /api/cron/run-schedules ─ Execute due schedules ───────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret if configured
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      const bearerToken = authHeader?.replace("Bearer ", "");
      if (bearerToken !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    console.log("[Cron] Starting scheduled test execution...");

    // First, recalculate nextRunAt for any schedules that need it
    const recalculated = await recalculateNextRuns();
    if (recalculated > 0) {
      console.log(`[Cron] Recalculated nextRunAt for ${recalculated} schedules`);
    }

    // Execute due schedules
    const result = await executeDueSchedules();

    const duration = Date.now() - startTime;

    console.log(
      `[Cron] Completed: ${result.executed.length} executed, ` +
      `${result.skipped} skipped, ${result.errors} errors in ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      executed: result.executed.map((r) => ({
        scheduleId: r.scheduleId,
        scheduleName: r.scheduleName,
        testRunId: r.testRunId,
        status: r.status,
        duration: r.duration,
        error: r.error,
      })),
      totalExecuted: result.executed.length,
      skipped: result.skipped,
      errors: result.errors,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Cron] Schedule execution failed:", message);

    return NextResponse.json(
      {
        success: false,
        error: "Cron execution failed",
        details: message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// ── GET /api/cron/run-schedules ─ Health check for cron ────────────

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Schedule runner is available. Use POST to trigger execution.",
    cronConfigured: !!process.env.CRON_SECRET,
  });
}
