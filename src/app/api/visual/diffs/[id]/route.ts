/**
 * GET /api/visual/diffs/[id]
 * PATCH /api/visual/diffs/[id]
 *
 * Get full diff details (including screenshots) or review (approve/reject) a diff.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

    const diff = await prisma.visualDiff.findFirst({
      where: {
        id,
        project: { userId: session.user.id },
      },
      include: {
        baseline: {
          select: {
            id: true,
            name: true,
            url: true,
            selector: true,
            viewportWidth: true,
            viewportHeight: true,
            screenshot: true, // Include baseline screenshot for side-by-side
          },
        },
        project: {
          select: { id: true, name: true },
        },
        testRun: {
          select: { id: true, status: true, triggeredBy: true, createdAt: true },
        },
      },
    });

    if (!diff) {
      return NextResponse.json({ error: "Diff not found" }, { status: 404 });
    }

    return NextResponse.json({ diff });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Visual Diff GET] Error:", message);
    return NextResponse.json(
      { error: "Failed to fetch diff" },
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

    // Verify ownership
    const diff = await prisma.visualDiff.findFirst({
      where: {
        id,
        project: { userId: session.user.id },
      },
    });

    if (!diff) {
      return NextResponse.json({ error: "Diff not found" }, { status: 404 });
    }

    // Update diff status
    const updated = await prisma.visualDiff.update({
      where: { id },
      data: {
        status,
        reviewNote: reviewNote ?? null,
        reviewedAt: new Date(),
      },
    });

    // If approved, update the baseline screenshot with the current screenshot
    // (the new screenshot becomes the new baseline)
    if (status === "approved") {
      await prisma.visualBaseline.update({
        where: { id: diff.baselineId },
        data: {
          screenshot: diff.currentScreenshot,
          approvedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      reviewNote: updated.reviewNote,
      reviewedAt: updated.reviewedAt,
      message: status === "approved"
        ? "Diff approved — baseline updated with current screenshot"
        : "Diff rejected — baseline remains unchanged",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Visual Diff PATCH] Error:", message);
    return NextResponse.json(
      { error: "Failed to update diff" },
      { status: 500 }
    );
  }
}
