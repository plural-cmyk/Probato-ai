import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// ── GET /api/test-runs ─ List test runs for a project ────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId query parameter required" },
        { status: 400 }
      );
    }

    // Verify project belongs to user
    const project = await db.project.findFirst({
      where: { id: projectId, userId: session.user.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const testRuns = await db.testRun.findMany({
      where: { projectId },
      include: {
        results: {
          select: {
            id: true,
            testName: true,
            featureName: true,
            status: true,
            duration: true,
            error: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ testRuns });
  } catch (error) {
    console.error("Failed to fetch test runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch test runs" },
      { status: 500 }
    );
  }
}
