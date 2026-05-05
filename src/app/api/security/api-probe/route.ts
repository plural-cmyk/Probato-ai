import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runAPIProbe } from "@/lib/agent/api-prober";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── POST /api/security/api-probe ─ Run an API security probe ──

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
      testRunId,
      checkAPISecurity,
      checkCSRF,
      checkRateLimit,
      checkIDOR,
      maxEndpoints,
      probeDepth,
    } = body;

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // Verify the project belongs to the user (if projectId provided)
    if (projectId) {
      const project = await db.project.findUnique({ where: { id: projectId } });
      if (!project || project.userId !== session.user.id) {
        return NextResponse.json({ error: "Project not found or access denied" }, { status: 403 });
      }
    }

    const result = await runAPIProbe({
      projectId,
      userId: session.user.id,
      url,
      testRunId,
      checkAPISecurity,
      checkCSRF,
      checkRateLimit,
      checkIDOR,
      maxEndpoints,
      probeDepth,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API-Probe] POST failed:", message);
    return NextResponse.json({ error: "Failed to run API probe", details: message }, { status: 500 });
  }
}
