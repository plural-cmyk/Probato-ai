import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// POST /api/sso/callback — SSO authentication callback
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teamId, protocol, samlResponse, oidcCode, oidcIdToken } = body;

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const config = await db.sSOConfiguration.findUnique({ where: { teamId } });
    if (!config) {
      return NextResponse.json({ error: "No SSO configuration found" }, { status: 404 });
    }

    if (!config.enabled) {
      return NextResponse.json({ error: "SSO is disabled for this team" }, { status: 403 });
    }

    let ssoUser: { email: string; name: string; groups?: string[] } | null = null;

    if (config.protocol === "saml" && samlResponse) {
      // In a production system, we would validate the SAML response
      // with xml-crypto or @boxyhq/saml-jackson. For now, parse the assertion.
      try {
        const decoded = Buffer.from(samlResponse, "base64").toString("utf-8");
        // Extract email and name from SAML assertion (simplified)
        const emailMatch = decoded.match(/<saml2:NameID[^>]*>([^<]+)<\/saml2:NameID>/);
        const nameMatch = decoded.match(/<saml2:Attribute[^>]*Name="displayName"[^>]*><saml2:AttributeValue>([^<]+)<\/saml2:AttributeValue>/);
        const groupMatches = decoded.match(/<saml2:Attribute[^>]*Name="groups"[^>]*>([\s\S]*?)<\/saml2:Attribute>/);

        ssoUser = {
          email: emailMatch?.[1] || "",
          name: nameMatch?.[1] || emailMatch?.[1]?.split("@")[0] || "SSO User",
          groups: groupMatches?.[1]
            ? [...groupMatches[1].matchAll(/<saml2:AttributeValue>([^<]+)<\/saml2:AttributeValue>/g)].map((m) => m[1])
            : [],
        };
      } catch {
        return NextResponse.json({ error: "Invalid SAML response" }, { status: 400 });
      }
    } else if (config.protocol === "oidc" && oidcCode) {
      // In production, exchange code for tokens with the OIDC provider
      // For now, decode the ID token if provided (simplified)
      try {
        if (oidcIdToken) {
          const parts = oidcIdToken.split(".");
          const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
          ssoUser = {
            email: payload.email || "",
            name: payload.name || payload.preferred_username || payload.email?.split("@")[0] || "SSO User",
            groups: payload.groups || [],
          };
        }
      } catch {
        return NextResponse.json({ error: "Invalid OIDC token" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: `Expected ${config.protocol} authentication data` }, { status: 400 });
    }

    if (!ssoUser?.email) {
      return NextResponse.json({ error: "Could not extract user email from SSO response" }, { status: 400 });
    }

    // Check domain restrictions
    if (config.allowedDomains.length > 0) {
      const domain = ssoUser.email.split("@")[1];
      if (!config.allowedDomains.includes(domain)) {
        return NextResponse.json({ error: `Email domain ${domain} is not allowed` }, { status: 403 });
      }
    }

    // Find or create user
    let user = await db.user.findUnique({ where: { email: ssoUser.email } });

    if (!user && config.autoProvision) {
      user = await db.user.create({
        data: {
          email: ssoUser.email,
          name: ssoUser.name,
        },
      });
    }

    if (!user) {
      return NextResponse.json({ error: "User not found and auto-provisioning is disabled" }, { status: 404 });
    }

    // Resolve role from group mapping
    let resolvedRole = "member";
    if (ssoUser.groups && config.groupRoleMapping) {
      const mapping = config.groupRoleMapping as Record<string, string>;
      for (const group of ssoUser.groups) {
        if (mapping[group]) {
          resolvedRole = mapping[group];
          break;
        }
      }
    }

    // Ensure team membership
    const existingMember = await db.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: user.id } },
    });

    if (!existingMember) {
      await db.teamMember.create({
        data: {
          teamId,
          userId: user.id,
          role: resolvedRole,
        },
      });
    }

    await createAuditLog({
      action: "sso.user.login",
      resource: "user",
      resourceId: user.id,
      userId: user.id,
      userEmail: user.email || undefined,
      userName: user.name || undefined,
      teamId,
      metadata: { protocol: config.protocol, groups: ssoUser.groups, role: resolvedRole },
      severity: "info",
    });

    // Update last tested timestamp
    await db.sSOConfiguration.update({
      where: { id: config.id },
      data: { lastTestedAt: new Date(), lastError: null },
    });

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
      role: resolvedRole,
    });
  } catch (error) {
    console.error("SSO callback error:", error);
    return NextResponse.json({ error: "SSO authentication failed" }, { status: 500 });
  }
}
