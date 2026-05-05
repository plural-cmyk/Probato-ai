import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/monitoring/regressions ─ List performance regressions ──

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (severity) where.severity = severity;

    // Only return regressions for user's projects or with null projectId
    if (!projectId) {
      where.OR = [
        { project: { userId: session.user.id } },
        { projectId: null },
      ];
    }

    const [regressions, total] = await Promise.all([
      db.performanceRegression.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          baseline: { select: { id: true, url: true, metricName: true, mean: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      db.performanceRegression.count({ where }),
    ]);

    // Strip screenshots for list view
    const slimRegressions = regressions.map(({ screenshot, ...rest }) => ({
      ...rest,
      hasScreenshot: !!screenshot,
    }));

    return NextResponse.json({ regressions: slimRegressions, total, limit, offset });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Regressions] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch regressions", details: message }, { status: 500 });
  }
}
