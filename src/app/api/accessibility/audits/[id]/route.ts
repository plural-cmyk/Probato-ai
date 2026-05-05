import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/accessibility/audits/[id] ─ Get a single a11y audit ──

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

    const audit = await db.a11yAudit.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, userId: true } },
      },
    });

    if (!audit) {
      return NextResponse.json({ error: "Accessibility audit not found" }, { status: 404 });
    }

    // Verify ownership
    if (audit.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ audit });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[A11y-Audits] GET [id] failed:", message);
    return NextResponse.json({ error: "Failed to fetch accessibility audit", details: message }, { status: 500 });
  }
}
