/**
 * GET /api/visual/diffs
 *
 * List visual diffs for the authenticated user.
 * Supports filtering by projectId, baselineId, status.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const baselineId = searchParams.get("baselineId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {
      project: { userId: session.user.id },
    };

    if (projectId) {
      where.projectId = projectId;
    }
    if (baselineId) {
      where.baselineId = baselineId;
    }
    if (status) {
      where.status = status;
    }

    const diffs = await prisma.visualDiff.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        mismatchPercent: true,
        mismatchPixels: true,
        totalPixels: true,
        threshold: true,
        reviewNote: true,
        reviewedAt: true,
        createdAt: true,
        baselineId: true,
        projectId: true,
        testRunId: true,
        baseline: {
          select: {
            id: true,
            name: true,
            url: true,
          },
        },
        project: {
          select: { id: true, name: true },
        },
        // Don't select screenshots — too large for list view
      },
    });

    // Summary stats
    const pendingCount = diffs.filter((d) => d.status === "pending").length;
    const approvedCount = diffs.filter((d) => d.status === "approved").length;
    const rejectedCount = diffs.filter((d) => d.status === "rejected").length;

    return NextResponse.json({
      diffs,
      summary: { total: diffs.length, pending: pendingCount, approved: approvedCount, rejected: rejectedCount },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Visual Diffs] Error:", message);
    return NextResponse.json(
      { error: "Failed to fetch diffs" },
      { status: 500 }
    );
  }
}
