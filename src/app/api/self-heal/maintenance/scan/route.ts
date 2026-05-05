/**
 * /api/self-heal/maintenance/scan
 * POST: Trigger a maintenance scan for a project (deducts maintenance_scan 6 credits)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { scanMaintenance } from "@/lib/agent/self-heal-v2";
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
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 403 });
    }

    // Check and deduct credits
    const creditCheck = await checkCredits(session.user.id, "maintenance_scan");
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

    // Run the scan
    const records = await scanMaintenance(projectId);

    // Deduct credits
    const deduction = await deductCredits(
      session.user.id,
      "maintenance_scan",
      `Maintenance scan for project: ${project.name}`,
      projectId,
      "project"
    );

    return NextResponse.json({
      records,
      totalFindings: records.length,
      creditsDeducted: deduction.success ? deduction.deducted : 0,
      creditsBalance: deduction.success ? deduction.balanceAfter : creditCheck.balance,
    });
  } catch (error: unknown) {
    console.error("Maintenance scan error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
