import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// GET /api/plugins/[id] — Get plugin details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plugin = await db.plugin.findUnique({
      where: { id },
      include: {
        executions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!plugin) {
      return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
    }

    return NextResponse.json({ plugin });
  } catch (error) {
    console.error("Failed to get plugin:", error);
    return NextResponse.json({ error: "Failed to get plugin" }, { status: 500 });
  }
}

// PATCH /api/plugins/[id] — Update plugin
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { description, version, tier, homepage, isPrivate } = body;

    const existing = await db.plugin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
    }

    const plugin = await db.plugin.update({
      where: { id },
      data: {
        ...(description !== undefined && { description }),
        ...(version !== undefined && { version }),
        ...(tier !== undefined && { tier }),
        ...(homepage !== undefined && { homepage }),
        ...(isPrivate !== undefined && { isPrivate }),
      },
    });

    await createAuditLog({
      action: "plugin.update",
      resource: "plugin",
      resourceId: id,
      teamId: existing.teamId,
      metadata: { name: existing.name, updates: Object.keys(body) },
      severity: "info",
    });

    return NextResponse.json({ plugin });
  } catch (error) {
    console.error("Failed to update plugin:", error);
    return NextResponse.json({ error: "Failed to update plugin" }, { status: 500 });
  }
}

// DELETE /api/plugins/[id] — Uninstall plugin
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.plugin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
    }

    await db.plugin.delete({ where: { id } });

    await createAuditLog({
      action: "plugin.uninstall",
      resource: "plugin",
      resourceId: id,
      teamId: existing.teamId,
      metadata: { name: existing.name, version: existing.version },
      severity: "info",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete plugin:", error);
    return NextResponse.json({ error: "Failed to delete plugin" }, { status: 500 });
  }
}
