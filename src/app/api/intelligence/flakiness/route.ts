/**
 * /api/intelligence/flakiness
 * GET: List flakiness reports with filters
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const classification = searchParams.get("classification");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    // Build where clause
    const where: Record<string, unknown> = {};

    if (classification) {
      where.classification = classification;
    }

    if (projectId) {
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

      // Get test case IDs for the project
      const features = await db.feature.findMany({
        where: { projectId },
        select: { id: true },
      });
      const featureIds = features.map((f) => f.id);

      const testCases = await db.testCase.findMany({
        where: { featureId: { in: featureIds } },
        select: { id: true },
      });
      const testCaseIds = testCases.map((tc) => tc.id);

      where.testCaseId = { in: testCaseIds };
    }

    const [reports, total] = await Promise.all([
      db.flakinessReport.findMany({
        where,
        orderBy: { flakinessScore: "desc" },
        take: limit,
        skip: offset,
        include: {
          testCase: {
            select: {
              id: true,
              name: true,
              feature: {
                select: {
                  id: true,
                  name: true,
                  projectId: true,
                },
              },
            },
          },
        },
      }),
      db.flakinessReport.count({ where }),
    ]);

    return NextResponse.json({ reports, total, limit, offset });
  } catch (error: unknown) {
    console.error("List flakiness reports error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
