/**
 * GET /api/visual/baselines
 *
 * List visual baselines for the authenticated user.
 * Supports filtering by projectId and url.
 *
 * POST is handled by /api/visual/capture (separate route for the capture logic).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const url = searchParams.get("url");

    const where: Record<string, unknown> = {
      userId: session.user.id,
    };

    if (projectId) {
      where.projectId = projectId;
    }
    if (url) {
      where.url = { contains: url, mode: "insensitive" };
    }

    const baselines = await prisma.visualBaseline.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        selector: true,
        viewportWidth: true,
        viewportHeight: true,
        captureIndex: true,
        approvedAt: true,
        createdAt: true,
        updatedAt: true,
        projectId: true,
        project: {
          select: { id: true, name: true },
        },
        _count: {
          select: { diffs: true },
        },
        // Don't select screenshot — too large for list view
      },
    });

    return NextResponse.json({ baselines });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Visual Baselines] Error:", message);
    return NextResponse.json(
      { error: "Failed to fetch baselines" },
      { status: 500 }
    );
  }
}
