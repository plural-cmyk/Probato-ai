/**
 * /api/intelligence/flakiness/[id]
 * GET:   Get a single flakiness report
 * PATCH: Update classification
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

    const report = await db.flakinessReport.findUnique({
      where: { id },
      include: {
        testCase: {
          include: {
            feature: {
              include: {
                project: {
                  select: { id: true, userId: true, name: true },
                },
              },
            },
          },
        },
        alerts: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: "Flakiness report not found" },
        { status: 404 }
      );
    }

    // Verify access
    if (report.testCase.feature.project.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    return NextResponse.json({ report });
  } catch (error: unknown) {
    console.error("Get flakiness report error:", error);
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
    const { classification } = body;

    if (!classification || !["stable", "flaky", "failing", "unknown"].includes(classification)) {
      return NextResponse.json(
        { error: "classification must be one of: stable, flaky, failing, unknown" },
        { status: 400 }
      );
    }

    const existing = await db.flakinessReport.findUnique({
      where: { id },
      include: {
        testCase: {
          include: {
            feature: {
              include: { project: { select: { userId: true } } },
            },
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Flakiness report not found" },
        { status: 404 }
      );
    }

    if (existing.testCase.feature.project.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const report = await db.flakinessReport.update({
      where: { id },
      data: { classification },
    });

    return NextResponse.json({ report });
  } catch (error: unknown) {
    console.error("Update flakiness report error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
