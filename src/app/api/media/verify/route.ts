import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runMediaVerification } from "@/lib/agent/media-verifier";

export const dynamic = "force-dynamic";

// ── POST /api/media/verify ─ Run a media verification ──

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { url, projectId, checkImages, checkVideos, checkAudio, captureFrames, maxFrames, transcribeAudio, maxTranscriptions } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "url is required and must be a string" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const result = await runMediaVerification({
      userId: session.user.id,
      url,
      projectId: projectId || undefined,
      checkImages: checkImages !== false,
      checkVideos: checkVideos !== false,
      checkAudio: checkAudio !== false,
      captureFrames: captureFrames === true,
      maxFrames: maxFrames ? Math.min(Number(maxFrames), 10) : 5,
      transcribeAudio: transcribeAudio === true,
      maxTranscriptions: maxTranscriptions ? Math.min(Number(maxTranscriptions), 5) : 3,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ verification: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Media-Verify] POST failed:", message);
    return NextResponse.json(
      { error: "Media verification failed", details: message },
      { status: 500 }
    );
  }
}
