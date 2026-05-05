/**
 * GET /api/orchestrator/sessions/[id]
 * Get detailed orchestrated session with sandbox states and sync events
 */

export const dynamic = "force-dynamic";

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
    const orchestratedSession = await db.orchestratedSession.findUnique({
      where: { id },
      include: {
        sandboxes: {
          orderBy: { createdAt: "asc" },
        },
        syncEvents: {
          orderBy: { createdAt: "asc" },
          take: 100,
        },
      },
    });

    if (!orchestratedSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (orchestratedSession.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(orchestratedSession);
  } catch (error: unknown) {
    console.error("Get session error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
