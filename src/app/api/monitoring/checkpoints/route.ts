import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/monitoring/checkpoints ─ List synthetic checkpoints ──

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const enabled = searchParams.get("enabled");
    const severity = searchParams.get("severity");
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    const where: any = { userId: session.user.id };
    if (projectId) where.projectId = projectId;
    if (enabled !== null) where.enabled = enabled === "true";
    if (severity) where.severity = severity;

    const [checkpoints, total] = await Promise.all([
      db.syntheticCheckpoint.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          project: { select: { id: true, name: true } },
          _count: { select: { results: true } },
        },
      }),
      db.syntheticCheckpoint.count({ where }),
    ]);

    return NextResponse.json({ checkpoints, total, limit, offset });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Checkpoints] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch checkpoints", details: message }, { status: 500 });
  }
}

// ── POST /api/monitoring/checkpoints ─ Create a synthetic checkpoint ──

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, url, steps, expectedOutcome, intervalMinutes, severity, enabled, projectId } = body;

    if (!name || !url) {
      return NextResponse.json({ error: "name and url are required" }, { status: 400 });
    }

    if (intervalMinutes !== undefined && intervalMinutes < 5) {
      return NextResponse.json({ error: "intervalMinutes must be at least 5" }, { status: 400 });
    }

    // Verify project belongs to user if specified
    if (projectId) {
      const project = await db.project.findUnique({ where: { id: projectId } });
      if (!project || project.userId !== session.user.id) {
        return NextResponse.json({ error: "Project not found or access denied" }, { status: 403 });
      }
    }

    const checkpoint = await db.syntheticCheckpoint.create({
      data: {
        name,
        url,
        steps: steps ?? [],
        expectedOutcome,
        intervalMinutes: intervalMinutes ?? 5,
        severity: severity ?? "informational",
        enabled: enabled ?? true,
        projectId: projectId ?? null,
        userId: session.user.id,
      },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ checkpoint }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Checkpoints] POST failed:", message);
    return NextResponse.json({ error: "Failed to create checkpoint", details: message }, { status: 500 });
  }
}
