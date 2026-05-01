import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { discoverFeatures, getProjectFeatures, clearProjectFeatures } from "@/lib/agent/feature-discovery";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ── POST /api/discover ─ Discover features from a URL ────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { url, projectId, includeLLM, clearExisting } = body;

    if (!url || !url.startsWith("http")) {
      return NextResponse.json(
        { error: "A valid URL starting with http:// or https:// is required" },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required to persist discovered features" },
        { status: 400 }
      );
    }

    console.log(`[Discover] Starting discovery for ${url} (project: ${projectId})`);

    // Optionally clear existing features before re-discovery
    if (clearExisting) {
      try {
        await clearProjectFeatures(projectId);
        console.log(`[Discover] Cleared existing features for project ${projectId}`);
      } catch (clearError) {
        console.warn("[Discover] Failed to clear existing features:", clearError);
      }
    }

    // Run feature discovery
    const result = await discoverFeatures(url, projectId, {
      includeLLM: includeLLM !== false,
      maxDepth: 0, // Just the provided page for now
    });

    console.log(
      `[Discover] Found ${result.features.length} features, persisted ${result.persistedCount} in ${result.duration}ms`
    );

    return NextResponse.json({
      success: true,
      page: result.page,
      features: result.features,
      persistedCount: result.persistedCount,
      duration: result.duration,
      error: result.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Discover] Failed:", message);
    return NextResponse.json(
      { error: "Feature discovery failed", details: message },
      { status: 500 }
    );
  }
}

// ── GET /api/discover ─ Get features for a project ──────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId query parameter is required" },
        { status: 400 }
      );
    }

    const features = await getProjectFeatures(projectId);

    return NextResponse.json({
      features,
      count: features.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Discover] GET failed:", message);
    return NextResponse.json(
      { error: "Failed to fetch features", details: message },
      { status: 500 }
    );
  }
}
