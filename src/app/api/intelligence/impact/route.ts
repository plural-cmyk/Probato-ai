/**
 * /api/intelligence/impact
 * GET: List impact analysis results
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
    const limit = parseInt(searchParams.get("limit") ?? "10");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    // Build where clause — only show results for projects owned by the user
    const where: Record<string, unknown> = {};

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
      where.projectId = projectId;
    } else {
      // Only show results for projects owned by the user
      const userProjects = await db.project.findMany({
        where: { userId: session.user.id },
        select: { id: true },
      });
      where.projectId = { in: userProjects.map((p) => p.id) };
    }

    const [results, total] = await Promise.all([
      db.impactAnalysisResult.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.impactAnalysisResult.count({ where }),
    ]);

    return NextResponse.json({ results, total, limit, offset });
  } catch (error: unknown) {
    console.error("List impact results error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
