import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { autoHealTestRun } from "@/lib/agent/auto-heal";
import { db } from "@/lib/db";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { checkCredits, deductCredits } from "@/lib/billing/credits";
import { checkFeatureAccess } from "@/lib/billing/subscription";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

// ── POST /api/auto-heal ─ Attempt to auto-heal a failed test run ──

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { testRunId, url } = body;

    if (!testRunId) {
      return NextResponse.json({ error: "testRunId is required" }, { status: 400 });
    }

    // Get the test run with its results
    const testRun = await db.testRun.findUnique({
      where: { id: testRunId },
      include: { results: true },
    });

    if (!testRun) {
      return NextResponse.json({ error: "Test run not found" }, { status: 404 });
    }

    // Only heal failed test runs
    if (testRun.status !== "failed" && testRun.status !== "error") {
      return NextResponse.json(
        { error: `Test run status is "${testRun.status}", not "failed". Only failed runs can be auto-healed.` },
        { status: 400 }
      );
    }

    // Build failed steps from test results
    const failedResults = testRun.results.filter((r) => r.status === "failed" || r.status === "error");
    const failedSteps = failedResults.map((result) => ({
      action: {
        type: "click" as const,
        selector: result.error
          ? extractSelectorFromError(result.error)
          : { strategy: "css" as const, value: "body" },
        label: result.testName,
      },
      status: result.status as "failed",
      error: result.error ?? "Unknown error",
      duration: result.duration ?? 0,
      timestamp: new Date().toISOString(),
    }));

    if (failedSteps.length === 0) {
      return NextResponse.json({ error: "No failed steps to heal" }, { status: 400 });
    }

    // Determine the target URL
    const targetUrl = url ?? "";

    if (!targetUrl) {
      return NextResponse.json({ error: "URL is required for auto-heal. Provide the target page URL." }, { status: 400 });
    }

    // ── Plan feature check (auto-heal requires Pro+) ──
    const featureAccess = await checkFeatureAccess(session.user.id, "autoHeal");
    if (!featureAccess.allowed) {
      return NextResponse.json({
        error: "Feature not available",
        details: featureAccess.reason ?? "Auto-heal requires the Pro plan or higher",
        requiredPlan: featureAccess.requiredPlan,
      }, { status: 403 });
    }

    // ── Credit check & deduction ──
    const creditCheck = await checkCredits(session.user.id, "auto_heal");
    if (!creditCheck.hasCredits) {
      return NextResponse.json({
        error: "Insufficient credits",
        details: `Auto-heal requires ${creditCheck.required} credits. You have ${creditCheck.balance}.`,
        creditsRequired: creditCheck.required,
        creditsBalance: creditCheck.balance,
      }, { status: 402 });
    }
    const creditDeduction = await deductCredits(
      session.user.id,
      "auto_heal",
      `Auto-heal for test run ${testRunId}`,
      testRunId,
      "test_run"
    );
    if (!creditDeduction.success) {
      return NextResponse.json({ error: "Credit deduction failed", details: "Could not deduct credits for auto-heal" }, { status: 402 });
    }

    console.log(`[Auto-Heal] Starting heal for test run ${testRunId} with ${failedSteps.length} failed step(s)`);

    // Run the auto-heal engine
    const report = await autoHealTestRun(testRunId, targetUrl, failedSteps);

    console.log(`[Auto-Heal] Completed: ${report.totalHealed} healed, ${report.totalFailed} failed in ${report.duration}ms`);

    // Dispatch auto-heal notification
    try {
      await dispatchNotification({
        type: "auto_heal",
        title: report.totalHealed > 0
          ? `🩹 Auto-heal: ${report.totalHealed} test(s) repaired`
          : `⚠️ Auto-heal: No tests could be repaired`,
        message: report.totalHealed > 0
          ? `Auto-heal successfully repaired ${report.totalHealed} of ${report.totalHealed + report.totalFailed} failed tests in ${(report.duration / 1000).toFixed(1)}s.`
          : `Auto-heal could not repair any of the ${report.totalFailed} failed tests. Manual intervention may be required.`,
        userId: session.user.id,
        projectId: testRun.projectId,
        testRunId: testRun.id,
        actionUrl: `${process.env.NEXTAUTH_URL || "https://probato-ai.vercel.app"}/dashboard`,
        priority: report.totalHealed > 0 ? "low" : "normal",
        metadata: {
          totalHealed: report.totalHealed,
          totalFailed: report.totalFailed,
          duration: report.duration,
        },
      });
    } catch (notifError) {
      console.error("[Auto-Heal] Failed to dispatch notification:", notifError);
    }

    return NextResponse.json({
      healed: report.totalHealed > 0,
      report: {
        totalHealed: report.totalHealed,
        totalFailed: report.totalFailed,
        duration: report.duration,
        healResults: report.healResults.map((r) => ({
          originalSelector: r.originalSelector,
          healedSelector: r.healedSelector,
          confidence: r.confidence,
          healed: r.healed,
          retestPassed: r.retestPassed,
          candidateCount: r.candidates.length,
          error: r.error,
        })),
        error: report.error,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Auto-Heal] Failed:", message);
    return NextResponse.json({ error: "Auto-heal failed", details: message }, { status: 500 });
  }
}

// ── Helper ──────────────────────────────────────────────────────

function extractSelectorFromError(error: string): { strategy: "css"; value: string } {
  // Try to extract selector info from the error message
  const cssMatch = error.match(/css:"([^"]+)"/);
  if (cssMatch) return { strategy: "css", value: cssMatch[1] };

  const testIdMatch = error.match(/testId:"([^"]+)"/);
  if (testIdMatch) return { strategy: "css", value: `[data-testid="${testIdMatch[1]}"]` };

  const textMatch = error.match(/text:"([^"]+)"/);
  if (textMatch) return { strategy: "css", value: `text="${textMatch[1]}"` };

  return { strategy: "css", value: "body" };
}
