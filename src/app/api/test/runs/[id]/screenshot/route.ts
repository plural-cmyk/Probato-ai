/**
 * Test Run Step Screenshot API
 *
 * GET /api/test/runs/[id]/screenshot?stepIndex=0
 *
 * Returns the screenshot for a specific step of a test run.
 * Used for step replay in the Live View — clicking on a past step
 * loads its screenshot on demand instead of embedding all screenshots
 * in the initial response (which would be too large).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

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
    const stepIndex = parseInt(request.nextUrl.searchParams.get("stepIndex") ?? "0", 10);

    if (isNaN(stepIndex) || stepIndex < 0) {
      return NextResponse.json({ error: "Invalid stepIndex parameter" }, { status: 400 });
    }

    const testRun = await db.testRun.findUnique({
      where: { id },
      include: {
        project: { select: { userId: true } },
        results: {
          orderBy: { createdAt: "asc" },
          skip: stepIndex,
          take: 1,
        },
      },
    });

    if (!testRun) {
      return NextResponse.json({ error: "Test run not found" }, { status: 404 });
    }

    if (testRun.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const result = testRun.results[0];
    if (!result) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    if (!result.screenshot) {
      return NextResponse.json({ error: "No screenshot available for this step" }, { status: 404 });
    }

    // Return the screenshot as a PNG image
    const buffer = Buffer.from(result.screenshot, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=86400", // Cache for 24h
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Screenshot] Error:", message);
    return NextResponse.json({ error: "Failed to get screenshot" }, { status: 500 });
  }
}
