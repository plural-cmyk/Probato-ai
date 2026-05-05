/**
 * /api/self-heal/selector-repairs/[id]
 * GET:  Get a single selector repair
 * PATCH: Approve or reject a selector repair
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

    const repair = await db.selectorRepair.findUnique({
      where: { id },
      include: {
        testCase: {
          include: {
            feature: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (!repair) {
      return NextResponse.json({ error: "Repair not found" }, { status: 404 });
    }

    // Verify ownership
    if (repair.testCase.feature.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ repair });
  } catch (error: unknown) {
    console.error("Get selector repair error:", error);
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
    const { status, reviewNote } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    const repair = await db.selectorRepair.findUnique({
      where: { id },
      include: {
        testCase: {
          include: {
            feature: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (!repair) {
      return NextResponse.json({ error: "Repair not found" }, { status: 404 });
    }

    // Verify ownership
    if (repair.testCase.feature.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (repair.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot modify repair with status '${repair.status}'. Only pending repairs can be approved/rejected.` },
        { status: 400 }
      );
    }

    if (status === "approved") {
      // Apply the repair
      await db.$transaction([
        db.testCase.update({
          where: { id: repair.testCaseId },
          data: {
            selector: repair.newSelector,
            autoHealed: true,
          },
        }),
        db.selectorRepair.update({
          where: { id },
          data: {
            status: "applied",
            appliedAt: new Date(),
            appliedBy: session.user.id,
            reviewNote: reviewNote ?? null,
          },
        }),
      ]);
    } else {
      // Reject the repair
      await db.selectorRepair.update({
        where: { id },
        data: {
          status: "rejected",
          reviewNote: reviewNote ?? null,
        },
      });
    }

    const updatedRepair = await db.selectorRepair.findUnique({
      where: { id },
    });

    return NextResponse.json({ repair: updatedRepair });
  } catch (error: unknown) {
    console.error("Update selector repair error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
