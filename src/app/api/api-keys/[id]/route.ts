/**
 * API Key Management - Update & Delete
 * PATCH /api/api-keys/[id]  — Update an API key
 * DELETE /api/api-keys/[id] — Delete an API key
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateApiKey, deleteApiKey, revokeApiKey, type ApiScope } from "@/lib/api/keys";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, scopes, rateLimitOverride, enabled } = body;

    // Handle enable/disable
    if (typeof enabled === "boolean" && !enabled) {
      const result = await revokeApiKey(session.user.id, id);
      if (!result.success) {
        return NextResponse.json({ error: result.reason }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: "API key disabled" });
    }

    const validScopes: ApiScope[] = ["read", "write", "admin", "billing"];
    const result = await updateApiKey(session.user.id, id, {
      name: name?.trim(),
      scopes: scopes?.filter((s: string) => validScopes.includes(s as ApiScope)),
      rateLimitOverride: rateLimitOverride !== undefined ? Number(rateLimitOverride) : undefined,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API Keys] Update error:", error);
    return NextResponse.json({ error: "Failed to update API key" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const result = await deleteApiKey(session.user.id, id);

    if (!result.success) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API Keys] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
  }
}
