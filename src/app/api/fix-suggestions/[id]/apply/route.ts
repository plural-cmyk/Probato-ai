import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyFixSuggestion } from "@/lib/agent/fix-suggester";

export const dynamic = "force-dynamic";

// ── POST /api/fix-suggestions/[id]/apply ─ Apply an approved fix suggestion ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { reviewNote } = body;

    const result = await applyFixSuggestion(id, session.user.id, reviewNote);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      applied: true,
      testCaseId: result.testCaseId,
      message: "Fix suggestion applied successfully. The test case has been updated.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Fix-Suggestions] Apply failed:", message);
    return NextResponse.json({ error: "Failed to apply fix suggestion", details: message }, { status: 500 });
  }
}
