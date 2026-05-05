/**
 * Live Test Execution — Streaming API
 *
 * POST /api/test/run-live
 *
 * Starts a test run and streams step-by-step results back to the client
 * using a streaming HTTP response (ReadableStream). This enables the
 * Live Test View in the dashboard.
 *
 * Each line in the response is a JSON event:
 *   {"type":"run_start","runId":"...","url":"...","totalSteps":5,...}
 *   {"type":"step_start","stepIndex":0,"action":{...},...}
 *   {"type":"step_complete","stepIndex":0,"status":"passed","screenshot":"...",...}
 *   {"type":"run_complete","status":"passed","summary":{...},...}
 *
 * The client reads this stream using fetch() + ReadableStream reader.
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { executeLiveTestRun, LiveTestEvent } from "@/lib/agent/live-test-executor";
import { TestAction, sel, actions } from "@/lib/agent/actions";
import { VERCEL_HOBBY_TIMEOUT } from "@/lib/browser/chromium";
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
    case "login":
      return [
        actions.navigate(url, "Navigate to login page"),
        actions.waitForSelector(sel.placeholder("Email"), 10000, "Wait for login form"),
        actions.screenshot(false, "Login page loaded"),
        actions.fill(sel.placeholder("Email"), "test@example.com", "Fill email"),
        actions.fill(sel.placeholder("Password"), "testpassword", "Fill password"),
        actions.screenshot(false, "Credentials entered"),
        actions.click(sel.css('button[type="submit"]'), "Click login button"),
        actions.waitForNavigation(10000, "Wait for login to complete"),
        actions.screenshot(false, "After login"),
      ];
    case "form":
      return [
        actions.navigate(url, "Navigate to target URL"),
        actions.waitForSelector(sel.css("form, [role=form]"), 10000, "Wait for form"),
        actions.screenshot(false, "Form loaded"),
        actions.assertVisible(sel.css("form, [role=form]"), "Verify form is visible"),
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

// ── POST /api/test/run-live ─────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth Check ──
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const userId = session.user.id;

  // ── Parse Request Body ──
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { url, preset, actions: rawActions, projectId } = body as {
    url?: string;
    preset?: string;
    actions?: TestAction[];
    projectId?: string;
  };

  // Validate URL
  if (!url || typeof url !== "string") {
    return new Response(JSON.stringify({ error: "URL is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  try {
    new URL(url);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL format" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  // ── Credit Check ──
  const creditCheck = await checkCredits(userId, "test_execution");
  if (!creditCheck.hasCredits) {
    return new Response(
      JSON.stringify({ error: "Insufficient credits", required: creditCheck.required, balance: creditCheck.balance }),
      { status: 402, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Build Test Actions ──
  const testActions: TestAction[] = rawActions && Array.isArray(rawActions) && rawActions.length > 0
    ? rawActions
    : buildPresetActions(preset ?? "smoke", url);

  // ── Resolve Project ──
  let resolvedProjectId = projectId;
  if (!resolvedProjectId) {
    // Find or create a default project for live test runs
    let project = await db.project.findFirst({
      where: { userId, name: "Live Tests" },
    });
    if (!project) {
      project = await db.project.create({
        data: {
          name: "Live Tests",
          repoUrl: url,
          repoName: "Live Tests",
          userId,
          status: "ready",
        },
      });
    }
    resolvedProjectId = project.id;
  }

  // ── Create Test Run Record ──
  const testRun = await db.testRun.create({
    data: {
      projectId: resolvedProjectId,
      status: "running",
      triggeredBy: "manual",
      startedAt: new Date(),
    },
  });

  // ── Deduct Credits ──
  await deductCredits(
    userId,
    "test_execution",
    `Live test run ${testRun.id}`,
    testRun.id,
    "test_run",
    1
  );

  // ── Create AbortController for cancellation ──
  const abortController = new AbortController();

  // ── Create Streaming Response ──
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of executeLiveTestRun({
          runId: testRun.id,
          projectId: resolvedProjectId!,
          userId,
          url,
          actions: testActions,
          preset,
          viewport: { width: 1280, height: 720 },
          screenshotEveryStep: true,
          maxSteps: 30,
          timeout: 5000,
          captureConsole: true,
          captureNetwork: true,
          abortSignal: abortController.signal,
        })) {
          // Send each event as a newline-delimited JSON line
          const line = JSON.stringify(event) + "\n";
          controller.enqueue(encoder.encode(line));

          // Persist step results to DB
          if (event.type === "step_complete") {
            const stepEvent = event as Extract<typeof event, { type: "step_complete" }>;
            try {
              await db.testResult.create({
                data: {
                  testRunId: testRun.id,
                  testName: stepEvent.action.label ?? `Step ${stepEvent.stepIndex + 1}: ${stepEvent.action.type}`,
                  status: stepEvent.status,
                  duration: stepEvent.duration,
                  error: stepEvent.error,
                  screenshot: stepEvent.screenshot,
                },
              });
            } catch (dbError) {
              console.error("[Live Test] Failed to save step result:", dbError);
            }
          }

          // Update test run status on completion
          if (event.type === "run_complete") {
            const completeEvent = event as Extract<typeof event, { type: "run_complete" }>;
            try {
              await db.testRun.update({
                where: { id: testRun.id },
                data: {
                  status: completeEvent.status,
                  endedAt: new Date(),
                  logs: JSON.stringify(completeEvent.summary),
                },
              });
            } catch (dbError) {
              console.error("[Live Test] Failed to update test run:", dbError);
            }
          }
        }

        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[Live Test] Stream error:", message);

        // Try to send error event before closing
        try {
          const errorEvent = JSON.stringify({
            type: "error",
            runId: testRun.id,
            timestamp: new Date().toISOString(),
            message,
          }) + "\n";
          controller.enqueue(encoder.encode(errorEvent));
        } catch {
          // Stream may already be closed
        }

        // Update test run status
        try {
          await db.testRun.update({
            where: { id: testRun.id },
            data: { status: "error", endedAt: new Date(), logs: message },
          });
        } catch { /* DB update failed too */ }

        controller.close();
      }
    },

    cancel() {
      // Client disconnected — abort the test
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
      "Access-Control-Allow-Origin": "*",
    },
  });
}
