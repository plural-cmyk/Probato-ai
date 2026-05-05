/**
 * /api/intelligence/prioritize
 * POST: Prioritize tests based on changed files (deducts impact_analysis 20 credits)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { prioritizeTests } from "@/lib/agent/test-intelligence";
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
    const creditCheck = await checkCredits(session.user.id, "impact_analysis");
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

    // Run prioritization
    const result = await prioritizeTests(projectId, changedFiles);

    // Deduct credits
    const deduction = await deductCredits(
      session.user.id,
      "impact_analysis",
      "Impact analysis and test prioritization",
      result.id,
      "impact_analysis"
    );

    return NextResponse.json({
      ...result,
      creditsDeducted: deduction.success ? deduction.deducted : 0,
      creditsBalance: deduction.balanceAfter,
    });
  } catch (error: unknown) {
    console.error("Prioritize tests error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
