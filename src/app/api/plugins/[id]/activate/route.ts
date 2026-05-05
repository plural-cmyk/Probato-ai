import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// POST /api/plugins/[id]/activate — Activate a plugin
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { userId } = body;

    const existing = await db.plugin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
    }

    if (existing.enabled && existing.status === "active") {
      return NextResponse.json({ error: "Plugin is already active" }, { status: 400 });
    }

    const plugin = await db.plugin.update({
      where: { id },
      data: {
        enabled: true,
        status: "active",
        activatedAt: new Date(),
        lastError: null,
      },
    });

    await createAuditLog({
      action: "plugin.activate",
      resource: "plugin",
      resourceId: id,
      teamId: existing.teamId,
      userId,
      metadata: { name: existing.name, version: existing.version },
      severity: "info",
    });

    return NextResponse.json({ plugin });
  } catch (error) {
    console.error("Failed to activate plugin:", error);
    return NextResponse.json({ error: "Failed to activate plugin" }, { status: 500 });
  }
}
