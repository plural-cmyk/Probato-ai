/**
 * /api/self-heal/maintenance
 * GET: List maintenance records (filter by projectId, category, severity, status)
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
    const category = searchParams.get("category");
    const severity = searchParams.get("severity");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const where: Record<string, unknown> = {};

    // Filter by project ownership
    if (projectId) {
      const project = await db.project.findUnique({
        where: { id: projectId },
      });
      if (!project || project.userId !== session.user.id) {
        return NextResponse.json({ error: "Project not found or access denied" }, { status: 403 });
      }
      where.projectId = projectId;
    } else {
      // Only show records from user's projects
      const userProjects = await db.project.findMany({
        where: { userId: session.user.id },
        select: { id: true },
      });
      where.projectId = { in: userProjects.map((p) => p.id) };
    }

    if (category) where.category = category;
    if (severity) where.severity = severity;
    if (status) where.status = status;

    const [records, total] = await Promise.all([
      db.testMaintenanceRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.testMaintenanceRecord.count({ where }),
    ]);

    return NextResponse.json({ records, total, limit, offset });
  } catch (error: unknown) {
    console.error("List maintenance records error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
