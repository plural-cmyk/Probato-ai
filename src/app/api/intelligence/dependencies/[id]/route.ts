/**
 * /api/intelligence/dependencies/[id]
 * GET: Get dependency edges for a specific test case
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

    // Find the test case and verify access
    const testCase = await db.testCase.findUnique({
      where: { id },
      include: {
        feature: {
          include: { project: true },
        },
        dependencies: true,
      },
    });

    if (!testCase) {
      return NextResponse.json(
        { error: "Test case not found" },
        { status: 404 }
      );
    }

    if (testCase.feature.project.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      testCaseId: id,
      testCaseName: testCase.name,
      dependencies: testCase.dependencies,
      total: testCase.dependencies.length,
    });
  } catch (error: unknown) {
    console.error("Get dependency details error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
