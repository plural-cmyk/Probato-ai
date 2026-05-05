import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// GET /api/audit/exports/[id] — Get specific export configuration
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const exportConfig = await db.auditLogExport.findUnique({ where: { id } });

    if (!exportConfig) {
      return NextResponse.json({ error: "Export configuration not found" }, { status: 404 });
    }

    return NextResponse.json({ export: exportConfig });
  } catch (error) {
    console.error("Failed to get audit export:", error);
    return NextResponse.json({ error: "Failed to get audit export" }, { status: 500 });
  }
}

// PATCH /api/audit/exports/[id] — Update export configuration
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await db.auditLogExport.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Export configuration not found" }, { status: 404 });
    }

    const updateData: Record<string, any> = {};
    const allowedFields = ["name", "destination", "config", "retention", "schedule", "enabled"];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const exportConfig = await db.auditLogExport.update({
      where: { id },
      data: updateData,
    });

    await createAuditLog({
      action: "audit.export.update",
      resource: "audit_log_export",
      resourceId: id,
      teamId: existing.teamId,
      severity: "info",
    });

    return NextResponse.json({ export: exportConfig });
  } catch (error) {
    console.error("Failed to update audit export:", error);
    return NextResponse.json({ error: "Failed to update audit export" }, { status: 500 });
  }
}

// DELETE /api/audit/exports/[id] — Delete export configuration
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.auditLogExport.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Export configuration not found" }, { status: 404 });
    }

    await db.auditLogExport.delete({ where: { id } });

    await createAuditLog({
      action: "audit.export.delete",
      resource: "audit_log_export",
      resourceId: id,
      teamId: existing.teamId,
      severity: "warning",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete audit export:", error);
    return NextResponse.json({ error: "Failed to delete audit export" }, { status: 500 });
  }
}
