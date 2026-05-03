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
import { db } from "@/lib/db";
import { compareScreenshots, captureForVisualRegression, createCompositeDiff } from "@/lib/visual/compare";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { checkCredits, deductCredits } from "@/lib/billing/credits";
import { checkFeatureAccess } from "@/lib/billing/subscription";

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

    // ── Plan feature check (visual regression requires Pro+) ──
    const featureAccess = await checkFeatureAccess(session.user.id, "visualRegression");
    if (!featureAccess.allowed) {
      return NextResponse.json({
        error: "Feature not available",
        details: featureAccess.reason ?? "Visual regression requires the Pro plan or higher",
        requiredPlan: featureAccess.requiredPlan,
      }, { status: 403 });
    }

    // ── Credit check & deduction ──
    const creditCheck = await checkCredits(session.user.id, "visual_compare");
    if (!creditCheck.hasCredits) {
      return NextResponse.json({
        error: "Insufficient credits",
        details: `Visual comparison requires ${creditCheck.required} credits. You have ${creditCheck.balance}.`,
        creditsRequired: creditCheck.required,
        creditsBalance: creditCheck.balance,
      }, { status: 402 });
    }
    const creditDeduction = await deductCredits(
      session.user.id,
      "visual_compare",
      `Visual regression comparison for baseline ${baselineId}`,
      baselineId,
      "visual_baseline"
    );
    if (!creditDeduction.success) {
      return NextResponse.json({ error: "Credit deduction failed", details: "Could not deduct credits for visual comparison" }, { status: 402 });
    }

    // Fetch the baseline
    const baseline = await db.visualBaseline.findFirst({
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
      diffRecord = await db.visualDiff.create({
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

      // Dispatch notification if visual difference detected
      if (!result.match && diffRecord) {
        try {
          await dispatchNotification({
            type: "visual_diff",
            title: `👁️ Visual diff detected: ${baseline.name}`,
            message: `Baseline "${baseline.name}" on ${baseline.url} shows ${result.mismatchPercent.toFixed(2)}% visual difference. ${result.mismatchPixels} of ${result.totalPixels} pixels changed.`,
            userId: session.user.id,
            projectId: baseline.projectId,
            testRunId: testRunId ?? undefined,
            actionUrl: `${process.env.NEXTAUTH_URL || "https://probato-ai.vercel.app"}/dashboard`,
            priority: result.mismatchPercent > 5 ? "high" : "normal",
            metadata: {
              baselineId: baseline.id,
              baselineName: baseline.name,
              diffId: diffRecord.id,
              mismatchPercent: result.mismatchPercent,
              mismatchPixels: result.mismatchPixels,
            },
          });
        } catch (notifError) {
          console.error("[Visual Compare] Failed to dispatch notification:", notifError);
        }
      }
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
