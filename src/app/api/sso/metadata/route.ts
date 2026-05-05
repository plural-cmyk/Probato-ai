import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sso/metadata — Get SP metadata for IdP configuration
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const config = await db.sSOConfiguration.findUnique({ where: { teamId } });
    if (!config) {
      return NextResponse.json({ error: "No SSO configuration found for this team" }, { status: 404 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "https://probato-ai.vercel.app";

    if (config.protocol === "saml") {
      // Generate SAML SP metadata XML
      const spEntityId = `${baseUrl}/api/sso/callback`;
      const acsUrl = `${baseUrl}/api/sso/callback`;
      const sloUrl = `${baseUrl}/api/sso/callback`;

      const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     entityID="${spEntityId}">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                                  Location="${acsUrl}"
                                  index="0" isDefault="true"/>
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                             Location="${sloUrl}"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

      return new NextResponse(metadata, {
        headers: { "Content-Type": "application/xml" },
      });
    } else {
      // OIDC discovery document
      const discovery = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/api/sso/callback`,
        token_endpoint: `${baseUrl}/api/sso/callback`,
        userinfo_endpoint: `${baseUrl}/api/sso/callback`,
        jwks_uri: `${baseUrl}/api/sso/metadata?jwks=true&teamId=${teamId}`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        scopes_supported: config.oidcScopes || ["openid", "email", "profile"],
      };

      return NextResponse.json(discovery);
    }
  } catch (error) {
    console.error("Failed to get SSO metadata:", error);
    return NextResponse.json({ error: "Failed to get SSO metadata" }, { status: 500 });
  }
}
