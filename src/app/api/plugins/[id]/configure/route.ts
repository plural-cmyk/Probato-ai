import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// POST /api/plugins/[id]/configure — Update plugin configuration
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { config, userId } = body;

    if (config === undefined) {
      return NextResponse.json({ error: "config is required" }, { status: 400 });
    }

    const existing = await db.plugin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
    }

    const plugin = await db.plugin.update({
      where: { id },
      data: { config },
    });

    await createAuditLog({
      action: "plugin.configure",
      resource: "plugin",
      resourceId: id,
      teamId: existing.teamId,
      userId,
      metadata: { name: existing.name, configKeys: Object.keys(config) },
      severity: "info",
    });

    return NextResponse.json({ plugin });
  } catch (error) {
    console.error("Failed to configure plugin:", error);
    return NextResponse.json({ error: "Failed to configure plugin" }, { status: 500 });
  }
}
