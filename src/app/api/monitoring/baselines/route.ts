import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/monitoring/baselines ─ List performance baselines ──

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const url = searchParams.get("url");
    const metricName = searchParams.get("metricName");

    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (url) where.url = url;
    if (metricName) where.metricName = metricName;

    // Only return baselines for projects owned by the user or with null projectId
    if (!projectId) {
      where.OR = [
        { project: { userId: session.user.id } },
        { projectId: null },
      ];
    }

    const baselines = await db.performanceBaseline.findMany({
      where,
      orderBy: { lastComputedAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { regressions: true } },
      },
    });

    return NextResponse.json({ baselines });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Baselines] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch baselines", details: message }, { status: 500 });
  }
}
