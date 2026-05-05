import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyFixSuggestion, rejectFixSuggestion } from "@/lib/agent/fix-suggester";

export const dynamic = "force-dynamic";

// ── GET /api/fix-suggestions/[id] ─ Get a single fix suggestion ──

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

    const suggestion = await db.fixSuggestion.findUnique({
      where: { id },
      include: {
        testResult: { select: { id: true, testName: true, status: true, error: true, duration: true } },
        testRun: { select: { id: true, status: true, triggeredBy: true, startedAt: true, endedAt: true } },
        testCase: { select: { id: true, name: true, code: true, selector: true, autoHealed: true } },
        project: { select: { id: true, name: true, repoUrl: true } },
      },
    });

    if (!suggestion) {
      return NextResponse.json({ error: "Fix suggestion not found" }, { status: 404 });
    }

    // Verify ownership
    if (suggestion.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ suggestion });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Fix-Suggestions] GET [id] failed:", message);
    return NextResponse.json({ error: "Failed to fetch fix suggestion", details: message }, { status: 500 });
  }
}

// ── PATCH /api/fix-suggestions/[id] ─ Update suggestion status (approve/reject) ──

export async function PATCH(
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
    const { status, reviewNote } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    // Verify ownership
    const suggestion = await db.fixSuggestion.findUnique({
      where: { id },
      include: { project: { select: { userId: true } } },
    });

    if (!suggestion) {
      return NextResponse.json({ error: "Fix suggestion not found" }, { status: 404 });
    }

    if (suggestion.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (suggestion.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot update suggestion with status "${suggestion.status}". Only pending suggestions can be approved/rejected.` },
        { status: 400 }
      );
    }

    if (status === "rejected") {
      const result = await rejectFixSuggestion(id, session.user.id, reviewNote);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
    } else {
      // Approved — just update the status
      await db.fixSuggestion.update({
        where: { id },
        data: {
          status: "approved",
          appliedBy: session.user.id,
          reviewNote: reviewNote ?? null,
        },
      });
    }

    // Fetch updated suggestion
    const updated = await db.fixSuggestion.findUnique({
      where: { id },
      include: {
        testResult: { select: { id: true, testName: true } },
        testCase: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ suggestion: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Fix-Suggestions] PATCH [id] failed:", message);
    return NextResponse.json({ error: "Failed to update fix suggestion", details: message }, { status: 500 });
  }
}
