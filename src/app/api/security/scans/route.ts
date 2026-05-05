import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/security/scans ─ List security scans for a project ──

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    // Build where clause
    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;

    // Ensure user can only see their own scans
    if (!projectId) {
      where.userId = session.user.id;
    } else {
      // Verify project ownership
      const project = await db.project.findUnique({ where: { id: projectId } });
      if (!project || project.userId !== session.user.id) {
        return NextResponse.json({ error: "Project not found or access denied" }, { status: 403 });
      }
    }

    const [scans, total] = await Promise.all([
      db.securityScan.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.securityScan.count({ where }),
    ]);

    return NextResponse.json({
      scans,
      total,
      limit,
      offset,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Security-Scans] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch security scans", details: message }, { status: 500 });
  }
}
