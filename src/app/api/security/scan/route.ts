import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runSecurityScan } from "@/lib/agent/security-scanner";

export const dynamic = "force-dynamic";

// ── POST /api/security/scan ─ Run a security scan ──

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
      checkHeaders,
      checkCSP,
      checkMixedContent,
      checkXSS,
      checkCORS,
      checkCookies,
    } = body;

    if (!projectId || !url) {
      return NextResponse.json(
        { error: "projectId and url are required" },
        { status: 400 }
      );
    }

    // Verify the project belongs to the user
    const project = await db.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 403 });
    }

    // Run the security scan
    const result = await runSecurityScan({
      projectId,
      userId: session.user.id,
      url,
      testRunId,
      checkHeaders,
      checkCSP,
      checkMixedContent,
      checkXSS,
      checkCORS,
      checkCookies,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Security-Scan] POST failed:", message);
    return NextResponse.json({ error: "Failed to run security scan", details: message }, { status: 500 });
  }
}
