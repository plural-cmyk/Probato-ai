/**
 * Test Run Detail & Replay API
 *
 * GET /api/test/runs/[id] — Get full test run with step results and screenshots
 * PATCH /api/test/runs/[id] — Cancel a running test
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/test/runs/[id] ─ Get test run with full details ────

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

    const testRun = await db.testRun.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, userId: true } },
        results: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!testRun) {
      return NextResponse.json({ error: "Test run not found" }, { status: 404 });
    }

    // Verify access
    if (testRun.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({
      id: testRun.id,
      status: testRun.status,
      triggeredBy: testRun.triggeredBy,
      startedAt: testRun.startedAt,
      endedAt: testRun.endedAt,
      duration: testRun.endedAt && testRun.startedAt
        ? new Date(testRun.endedAt).getTime() - new Date(testRun.startedAt).getTime()
        : null,
      project: testRun.project,
      steps: testRun.results.map((result, index) => ({
        index,
        id: result.id,
        testName: result.testName,
        featureName: result.featureName,
        status: result.status,
        duration: result.duration,
        error: result.error,
        hasScreenshot: !!result.screenshot,
        createdAt: result.createdAt,
      })),
      summary: testRun.logs ? JSON.parse(testRun.logs) : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Test Run Detail] Error:", message);
    return NextResponse.json({ error: "Failed to get test run" }, { status: 500 });
  }
}

// ── PATCH /api/test/runs/[id] ─ Cancel a running test ───────────

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
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action !== "cancel") {
      return NextResponse.json({ error: "Only 'cancel' action is supported" }, { status: 400 });
    }

    const testRun = await db.testRun.findUnique({
      where: { id },
      include: { project: { select: { userId: true } } },
    });

    if (!testRun) {
      return NextResponse.json({ error: "Test run not found" }, { status: 404 });
    }

    if (testRun.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (testRun.status !== "running" && testRun.status !== "pending") {
      return NextResponse.json({ error: `Cannot cancel test run with status: ${testRun.status}` }, { status: 400 });
    }

    // Update the test run status
    await db.testRun.update({
      where: { id },
      data: { status: "error", endedAt: new Date(), logs: "Cancelled by user" },
    });

    return NextResponse.json({ success: true, message: "Test run cancelled" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Test Run Cancel] Error:", message);
    return NextResponse.json({ error: "Failed to cancel test run" }, { status: 500 });
  }
}
