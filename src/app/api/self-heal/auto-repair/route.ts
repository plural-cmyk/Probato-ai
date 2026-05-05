/**
 * /api/self-heal/auto-repair
 * POST: Execute auto-repair for a test case
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { autoRepair } from "@/lib/agent/self-heal-v2";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { testCaseId, confidenceThreshold } = body;

    if (!testCaseId) {
      return NextResponse.json(
        { error: "testCaseId is required" },
        { status: 400 }
      );
    }

    // Verify test case ownership
    const testCase = await db.testCase.findUnique({
      where: { id: testCaseId },
      include: { feature: { include: { project: true } } },
    });
    if (!testCase || testCase.feature.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Test case not found or access denied" }, { status: 403 });
    }

    const threshold = typeof confidenceThreshold === "number" ? confidenceThreshold : 0.8;

    if (threshold < 0 || threshold > 1) {
      return NextResponse.json(
        { error: "confidenceThreshold must be between 0 and 1" },
        { status: 400 }
      );
    }

    const result = await autoRepair(testCaseId, threshold);

    return NextResponse.json({
      ...result,
      testCaseId,
      confidenceThreshold: threshold,
    });
  } catch (error: unknown) {
    console.error("Auto-repair error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
