/**
 * /api/intelligence/dependencies
 * GET:  List dependency edges for a project
 * POST: Rebuild dependency graph (deducts dependency_rebuild 3 credits)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildDependencyGraph } from "@/lib/agent/test-intelligence";
import { checkCredits, deductCredits } from "@/lib/billing/credits";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

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

    const edges = await db.testDependencyGraph.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ edges, total: edges.length });
  } catch (error: unknown) {
    console.error("List dependencies error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

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
    const creditCheck = await checkCredits(session.user.id, "dependency_rebuild");
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

    // Build dependency graph
    const result = await buildDependencyGraph(projectId);

    // Deduct credits
    const deduction = await deductCredits(
      session.user.id,
      "dependency_rebuild",
      "Dependency graph rebuild",
      result.edges > 0 ? projectId : undefined,
      "project"
    );

    return NextResponse.json({
      ...result,
      creditsDeducted: deduction.success ? deduction.deducted : 0,
      creditsBalance: deduction.balanceAfter,
    });
  } catch (error: unknown) {
    console.error("Rebuild dependencies error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
