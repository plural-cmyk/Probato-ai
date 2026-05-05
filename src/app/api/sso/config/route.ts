import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// GET /api/sso/config — List SSO configurations for a team
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const configs = await db.sSOConfiguration.findMany({
      where: { teamId },
      orderBy: { createdAt: "desc" },
    });

    // Mask secrets
    const masked = configs.map((c) => ({
      ...c,
      oidcClientSecret: c.oidcClientSecret ? "••••••••" : null,
    }));

    return NextResponse.json({ configs: masked });
  } catch (error) {
    console.error("Failed to list SSO configs:", error);
    return NextResponse.json({ error: "Failed to list SSO configurations" }, { status: 500 });
  }
}

// POST /api/sso/config — Create SSO configuration
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      teamId,
      protocol = "saml",
      label,
      enabled = true,
      samlEntryUrl,
      samlLogoutUrl,
      samlCertificate,
      samlIssuer,
      oidcClientId,
      oidcClientSecret,
      oidcDiscoveryUrl,
      oidcScopes,
      groupRoleMapping,
      allowedDomains,
      autoProvision = true,
    } = body;

    if (!teamId || !label) {
      return NextResponse.json({ error: "teamId and label are required" }, { status: 400 });
    }

    // Check if team already has an SSO config
    const existing = await db.sSOConfiguration.findUnique({ where: { teamId } });
    if (existing) {
      return NextResponse.json({ error: "Team already has an SSO configuration. Update the existing one." }, { status: 409 });
    }

    const config = await db.sSOConfiguration.create({
      data: {
        teamId,
        protocol,
        label,
        enabled,
        samlEntryUrl,
        samlLogoutUrl,
        samlCertificate,
        samlIssuer,
        oidcClientId,
        oidcClientSecret,
        oidcDiscoveryUrl,
        oidcScopes: oidcScopes || ["openid", "email", "profile"],
        groupRoleMapping: groupRoleMapping || {},
        allowedDomains: allowedDomains || [],
        autoProvision,
      },
    });

    await createAuditLog({
      action: "sso.config.create",
      resource: "sso_configuration",
      resourceId: config.id,
      teamId,
      metadata: { protocol, label },
      severity: "info",
    });

    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    console.error("Failed to create SSO config:", error);
    return NextResponse.json({ error: "Failed to create SSO configuration" }, { status: 500 });
  }
}
