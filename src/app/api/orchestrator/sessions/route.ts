/**
 * /api/orchestrator/sessions
 * POST: Create and start a new orchestrated multi-device test session
 * GET:  List orchestrated sessions for a project
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { runOrchestratedSession } from "@/lib/agent/multi-device-orchestrator";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, url, scenarioType, agents, maxConcurrentBrowsers, syncTimeoutMs } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    if (!scenarioType || !["messaging", "call", "payment", "custom"].includes(scenarioType)) {
      return NextResponse.json(
        { error: "scenarioType must be one of: messaging, call, payment, custom" },
        { status: 400 }
      );
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

    const result = await runOrchestratedSession({
      projectId,
      userId: session.user.id,
      url,
      scenarioType,
      agents,
      maxConcurrentBrowsers,
      syncTimeoutMs,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Orchestrator session error:", error);
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
    const scenarioType = searchParams.get("scenarioType");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") ?? "10");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const where: Record<string, unknown> = { userId: session.user.id };
    if (projectId) where.projectId = projectId;
    if (scenarioType) where.scenarioType = scenarioType;
    if (status) where.status = status;

    const [sessions, total] = await Promise.all([
      db.orchestratedSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          sandboxes: {
            select: {
              id: true,
              agentRole: true,
              status: true,
              score: true,
            },
          },
          _count: {
            select: { syncEvents: true },
          },
        },
      }),
      db.orchestratedSession.count({ where }),
    ]);

    return NextResponse.json({ sessions, total, limit, offset });
  } catch (error: unknown) {
    console.error("List sessions error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
