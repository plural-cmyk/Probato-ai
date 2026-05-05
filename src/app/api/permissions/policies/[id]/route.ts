import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// GET /api/permissions/policies/[id] — Get specific policy
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const policy = await db.permissionPolicy.findUnique({ where: { id } });

    if (!policy) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 });
    }

    return NextResponse.json({ policy });
  } catch (error) {
    console.error("Failed to get permission policy:", error);
    return NextResponse.json({ error: "Failed to get permission policy" }, { status: 500 });
  }
}

// PATCH /api/permissions/policies/[id] — Update policy
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await db.permissionPolicy.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 });
    }

    const updateData: Record<string, any> = {};
    // For default policies, only allow updating conditions and description
    if (existing.isDefault) {
      if (body.conditions !== undefined) updateData.conditions = body.conditions;
      if (body.description !== undefined) updateData.description = body.description;
    } else {
      const allowedFields = ["name", "description", "permissions", "conditions", "scope"];
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updateData[field] = body[field];
        }
      }
    }

    const policy = await db.permissionPolicy.update({
      where: { id },
      data: updateData,
    });

    if (existing.teamId) {
      await createAuditLog({
        action: "permissions.policy.update",
        resource: "permission_policy",
        resourceId: id,
        teamId: existing.teamId,
        severity: "info",
      });
    }

    return NextResponse.json({ policy });
  } catch (error) {
    console.error("Failed to update permission policy:", error);
    return NextResponse.json({ error: "Failed to update permission policy" }, { status: 500 });
  }
}

// DELETE /api/permissions/policies/[id] — Delete policy
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.permissionPolicy.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 });
    }

    if (existing.isDefault) {
      return NextResponse.json({ error: "Cannot delete default policies" }, { status: 403 });
    }

    await db.permissionPolicy.delete({ where: { id } });

    if (existing.teamId) {
      await createAuditLog({
        action: "permissions.policy.delete",
        resource: "permission_policy",
        resourceId: id,
        teamId: existing.teamId,
        severity: "warning",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete permission policy:", error);
    return NextResponse.json({ error: "Failed to delete permission policy" }, { status: 500 });
  }
}
