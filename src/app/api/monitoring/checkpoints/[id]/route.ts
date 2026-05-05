import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/monitoring/checkpoints/[id] ─ Get checkpoint details ──

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
    const checkpoint = await db.syntheticCheckpoint.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        results: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!checkpoint) {
      return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
    }

    if (checkpoint.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ checkpoint });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Checkpoint] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch checkpoint", details: message }, { status: 500 });
  }
}

// ── PATCH /api/monitoring/checkpoints/[id] ─ Update checkpoint ──

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
    const checkpoint = await db.syntheticCheckpoint.findUnique({ where: { id } });
    if (!checkpoint) {
      return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
    }
    if (checkpoint.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { name, url, steps, expectedOutcome, intervalMinutes, severity, enabled, projectId } = body;

    if (intervalMinutes !== undefined && intervalMinutes < 5) {
      return NextResponse.json({ error: "intervalMinutes must be at least 5" }, { status: 400 });
    }

    const updated = await db.syntheticCheckpoint.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(url !== undefined && { url }),
        ...(steps !== undefined && { steps }),
        ...(expectedOutcome !== undefined && { expectedOutcome }),
        ...(intervalMinutes !== undefined && { intervalMinutes }),
        ...(severity !== undefined && { severity }),
        ...(enabled !== undefined && { enabled }),
        ...(projectId !== undefined && { projectId }),
      },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ checkpoint: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Checkpoint] PATCH failed:", message);
    return NextResponse.json({ error: "Failed to update checkpoint", details: message }, { status: 500 });
  }
}

// ── DELETE /api/monitoring/checkpoints/[id] ─ Delete checkpoint ──

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const checkpoint = await db.syntheticCheckpoint.findUnique({ where: { id } });
    if (!checkpoint) {
      return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
    }
    if (checkpoint.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await db.syntheticCheckpoint.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Checkpoint] DELETE failed:", message);
    return NextResponse.json({ error: "Failed to delete checkpoint", details: message }, { status: 500 });
  }
}
