import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// GET /api/sso/config/[id] — Get specific SSO config
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const config = await db.sSOConfiguration.findUnique({ where: { id } });

    if (!config) {
      return NextResponse.json({ error: "SSO configuration not found" }, { status: 404 });
    }

    return NextResponse.json({ config: { ...config, oidcClientSecret: config.oidcClientSecret ? "••••••••" : null } });
  } catch (error) {
    console.error("Failed to get SSO config:", error);
    return NextResponse.json({ error: "Failed to get SSO configuration" }, { status: 500 });
  }
}

// PATCH /api/sso/config/[id] — Update SSO config
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await db.sSOConfiguration.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "SSO configuration not found" }, { status: 404 });
    }

    const updateData: Record<string, any> = {};
    const allowedFields = [
      "label", "enabled", "protocol", "samlEntryUrl", "samlLogoutUrl",
      "samlCertificate", "samlIssuer", "oidcClientId", "oidcClientSecret",
      "oidcDiscoveryUrl", "oidcScopes", "groupRoleMapping", "allowedDomains",
      "autoProvision", "status",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Don't overwrite secret with mask value
    if (updateData.oidcClientSecret === "••••••••") {
      delete updateData.oidcClientSecret;
    }

    const config = await db.sSOConfiguration.update({
      where: { id },
      data: updateData,
    });

    await createAuditLog({
      action: "sso.config.update",
      resource: "sso_configuration",
      resourceId: id,
      teamId: existing.teamId,
      beforeSnapshot: existing,
      afterSnapshot: config,
      severity: "info",
    });

    return NextResponse.json({ config: { ...config, oidcClientSecret: config.oidcClientSecret ? "••••••••" : null } });
  } catch (error) {
    console.error("Failed to update SSO config:", error);
    return NextResponse.json({ error: "Failed to update SSO configuration" }, { status: 500 });
  }
}

// DELETE /api/sso/config/[id] — Delete SSO config
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.sSOConfiguration.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "SSO configuration not found" }, { status: 404 });
    }

    await db.sSOConfiguration.delete({ where: { id } });

    await createAuditLog({
      action: "sso.config.delete",
      resource: "sso_configuration",
      resourceId: id,
      teamId: existing.teamId,
      severity: "warning",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete SSO config:", error);
    return NextResponse.json({ error: "Failed to delete SSO configuration" }, { status: 500 });
  }
}
