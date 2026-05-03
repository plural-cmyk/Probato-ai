/**
 * GET /api/visual/baselines/[id]
 * PATCH /api/visual/baselines/[id]
 * DELETE /api/visual/baselines/[id]
 *
 * Get, update, or delete a specific visual baseline.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
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
    const baseline = await db.visualBaseline.findFirst({
      where: { id, userId: session.user.id },
      include: {
        project: {
          select: { id: true, name: true },
        },
        diffs: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            status: true,
            mismatchPercent: true,
            mismatchPixels: true,
            totalPixels: true,
            threshold: true,
            createdAt: true,
            reviewedAt: true,
            testRunId: true,
          },
        },
      },
    });

    if (!baseline) {
      return NextResponse.json({ error: "Baseline not found" }, { status: 404 });
    }

    return NextResponse.json({ baseline });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Visual Baseline GET] Error:", message);
    return NextResponse.json(
      { error: "Failed to fetch baseline" },
      { status: 500 }
    );
  }
}

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
    const body = await request.json();
    const { name, approvedAt } = body;

    const baseline = await db.visualBaseline.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!baseline) {
      return NextResponse.json({ error: "Baseline not found" }, { status: 404 });
    }

    const updated = await db.visualBaseline.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(approvedAt !== undefined && { approvedAt: approvedAt ? new Date(approvedAt) : new Date() }),
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      approvedAt: updated.approvedAt,
      message: "Baseline updated",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Visual Baseline PATCH] Error:", message);
    return NextResponse.json(
      { error: "Failed to update baseline" },
      { status: 500 }
    );
  }
}

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
    const baseline = await db.visualBaseline.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!baseline) {
      return NextResponse.json({ error: "Baseline not found" }, { status: 404 });
    }

    // Delete all associated diffs first (cascade should handle this, but be explicit)
    await db.visualDiff.deleteMany({ where: { baselineId: id } });
    await db.visualBaseline.delete({ where: { id } });

    return NextResponse.json({ message: "Baseline deleted" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Visual Baseline DELETE] Error:", message);
    return NextResponse.json(
      { error: "Failed to delete baseline" },
      { status: 500 }
    );
  }
}
