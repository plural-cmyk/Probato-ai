/**
 * /api/orchestrator/call-flow
 * POST: Run a cross-device call flow test
 * GET:  List call flow test sessions for a project
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { runCallFlowTest } from "@/lib/agent/call-flow-tester";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      projectId,
      url,
      calleeIdentifier,
      dialButtonSelector,
      answerButtonSelector,
      hangupButtonSelector,
      muteButtonSelector,
      speakerButtonSelector,
      videoToggleSelector,
      ringIndicatorSelector,
      callStatusSelector,
      callTimerSelector,
      incomingCallSelector,
      callQualitySelector,
      syncTimeoutMs,
      callDurationMs,
      callType,
    } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Verify project ownership if projectId provided
    if (projectId) {
      const project = await db.project.findUnique({
        where: { id: projectId },
      });
      if (!project || project.userId !== session.user.id) {
        return NextResponse.json({ error: "Project not found or access denied" }, { status: 403 });
      }
    }

    const result = await runCallFlowTest({
      projectId,
      userId: session.user.id,
      url,
      calleeIdentifier,
      dialButtonSelector,
      answerButtonSelector,
      hangupButtonSelector,
      muteButtonSelector,
      speakerButtonSelector,
      videoToggleSelector,
      ringIndicatorSelector,
      callStatusSelector,
      callTimerSelector,
      incomingCallSelector,
      callQualitySelector,
      syncTimeoutMs,
      callDurationMs,
      callType,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Call flow test error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") ?? "10");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const where: Record<string, unknown> = { userId: session.user.id };
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;

    const [sessions, total] = await Promise.all([
      db.callFlowTestSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.callFlowTestSession.count({ where }),
    ]);

    return NextResponse.json({ sessions, total, limit, offset });
  } catch (error: unknown) {
    console.error("List call flow sessions error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
