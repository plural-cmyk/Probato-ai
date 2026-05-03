import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { executeTestRun } from "@/lib/agent/test-executor";
import { VERCEL_HOBBY_TIMEOUT } from "@/lib/browser/chromium";
import { TestAction, sel, actions } from "@/lib/agent/actions";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

// ── POST /api/discover/[featureId] ─ Run test for a discovered feature ─

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ featureId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { featureId } = await params;

    // Get the feature with its project
    const feature = await db.feature.findUnique({
      where: { id: featureId },
      include: { project: true },
    });

    if (!feature) {
      return NextResponse.json({ error: "Feature not found" }, { status: 404 });
    }

    // Get the URL from the feature or project
    const targetUrl = feature.route ?? feature.project.sandboxUrl ?? feature.project.repoUrl;
    if (!targetUrl) {
      return NextResponse.json(
        { error: "No URL available for this feature. Set a route or sandbox URL." },
        { status: 400 }
      );
    }

    // Get suggested actions from the request body, or use feature data to build them
    const body = await request.json().catch(() => ({}));
    const { actions: rawActions, url: overrideUrl } = body;

    const testUrl = overrideUrl ?? targetUrl;

    // Build test actions
    let testActions: TestAction[];
    if (rawActions && Array.isArray(rawActions) && rawActions.length > 0) {
      testActions = rawActions as TestAction[];
    } else {
      // Auto-generate a basic test from the feature
      testActions = buildActionsFromFeature(feature, testUrl);
    }

    console.log(`[Feature Test] Running test for "${feature.name}" on ${testUrl} (${testActions.length} actions)`);

    // Create a test run record
    const testRun = await db.testRun.create({
      data: {
        projectId: feature.projectId,
        status: "running",
        triggeredBy: "auto-discover",
        startedAt: new Date(),
      },
    });

    // Execute the test
    const isVercel = !!process.env.VERCEL;
    const overallTimeout = isVercel ? VERCEL_HOBBY_TIMEOUT : 120000;

    const result = await Promise.race([
      executeTestRun({
        url: testUrl,
        actions: testActions,
        viewport: { width: 1280, height: 720 },
        screenshotEveryStep: true,
        maxSteps: 20,
        timeout: 5000,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Test timed out after ${Math.round(overallTimeout / 1000)}s`)), overallTimeout)
      ),
    ]);

    // Update test run record
    await db.testRun.update({
      where: { id: testRun.id },
      data: {
        status: result.status,
        endedAt: new Date(),
        logs: JSON.stringify(result.summary),
      },
    });

    // Save individual results
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      if (step.status === "passed" || step.status === "failed") {
        await db.testResult.create({
          data: {
            testRunId: testRun.id,
            testName: step.action.label ?? `Step ${i + 1}: ${step.action.type}`,
            featureName: feature.name,
            status: step.status,
            duration: step.duration,
            error: step.error,
          },
        });
      }
    }

    // Update the feature's test case if there's a generated code representation
    const testCode = JSON.stringify(testActions, null, 2);
    const existingTestCase = await db.testCase.findFirst({
      where: { featureId: feature.id },
    });

    if (existingTestCase) {
      await db.testCase.update({
        where: { id: existingTestCase.id },
        data: {
          code: testCode,
          selector: feature.selector ?? undefined,
          autoHealed: false,
        },
      });
    } else {
      await db.testCase.create({
        data: {
          name: `Auto-test: ${feature.name}`,
          description: `Automatically generated test for ${feature.name}`,
          code: testCode,
          selector: feature.selector ?? undefined,
          featureId: feature.id,
        },
      });
    }

    console.log(`[Feature Test] Completed: ${result.status} in ${result.duration}ms`);

    return NextResponse.json({
      testRunId: testRun.id,
      featureId: feature.id,
      featureName: feature.name,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Feature Test] Failed:", message);
    return NextResponse.json(
      { error: "Feature test failed", details: message },
      { status: 500 }
    );
  }
}

// ── Helper: Build basic test actions from a feature ──────────────

function buildActionsFromFeature(
  feature: {
    name: string;
    type: string;
    selector?: string | null;
    route?: string | null;
    description?: string | null;
  },
  url: string
): TestAction[] {
  switch (feature.type) {
    case "form":
      return [
        actions.navigate(url, `Navigate to form`),
        actions.waitForSelector(sel.css(feature.selector ?? "form"), 5000, "Wait for form"),
        actions.screenshot(false, "Form loaded"),
        actions.assertVisible(sel.css(feature.selector ?? "form"), "Verify form is visible"),
      ];

    case "navigation":
      return [
        actions.navigate(url, `Navigate to page`),
        actions.waitForSelector(sel.css("nav, [role=navigation]"), 5000, "Wait for navigation"),
        actions.assertVisible(sel.css("nav, [role=navigation]"), "Verify navigation is visible"),
        actions.screenshot(false, "Navigation check"),
      ];

    case "page":
      return [
        actions.navigate(feature.route ?? url, `Navigate to ${feature.name}`),
        actions.waitForSelector(sel.css("body"), 5000, "Wait for page"),
        actions.screenshot(false, "Page loaded"),
      ];

    case "component":
      return [
        actions.navigate(url, `Navigate to page`),
        actions.waitForSelector(sel.css("body"), 5000, "Wait for page"),
        ...(feature.selector
          ? [
              actions.assertVisible(sel.css(feature.selector), `Verify ${feature.name} is visible`),
              actions.screenshot(false, `Component: ${feature.name}`),
            ]
          : [actions.screenshot(false, "Page check")]),
      ];

    default:
      return [
        actions.navigate(url, `Navigate to ${url}`),
        actions.screenshot(false, "Basic check"),
      ];
  }
}
