/**
 * /api/self-heal/deprecations/[id]
 * GET: Get a single deprecation record with affected tests
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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

    const record = await db.testMaintenanceRecord.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, name: true, userId: true },
        },
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Deprecation record not found" }, { status: 404 });
    }

    // Verify ownership
    if (record.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Find other deprecation records for the same project with similar patterns
    let affectedTests: Array<{ id: string; name: string; title: string; severity: string }> = [];

    if (record.testCaseId) {
      // Get the test case to find similar deprecations
      const testCase = await db.testCase.findUnique({
        where: { id: record.testCaseId },
        select: { id: true, name: true },
      });

      if (testCase) {
        affectedTests.push({
          id: record.id,
          name: testCase.name,
          title: record.title,
          severity: record.severity,
        });
      }
    }

    // Find other deprecation records in the same project
    const relatedDeprecations = await db.testMaintenanceRecord.findMany({
      where: {
        projectId: record.projectId,
        category: "deprecation",
        id: { not: record.id },
        status: { notIn: ["dismissed", "resolved"] },
      },
      take: 20,
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    // Build affected tests list
    for (const dep of relatedDeprecations) {
      if (dep.testCaseId) {
        const tc = await db.testCase.findUnique({
          where: { id: dep.testCaseId },
          select: { id: true, name: true },
        });
        if (tc) {
          affectedTests.push({
            id: dep.id,
            name: tc.name,
            title: dep.title,
            severity: dep.severity,
          });
        }
      }
    }

    return NextResponse.json({
      record,
      affectedTests,
      relatedCount: relatedDeprecations.length,
    });
  } catch (error: unknown) {
    console.error("Get deprecation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
