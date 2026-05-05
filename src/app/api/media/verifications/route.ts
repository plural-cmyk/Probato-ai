import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/media/verifications ─ List media verifications ──

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const where: any = { userId: session.user.id };
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;

    const [verifications, total] = await Promise.all([
      db.mediaVerification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          status: true,
          url: true,
          overallScore: true,
          imageScore: true,
          videoScore: true,
          audioScore: true,
          duration: true,
          llmUsed: true,
          error: true,
          createdAt: true,
          projectId: true,
          // Include summary counts
          summary: true,
        },
      }),
      db.mediaVerification.count({ where }),
    ]);

    return NextResponse.json({
      verifications,
      total,
      limit,
      offset,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Media-Verifications] GET failed:", message);
    return NextResponse.json(
      { error: "Failed to fetch verifications", details: message },
      { status: 500 }
    );
  }
}
