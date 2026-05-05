/**
 * /api/orchestrator/call-flow/[id]
 * GET: Get a specific call flow test session with details
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

    const callFlowSession = await db.callFlowTestSession.findUnique({
      where: { id },
      include: {
        orchestratedSession: {
          include: {
            sandboxes: true,
            syncEvents: {
              orderBy: { createdAt: "asc" },
              take: 100,
            },
          },
        },
      },
    });

    if (!callFlowSession) {
      return NextResponse.json({ error: "Call flow session not found" }, { status: 404 });
    }

    if (callFlowSession.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(callFlowSession);
  } catch (error: unknown) {
    console.error("Get call flow session error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
