import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runA11yAudit } from "@/lib/agent/a11y-auditor";

export const dynamic = "force-dynamic";

// ── POST /api/accessibility/audit ─ Run an accessibility audit ──

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
      wcagLevel,
      checkContrast,
      checkAria,
      checkKeyboard,
      checkImages,
      checkForms,
      checkHeadings,
      checkFocus,
      checkLandmarks,
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

    // Run the accessibility audit
    const result = await runA11yAudit({
      projectId,
      userId: session.user.id,
      url,
      testRunId,
      wcagLevel,
      checkContrast,
      checkAria,
      checkKeyboard,
      checkImages,
      checkForms,
      checkHeadings,
      checkFocus,
      checkLandmarks,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[A11y-Audit] POST failed:", message);
    return NextResponse.json({ error: "Failed to run accessibility audit", details: message }, { status: 500 });
  }
}
