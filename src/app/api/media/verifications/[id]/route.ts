import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/media/verifications/[id] ─ Get a single media verification ──

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

    const verification = await db.mediaVerification.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, name: true, repoUrl: true },
        },
      },
    });

    if (!verification) {
      return NextResponse.json(
        { error: "Verification not found" },
        { status: 404 }
      );
    }

    if (verification.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ verification });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Media-Verifications] GET [id] failed:", message);
    return NextResponse.json(
      { error: "Failed to fetch verification", details: message },
      { status: 500 }
    );
  }
}
