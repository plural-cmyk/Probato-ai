import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/security/scans/[id] ─ Get a single security scan ──

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

    const scan = await db.securityScan.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, userId: true } },
      },
    });

    if (!scan) {
      return NextResponse.json({ error: "Security scan not found" }, { status: 404 });
    }

    // Verify ownership
    if (scan.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ scan });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Security-Scans] GET [id] failed:", message);
    return NextResponse.json({ error: "Failed to fetch security scan", details: message }, { status: 500 });
  }
}
