/**
 * API Key Management - List & Create
 * GET  /api/api-keys      — List all API keys for the current user
 * POST /api/api-keys      — Create a new API key
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listApiKeys, createApiKey, type ApiScope } from "@/lib/api/keys";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const keys = await listApiKeys(session.user.id);

    return NextResponse.json({
      keys,
      maxKeys: 10,
    });
  } catch (error) {
    console.error("[API Keys] List error:", error);
    return NextResponse.json({ error: "Failed to list API keys" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { name, scopes, expiresInDays, rateLimitOverride } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json({ error: "At least one scope is required" }, { status: 400 });
    }

    const validScopes: ApiScope[] = ["read", "write", "admin", "billing"];
    const filteredScopes = scopes.filter((s: string) => validScopes.includes(s as ApiScope));

    if (filteredScopes.length === 0) {
      return NextResponse.json({ error: "Invalid scopes provided" }, { status: 400 });
    }

    const result = await createApiKey(session.user.id, {
      name: name.trim(),
      scopes: filteredScopes,
      expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      rateLimitOverride: rateLimitOverride ? Number(rateLimitOverride) : undefined,
    });

    return NextResponse.json({
      ...result,
      warning: "Save this API key now. It will not be shown again.",
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("[API Keys] Create error:", error);
    const message = error instanceof Error ? error.message : "Failed to create API key";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
