/**
 * API Key Rotation
 * POST /api/api-keys/[id]/rotate — Rotate an API key (revoke old, create new)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rotateApiKey } from "@/lib/api/keys";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const result = await rotateApiKey(session.user.id, id);

    return NextResponse.json({
      ...result,
      warning: "Save this new API key now. The old key has been revoked and this new key will not be shown again.",
    });
  } catch (error: unknown) {
    console.error("[API Keys] Rotate error:", error);
    const message = error instanceof Error ? error.message : "Failed to rotate API key";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
