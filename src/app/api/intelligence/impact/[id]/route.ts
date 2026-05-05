/**
 * /api/intelligence/impact/[id]
 * GET: Get a single impact analysis result
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

    const result = await db.impactAnalysisResult.findUnique({
      where: { id },
    });

    if (!result) {
      return NextResponse.json(
        { error: "Impact analysis result not found" },
        { status: 404 }
      );
    }

    // Verify access via project ownership
    const project = await db.project.findUnique({
      where: { id: result.projectId },
    });
    if (!project || project.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    return NextResponse.json({ result });
  } catch (error: unknown) {
    console.error("Get impact result error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
