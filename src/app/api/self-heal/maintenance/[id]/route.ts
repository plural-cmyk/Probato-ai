/**
 * /api/self-heal/maintenance/[id]
 * GET:  Get a single maintenance record
 * PATCH: Update maintenance record status
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

    const record = await db.testMaintenanceRecord.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, name: true, userId: true },
        },
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // Verify ownership
    if (record.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ record });
  } catch (error: unknown) {
    console.error("Get maintenance record error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
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
    const { status } = body;

    if (!status || !["in_progress", "resolved", "dismissed"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be one of: in_progress, resolved, dismissed" },
        { status: 400 }
      );
    }

    const record = await db.testMaintenanceRecord.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // Verify ownership
    if (record.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const updatedRecord = await db.testMaintenanceRecord.update({
      where: { id },
      data: {
        status,
        ...(status === "resolved" ? { resolvedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({ record: updatedRecord });
  } catch (error: unknown) {
    console.error("Update maintenance record error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
