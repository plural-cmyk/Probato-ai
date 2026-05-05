/**
 * Test Run — Synchronous API
 *
 * POST /api/test/run
 *
 * Executes a test run with the given URL and preset, returns results
 * as a single JSON response (non-streaming). Used by the onboarding
 * wizard and dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { executeTestRun } from "@/lib/agent/test-executor";
import { TestAction, sel, actions } from "@/lib/agent/actions";
import { checkCredits, deductCredits } from "@/lib/billing/credits";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ── Preset Action Builders ──

function buildPresetActions(preset: string, url: string): TestAction[] {
  switch (preset) {
    case "smoke":
      return [
        actions.navigate(url, "Navigate to target URL"),
        actions.waitForSelector(sel.css("body"), 10000, "Wait for page to load"),
        actions.screenshot(false, "Page loaded"),
      ];
    case "navigation":
      return [
        actions.navigate(url, "Navigate to target URL"),
        actions.waitForSelector(sel.css("nav, [role=navigation]"), 10000, "Wait for navigation"),
        actions.assertVisible(sel.css("nav, [role=navigation]"), "Verify navigation is visible"),
        actions.screenshot(false, "Navigation check"),
      ];
    case "full-page-screenshot":
      return [
        actions.navigate(url, "Navigate to target URL"),
        actions.waitForSelector(sel.css("body"), 10000, "Wait for page"),
        actions.screenshot(true, "Full page screenshot"),
      ];
    default:
      return [
        actions.navigate(url, "Navigate to target URL"),
        actions.screenshot(false, "Basic check"),
      ];
  }
}

// ── POST /api/test/run ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, preset, actions: rawActions, projectId, screenshotEveryStep } = body as {
    url?: string;
    preset?: string;
    actions?: TestAction[];
    projectId?: string;
    screenshotEveryStep?: boolean;
  };

  // Validate URL
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  // Credit check
  const creditCheck = await checkCredits(userId, "test_execution");
  if (!creditCheck.hasCredits) {
    return NextResponse.json(
      { error: "Insufficient credits", required: creditCheck.required, balance: creditCheck.balance },
      { status: 402 }
    );
  }

  // Build test actions
  const testActions: TestAction[] =
    rawActions && Array.isArray(rawActions) && rawActions.length > 0
      ? rawActions
      : buildPresetActions(preset ?? "smoke", url);

  // Resolve project
  let resolvedProjectId = projectId;
  if (!resolvedProjectId) {
    let project = await db.project.findFirst({
      where: { userId, name: "Onboarding Tests" },
    });
    if (!project) {
      project = await db.project.create({
        data: {
          name: "Onboarding Tests",
          repoUrl: url,
          repoName: "Onboarding Tests",
          userId,
          status: "ready",
        },
      });
    }
    resolvedProjectId = project.id;
  }

  // Create test run record
  const testRun = await db.testRun.create({
    data: {
      projectId: resolvedProjectId,
      status: "running",
      triggeredBy: "manual",
      startedAt: new Date(),
    },
  });

  // Deduct credits
  await deductCredits(userId, "test_execution", `Test run ${testRun.id}`, testRun.id, "test_run", 1);

  // Execute the test run
  try {
    const result = await executeTestRun({
      url,
      actions: testActions,
      screenshotEveryStep: screenshotEveryStep !== false,
      maxSteps: 30,
      timeout: 5000,
    });

    // Persist step results
    for (const step of result.steps) {
      try {
        await db.testResult.create({
          data: {
            testRunId: testRun.id,
            testName: step.action.label ?? `Step: ${step.action.type}`,
            status: step.status,
            duration: step.duration,
            error: step.error,
            screenshot: step.screenshot,
          },
        });
      } catch (dbError) {
        console.error("[Test Run] Failed to save step result:", dbError);
      }
    }

    // Update test run record
    await db.testRun.update({
      where: { id: testRun.id },
      data: {
        status: result.status,
        endedAt: new Date(),
        logs: JSON.stringify(result.summary),
      },
    });

    return NextResponse.json({
      testRunId: testRun.id,
      result: {
        status: result.status,
        steps: result.steps.map((s) => ({
          action: { type: s.action.type, label: s.action.label },
          status: s.status,
          screenshot: s.screenshot,
          actualText: s.actualText,
          actualUrl: s.actualUrl,
          error: s.error,
          duration: s.duration,
          timestamp: s.timestamp,
        })),
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        duration: result.duration,
        summary: result.summary,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Test Run] Failed:", message);

    // Update test run with error
    try {
      await db.testRun.update({
        where: { id: testRun.id },
        data: { status: "error", endedAt: new Date(), logs: message },
      });
    } catch {
      // Ignore DB update error
    }

    return NextResponse.json(
      { error: "Test run failed", details: message, testRunId: testRun.id },
      { status: 500 }
    );
  }
}
