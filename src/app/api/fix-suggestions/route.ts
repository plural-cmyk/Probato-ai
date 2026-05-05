import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateFixSuggestions } from "@/lib/agent/fix-suggester";
import type { TestAction } from "@/lib/agent/actions";

export const dynamic = "force-dynamic";

// ── GET /api/fix-suggestions ─ List fix suggestions ──

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const testRunId = searchParams.get("testRunId");
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    // Build where clause
    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (testRunId) where.testRunId = testRunId;
    if (status) where.status = status;
    if (type) where.type = type;

    // Ensure user can only see suggestions for their projects
    if (!projectId && !testRunId) {
      where.project = { userId: session.user.id };
    }

    const [suggestions, total] = await Promise.all([
      db.fixSuggestion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          testResult: { select: { id: true, testName: true, status: true, error: true } },
          testRun: { select: { id: true, status: true, triggeredBy: true } },
          testCase: { select: { id: true, name: true } },
        },
      }),
      db.fixSuggestion.count({ where }),
    ]);

    return NextResponse.json({
      suggestions,
      total,
      limit,
      offset,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Fix-Suggestions] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch fix suggestions", details: message }, { status: 500 });
  }
}

// ── POST /api/fix-suggestions ─ Generate fix suggestions for a failed test ──

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { testResultId, testRunId, projectId, stepIndex } = body;

    if (!testResultId || !testRunId || !projectId) {
      return NextResponse.json(
        { error: "testResultId, testRunId, and projectId are required" },
        { status: 400 }
      );
    }

    // Fetch the test result
    const testResult = await db.testResult.findUnique({
      where: { id: testResultId },
    });

    if (!testResult) {
      return NextResponse.json({ error: "Test result not found" }, { status: 404 });
    }

    if (testResult.status !== "failed" && testResult.status !== "error") {
      return NextResponse.json(
        { error: `Test result status is "${testResult.status}", not "failed". Only failed results can have fix suggestions.` },
        { status: 400 }
      );
    }

    // Verify the project belongs to the user
    const project = await db.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 403 });
    }

    // Check if suggestions already exist for this test result
    const existingSuggestions = await db.fixSuggestion.findMany({
      where: { testResultId },
    });

    if (existingSuggestions.length > 0) {
      return NextResponse.json({
        message: "Fix suggestions already exist for this test result",
        suggestions: existingSuggestions,
        newlyGenerated: false,
      });
    }

    // Reconstruct the failed action from the error message
    // Since TestResult doesn't store the full action, we reconstruct what we can
    const failedAction: TestAction = reconstructAction(testResult);

    // Find associated test case for context
    let testCaseCode: string | undefined;
    let testCaseId: string | undefined;

    // Try to find the test case from the feature
    const feature = await db.feature.findFirst({
      where: {
        projectId,
        testCases: {
          some: { name: { contains: testResult.testName.split(" ")[0] } },
        },
      },
      include: { testCases: { take: 1 } },
    });

    if (feature?.testCases[0]) {
      testCaseCode = feature.testCases[0].code;
      testCaseId = feature.testCases[0].id;
    }

    // Generate fix suggestions
    const result = await generateFixSuggestions({
      testResultId,
      testRunId,
      projectId,
      userId: session.user.id,
      stepIndex: stepIndex ?? 0,
      error: testResult.error ?? "Unknown error",
      action: failedAction,
      testCaseCode,
      testCaseId,
      pageUrl: project.sandboxUrl ?? project.repoUrl,
    });

    // Fetch the persisted suggestions
    const persistedSuggestions = await db.fixSuggestion.findMany({
      where: { testResultId },
      orderBy: { confidence: "desc" },
    });

    return NextResponse.json({
      suggestions: persistedSuggestions,
      newlyGenerated: true,
      llmUsed: result.llmUsed,
      duration: result.duration,
      error: result.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Fix-Suggestions] POST failed:", message);
    return NextResponse.json({ error: "Failed to generate fix suggestions", details: message }, { status: 500 });
  }
}

// ── Helper: Reconstruct a TestAction from a TestResult ──

function reconstructAction(testResult: {
  testName: string;
  error?: string | null;
  featureName?: string | null;
}): TestAction {
  const error = testResult.error ?? "";
  const testName = testResult.testName;

  // Try to determine the action type from the error
  if (error.includes("click")) {
    return {
      type: "click",
      selector: extractSelector(error) ?? { strategy: "css", value: "body" },
      label: testName,
    };
  }

  if (error.includes("fill") || error.includes("type") || error.includes("input")) {
    return {
      type: "fill",
      selector: extractSelector(error) ?? { strategy: "css", value: "input" },
      value: "",
      label: testName,
    };
  }

  if (error.includes("assertText") || error.includes("Text assertion")) {
    return {
      type: "assertText",
      selector: extractSelector(error) ?? { strategy: "css", value: "body" },
      expected: extractExpectedText(error) ?? "",
      label: testName,
    };
  }

  if (error.includes("assertVisible") || error.includes("not visible")) {
    return {
      type: "assertVisible",
      selector: extractSelector(error) ?? { strategy: "css", value: "body" },
      label: testName,
    };
  }

  if (error.includes("assertUrl") || error.includes("URL assertion")) {
    return {
      type: "assertUrl",
      expected: "",
      label: testName,
    };
  }

  if (error.includes("navigate") || error.includes("navigation")) {
    return {
      type: "navigate",
      url: "",
      label: testName,
    };
  }

  // Default: generic action
  return {
    type: "click",
    selector: extractSelector(error) ?? { strategy: "css", value: "body" },
    label: testName,
  };
}

function extractSelector(error: string): { strategy: "css" | "testId" | "text" | "role"; value: string } | null {
  const cssMatch = error.match(/css:"([^"]+)"/);
  if (cssMatch) return { strategy: "css", value: cssMatch[1] };

  const testIdMatch = error.match(/testId:"([^"]+)"/);
  if (testIdMatch) return { strategy: "testId", value: testIdMatch[1] };

  const textMatch = error.match(/text:"([^"]+)"/);
  if (textMatch) return { strategy: "text", value: textMatch[1] };

  const roleMatch = error.match(/role:"([^"]+)"/);
  if (roleMatch) return { strategy: "role", value: roleMatch[1] };

  return null;
}

function extractExpectedText(error: string): string | null {
  const match = error.match(/Expected ["']([^"']+)["']/);
  return match ? match[1] : null;
}
