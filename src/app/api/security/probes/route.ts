import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/security/probes ─ List security probes ──

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: any = { userId: session.user.id };
    if (projectId) {
      where.projectId = projectId;
    }

    const probes = await db.securityProbe.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        status: true,
        url: true,
        overallScore: true,
        xssScore: true,
        authScore: true,
        llmUsed: true,
        duration: true,
        error: true,
        createdAt: true,
        projectId: true,
      },
    });

    const total = await db.securityProbe.count({ where });

    return NextResponse.json({ probes, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Security-Probes] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch security probes", details: message }, { status: 500 });
  }
}
