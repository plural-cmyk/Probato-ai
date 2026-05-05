import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/monitoring/checkpoints/[id]/results ─ List results for a checkpoint ──

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
    const checkpoint = await db.syntheticCheckpoint.findUnique({ where: { id } });
    if (!checkpoint) {
      return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
    }
    if (checkpoint.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    const where: any = { checkpointId: id };
    if (status) where.status = status;

    const [results, total] = await Promise.all([
      db.checkpointResult.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.checkpointResult.count({ where }),
    ]);

    // Strip screenshots for list view (too large)
    const slimResults = results.map(({ screenshot, ...rest }) => ({
      ...rest,
      hasScreenshot: !!screenshot,
    }));

    return NextResponse.json({ results: slimResults, total, limit, offset });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Results] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch results", details: message }, { status: 500 });
  }
}
