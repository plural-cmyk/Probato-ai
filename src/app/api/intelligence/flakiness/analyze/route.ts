/**
 * /api/intelligence/flakiness/analyze
 * POST: Trigger flakiness analysis for a project (deducts flakiness_analysis 10 credits)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeFlakiness } from "@/lib/agent/test-intelligence";
import { checkCredits, deductCredits } from "@/lib/billing/credits";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
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
    const creditCheck = await checkCredits(session.user.id, "flakiness_analysis");
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

    // Run flakiness analysis
    const reports = await analyzeFlakiness(projectId);

    // Deduct credits
    const deduction = await deductCredits(
      session.user.id,
      "flakiness_analysis",
      "Flakiness analysis",
      projectId,
      "project"
    );

    // Count classifications
    const stable = reports.filter((r) => r.classification === "stable").length;
    const flaky = reports.filter((r) => r.classification === "flaky").length;
    const failing = reports.filter((r) => r.classification === "failing").length;
    const unknown = reports.filter((r) => r.classification === "unknown").length;

    return NextResponse.json({
      reports,
      summary: {
        total: reports.length,
        stable,
        flaky,
        failing,
        unknown,
      },
      creditsDeducted: deduction.success ? deduction.deducted : 0,
      creditsBalance: deduction.balanceAfter,
    });
  } catch (error: unknown) {
    console.error("Flakiness analysis error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
