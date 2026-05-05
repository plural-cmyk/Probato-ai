import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/security/api-probes/[id] ─ Get single API probe detail ──

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

    const probe = await db.aPIProbe.findUnique({ where: { id } });

    if (!probe) {
      return NextResponse.json({ error: "Probe not found" }, { status: 404 });
    }

    if (probe.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ probe });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API-Probes] GET [id] failed:", message);
    return NextResponse.json({ error: "Failed to fetch probe", details: message }, { status: 500 });
  }
}
