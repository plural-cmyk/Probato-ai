/**
 * POST /api/integration/promote-to-checkpoint
 *
 * Test-to-Monitor Pipeline: Promotes a test case to a synthetic monitoring checkpoint.
 * Finds the test case and its feature/project, creates a SyntheticCheckpoint
 * from the test definition, auto-generates steps from the test case code.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testCaseId, intervalMinutes, severity } = body as {
      testCaseId: string;
      intervalMinutes?: number;
      severity?: string;
    };

    if (!testCaseId) {
      return NextResponse.json(
        { error: "testCaseId is required" },
        { status: 400 }
      );
    }

    // Find the test case with its feature and project
    const testCase = await db.testCase.findUnique({
      where: { id: testCaseId },
      include: {
        feature: {
          include: {
            project: {
              include: { user: true },
            },
          },
        },
      },
    });

    if (!testCase) {
      return NextResponse.json(
        { error: "Test case not found" },
        { status: 404 }
      );
    }

    const project = testCase.feature.project;
    if (!project) {
      return NextResponse.json(
        { error: "Test case has no associated project" },
        { status: 400 }
      );
    }

    // Auto-generate steps from the test case code
    const steps = parseStepsFromCode(testCase.code, testCase.feature.route);

    // Create the SyntheticCheckpoint
    const checkpoint = await db.syntheticCheckpoint.create({
      data: {
        name: `[Promoted] ${testCase.name}`,
        url: project.repoUrl,
        steps: steps as any,
        expectedOutcome: `Test case "${testCase.name}" should pass — promoted from test definition`,
        intervalMinutes: intervalMinutes || 5,
        severity: severity || "informational",
        enabled: true,
        projectId: project.id,
        userId: project.userId,
      },
    });

    // Create audit log entry
    await createAuditLog({
      action: "integration.promote_to_checkpoint",
      resource: "synthetic_checkpoint",
      resourceId: checkpoint.id,
      resourceType: "synthetic_checkpoint",
      userId: project.userId,
      userEmail: project.user?.email || undefined,
      userName: project.user?.name || undefined,
      metadata: {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        featureId: testCase.feature.id,
        featureName: testCase.feature.name,
        projectId: project.id,
        projectName: project.name,
        checkpointId: checkpoint.id,
        intervalMinutes: checkpoint.intervalMinutes,
        severity: checkpoint.severity,
      },
      severity: "info",
      teamId: project.teamId || undefined,
    });

    return NextResponse.json({
      success: true,
      checkpoint: {
        id: checkpoint.id,
        name: checkpoint.name,
        url: checkpoint.url,
        intervalMinutes: checkpoint.intervalMinutes,
        severity: checkpoint.severity,
        enabled: checkpoint.enabled,
        projectId: checkpoint.projectId,
        stepCount: steps.length,
        createdAt: checkpoint.createdAt,
      },
    });
  } catch (error) {
    console.error("[promote-to-checkpoint] Error:", error);
    return NextResponse.json(
      { error: "Failed to promote test case to checkpoint" },
      { status: 500 }
    );
  }
}

/**
 * Parse interaction steps from Playwright test code.
 * Extracts navigate, click, fill, and assert actions from the test code.
 */
function parseStepsFromCode(
  code: string,
  defaultRoute?: string | null
): Array<{ type: string; value?: string; selector?: string }> {
  const steps: Array<{ type: string; value?: string; selector?: string }> = [];

  if (!code) {
    // Default: just navigate to the page
    if (defaultRoute) {
      steps.push({ type: "navigate", value: defaultRoute });
    }
    steps.push({ type: "assert", selector: "body", value: "loaded" });
    return steps;
  }

  // Extract navigate/goto steps
  const gotoMatches = code.matchAll(/\.goto\(['"`](.*?)['"`]\)/g);
  for (const match of gotoMatches) {
    steps.push({ type: "navigate", value: match[1] });
  }

  // Extract click actions
  const clickMatches = code.matchAll(
    /(?:click|tap)\(['"`](.*?)['"`]|\.locator\(['"`](.*?)['"`]\).*\.click\(\)/g
  );
  for (const match of clickMatches) {
    const selector = match[1] || match[2];
    if (selector) {
      steps.push({ type: "click", selector });
    }
  }

  // Extract fill/input actions
  const fillMatches = code.matchAll(
    /(?:fill|type)\(['"`](.*?)['"`],?\s*['"`](.*?)['"`]|\.locator\(['"`](.*?)['"`]\).*\.fill\(['"`](.*?)['"`]\)/g
  );
  for (const match of fillMatches) {
    const selector = match[1] || match[3];
    const value = match[2] || match[4];
    if (selector) {
      steps.push({ type: "fill", selector, value: value || "" });
    }
  }

  // Extract assertions
  const assertMatches = code.matchAll(
    /expect.*?(?:toContainText|toHaveText|toBeVisible)\(['"`](.*?)['"`]\)/g
  );
  for (const match of assertMatches) {
    steps.push({ type: "assert", value: match[1] });
  }

  // If no steps extracted, create a minimal set
  if (steps.length === 0) {
    if (defaultRoute) {
      steps.push({ type: "navigate", value: defaultRoute });
    }
    steps.push({ type: "assert", selector: "body", value: "loaded" });
  }

  return steps;
}
