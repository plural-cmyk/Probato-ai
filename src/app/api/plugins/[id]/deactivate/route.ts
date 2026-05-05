import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// POST /api/plugins/[id]/deactivate — Deactivate a plugin
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

    if (!existing.enabled || existing.status === "deactivated") {
      return NextResponse.json({ error: "Plugin is already deactivated" }, { status: 400 });
    }

    const plugin = await db.plugin.update({
      where: { id },
      data: {
        enabled: false,
        status: "deactivated",
      },
    });

    await createAuditLog({
      action: "plugin.deactivate",
      resource: "plugin",
      resourceId: id,
      teamId: existing.teamId,
      userId,
      metadata: { name: existing.name, version: existing.version },
      severity: "info",
    });

    return NextResponse.json({ plugin });
  } catch (error) {
    console.error("Failed to deactivate plugin:", error);
    return NextResponse.json({ error: "Failed to deactivate plugin" }, { status: 500 });
  }
}
