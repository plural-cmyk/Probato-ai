import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/monitoring/baselines/[id] ─ Get baseline details ──

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
    const baseline = await db.performanceBaseline.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, userId: true } },
        regressions: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!baseline) {
      return NextResponse.json({ error: "Baseline not found" }, { status: 404 });
    }

    // Access check
    if (baseline.project && baseline.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ baseline });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Baseline] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch baseline", details: message }, { status: 500 });
  }
}

// ── PATCH /api/monitoring/baselines/[id] ─ Update baseline thresholds ──

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
    const baseline = await db.performanceBaseline.findUnique({
      where: { id },
      include: { project: { select: { userId: true } } },
    });

    if (!baseline) {
      return NextResponse.json({ error: "Baseline not found" }, { status: 404 });
    }

    if (baseline.project && baseline.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { warningThreshold, criticalThreshold } = body;

    if (warningThreshold !== undefined && (warningThreshold < 0 || warningThreshold > 100)) {
      return NextResponse.json({ error: "warningThreshold must be between 0 and 100" }, { status: 400 });
    }
    if (criticalThreshold !== undefined && (criticalThreshold < 0 || criticalThreshold > 100)) {
      return NextResponse.json({ error: "criticalThreshold must be between 0 and 100" }, { status: 400 });
    }

    const updated = await db.performanceBaseline.update({
      where: { id },
      data: {
        ...(warningThreshold !== undefined && { warningThreshold }),
        ...(criticalThreshold !== undefined && { criticalThreshold }),
      },
    });

    return NextResponse.json({ baseline: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Baseline] PATCH failed:", message);
    return NextResponse.json({ error: "Failed to update baseline", details: message }, { status: 500 });
  }
}
