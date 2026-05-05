import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/monitoring/regressions/[id] ─ Get regression details ──

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
    const regression = await db.performanceRegression.findUnique({
      where: { id },
      include: {
        baseline: {
          select: {
            id: true,
            url: true,
            metricName: true,
            mean: true,
            stdDev: true,
            p50: true,
            p75: true,
            p95: true,
            warningThreshold: true,
            criticalThreshold: true,
          },
        },
        project: { select: { id: true, name: true, userId: true } },
      },
    });

    if (!regression) {
      return NextResponse.json({ error: "Regression not found" }, { status: 404 });
    }

    if (regression.project && regression.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ regression });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Regression] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch regression", details: message }, { status: 500 });
  }
}

// ── PATCH /api/monitoring/regressions/[id] ─ Update regression status (acknowledge, resolve, dismiss) ──

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const regression = await db.performanceRegression.findUnique({
      where: { id },
      include: { project: { select: { userId: true } } },
    });

    if (!regression) {
      return NextResponse.json({ error: "Regression not found" }, { status: 404 });
    }
    if (regression.project && regression.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { status } = body;

    if (!["acknowledged", "resolved", "dismissed"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be one of: acknowledged, resolved, dismissed" },
        { status: 400 }
      );
    }

    const updated = await db.performanceRegression.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === "resolved" ? new Date() : undefined,
      },
    });

    return NextResponse.json({ regression: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Regression] PATCH failed:", message);
    return NextResponse.json({ error: "Failed to update regression", details: message }, { status: 500 });
  }
}
