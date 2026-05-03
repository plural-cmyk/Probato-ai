/**
 * POST /api/visual/compare
 *
 * Compare a current screenshot against a stored baseline.
 * This is the core visual regression comparison endpoint.
 *
 * Two modes:
 * 1. Provide baselineId + URL: captures a new screenshot from the URL and compares against the baseline
 * 2. Provide baselineId + currentScreenshot (base64): compares the provided screenshot against the baseline
 *
 * Returns mismatch percentage, diff image, and creates a VisualDiff record in the DB.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { compareScreenshots, captureForVisualRegression, createCompositeDiff } from "@/lib/visual/compare";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      baselineId,
      url,
      currentScreenshot,
      threshold = 0.1,
      maxMismatchPercent = 0,
      createDiff = true,
      testRunId,
    } = body;

    if (!baselineId) {
      return NextResponse.json(
        { error: "baselineId is required" },
        { status: 400 }
      );
    }

    // Fetch the baseline
    const baseline = await prisma.visualBaseline.findFirst({
      where: {
        id: baselineId,
        userId: session.user.id,
      },
    });

    if (!baseline) {
      return NextResponse.json({ error: "Baseline not found" }, { status: 404 });
    }

    // Get the current screenshot: either provided directly or captured from URL
    let currentBase64: string;

    if (currentScreenshot) {
      currentBase64 = currentScreenshot;
    } else if (url) {
      currentBase64 = await captureForVisualRegression({
        url,
        selector: baseline.selector ?? undefined,
        viewportWidth: baseline.viewportWidth,
        viewportHeight: baseline.viewportHeight,
        waitForSelector: undefined,
        waitMs: 2000,
      });
    } else {
      return NextResponse.json(
        { error: "Either url or currentScreenshot must be provided" },
        { status: 400 }
      );
    }

    // Perform pixel comparison
    const result = await compareScreenshots(baseline.screenshot, currentBase64, {
      threshold,
      maxMismatchPercent,
    });

    // Generate composite diff (current screenshot with red diff overlay)
    const compositeDiff = await createCompositeDiff(
      baseline.screenshot,
      currentBase64,
      result.diffImageBase64
    );

    // Create VisualDiff record in DB
    let diffRecord = null;
    if (createDiff) {
      diffRecord = await prisma.visualDiff.create({
        data: {
          status: result.match ? "approved" : "pending",
          mismatchPercent: result.mismatchPercent,
          mismatchPixels: result.mismatchPixels,
          totalPixels: result.totalPixels,
          threshold,
          currentScreenshot: currentBase64,
          diffScreenshot: compositeDiff,
          baselineId: baseline.id,
          projectId: baseline.projectId,
          testRunId: testRunId ?? null,
        },
      });
    }

    return NextResponse.json({
      match: result.match,
      mismatchPercent: result.mismatchPercent,
      mismatchPixels: result.mismatchPixels,
      totalPixels: result.totalPixels,
      width: result.width,
      height: result.height,
      diffId: diffRecord?.id ?? null,
      diffStatus: diffRecord?.status ?? null,
      // Don't return the full base64 screenshots in the response — too large
      // Clients should use the diff ID to fetch the diff details
      message: result.match
        ? "Screenshots match within threshold"
        : `Visual difference detected: ${result.mismatchPercent.toFixed(2)}% mismatch`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Visual Compare] Error:", message);
    return NextResponse.json(
      { error: "Failed to compare screenshots", details: message },
      { status: 500 }
    );
  }
}
