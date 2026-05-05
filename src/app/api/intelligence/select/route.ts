/**
 * /api/intelligence/select
 * POST: Smart test selection based on changed files (deducts smart_selection 5 credits)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { smartSelectTests } from "@/lib/agent/test-intelligence";
import { checkCredits, deductCredits } from "@/lib/billing/credits";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, changedFiles } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    if (!changedFiles || !Array.isArray(changedFiles) || changedFiles.length === 0) {
      return NextResponse.json(
        { error: "changedFiles must be a non-empty array of file paths" },
        { status: 400 }
      );
    }

    // Verify project ownership
    const project = await db.project.findUnique({
      where: { id: projectId },
    });
    if (!project || project.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 403 }
      );
    }

    // Check credits
    const creditCheck = await checkCredits(session.user.id, "smart_selection");
    if (!creditCheck.hasCredits) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          creditsRequired: creditCheck.required,
          creditsBalance: creditCheck.balance,
        },
        { status: 402 }
      );
    }

    // Run smart selection
    const result = await smartSelectTests(projectId, changedFiles);

    // Deduct credits
    const deduction = await deductCredits(
      session.user.id,
      "smart_selection",
      "Smart test selection",
      result.id,
      "smart_selection"
    );

    return NextResponse.json({
      ...result,
      creditsDeducted: deduction.success ? deduction.deducted : 0,
      creditsBalance: deduction.balanceAfter,
    });
  } catch (error: unknown) {
    console.error("Smart select error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
