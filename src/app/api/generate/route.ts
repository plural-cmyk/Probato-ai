import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatePlaywrightTest, generateTestSuite, generateCombinedTestFile } from "@/lib/agent/test-generator";
import { sel, actions as actionHelpers } from "@/lib/agent/actions";
import { checkCredits, deductCredits } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

// ── POST /api/generate ─ Generate Playwright test code ────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, featureId, url, actions, format } = body;

    // ── Credit check & deduction ──
    const creditCheck = await checkCredits(session.user.id, "test_generation");
    if (!creditCheck.hasCredits) {
      return NextResponse.json({
        error: "Insufficient credits",
        details: `Test generation requires ${creditCheck.required} credits. You have ${creditCheck.balance}.`,
        creditsRequired: creditCheck.required,
        creditsBalance: creditCheck.balance,
      }, { status: 402 });
    }
    const creditDeduction = await deductCredits(
      session.user.id,
      "test_generation",
      `Test generation for ${projectId ?? featureId ?? "unknown"}`,
      projectId ?? featureId,
      projectId ? "project" : "feature"
    );
    if (!creditDeduction.success) {
      return NextResponse.json({ error: "Credit deduction failed", details: "Could not deduct credits for test generation" }, { status: 402 });
    }

    // Mode 1: Generate for a single feature
    if (featureId) {
      const feature = await db.feature.findUnique({
        where: { id: featureId },
        include: { testCases: true },
      });

      if (!feature) {
        return NextResponse.json({ error: "Feature not found" }, { status: 404 });
      }

      // Use the feature's route or the provided URL, or project's liveUrl
      let targetUrl = url ?? feature.route ?? "";
      if (!targetUrl) {
        const project = await db.project.findUnique({ where: { id: feature.projectId } });
        if (project?.liveUrl) {
          targetUrl = project.liveUrl;
        } else if (project?.sandboxUrl) {
          targetUrl = project.sandboxUrl;
        }
      }
      if (!targetUrl) {
        return NextResponse.json({ error: "No URL available for this feature" }, { status: 400 });
      }

      // Build test actions from feature if not provided
      const testActions = actions ?? buildActionsFromFeatureData(feature, targetUrl);

      const testCase = generatePlaywrightTest(
        feature.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase(),
        feature.name,
        targetUrl,
        testActions,
        { description: feature.description ?? undefined }
      );

      // Save/update the test case in DB
      const existingTestCase = feature.testCases[0];
      if (existingTestCase) {
        await db.testCase.update({
          where: { id: existingTestCase.id },
          data: {
            name: testCase.name,
            description: testCase.description,
            code: testCase.code,
            selector: feature.selector ?? undefined,
          },
        });
      } else {
        await db.testCase.create({
          data: {
            name: testCase.name,
            description: testCase.description,
            code: testCase.code,
            selector: feature.selector ?? undefined,
            featureId: feature.id,
          },
        });
      }

      return NextResponse.json({
        generated: true,
        testCase,
        featureId: feature.id,
      });
    }

    // Mode 2: Generate for all features in a project
    if (projectId) {
      const features = await db.feature.findMany({
        where: { projectId },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        include: { testCases: true },
      });

      if (features.length === 0) {
        return NextResponse.json({ error: "No features found for this project. Run discovery first." }, { status: 400 });
      }

      // Resolve target URL: explicit > feature route > project liveUrl > project repoUrl
      let targetUrl = url ?? "";
      if (!targetUrl) {
        targetUrl = features[0]?.route ?? "";
      }
      if (!targetUrl) {
        const project = await db.project.findUnique({ where: { id: projectId } });
        if (project?.liveUrl) {
          targetUrl = project.liveUrl;
        } else if (project?.sandboxUrl) {
          targetUrl = project.sandboxUrl;
        } else if (project?.repoUrl && project.repoUrl.startsWith("http")) {
          targetUrl = project.repoUrl;
        }
      }
      if (!targetUrl) {
        return NextResponse.json({ error: "No URL available. Provide a URL in the dashboard or ensure the project has a live URL." }, { status: 400 });
      }

      // Build feature data for test generation
      const featureData = features.map((f) => ({
        name: f.name || "Unnamed feature",
        type: f.type || "unknown",
        description: f.description ?? undefined,
        selector: f.selector ?? undefined,
        suggestedActions: buildActionsFromFeatureData(f, targetUrl),
      }));

      // Try to generate combined test code — wrap in try-catch so individual test saving can still succeed
      let combinedCode = "";
      try {
        combinedCode = generateCombinedTestFile(
          "Probato Project",
          targetUrl,
          featureData
        );
      } catch (genErr) {
        console.error("[Generate] Combined code generation failed:", genErr);
      }

      if (format === "combined") {
        // Generate a single combined test file
        if (!combinedCode) {
          try {
            combinedCode = generateCombinedTestFile("Probato Project", targetUrl, featureData);
          } catch (e) {
            console.error("[Generate] Combined format generation failed:", e);
            return NextResponse.json({ error: "Test generation failed", details: e instanceof Error ? e.message : String(e) }, { status: 500 });
          }
        }

        return NextResponse.json({
          generated: true,
          format: "combined",
          code: combinedCode,
          featureCount: features.length,
          totalSelectors: featureData.reduce((sum, f) => sum + f.suggestedActions.length, 0),
        });
      }

      // Generate individual test cases
      let suite;
      try {
        suite = generateTestSuite("Project", targetUrl, featureData);
      } catch (suiteErr) {
        console.error("[Generate] Test suite generation failed:", suiteErr);
        return NextResponse.json({ error: "Test generation failed", details: suiteErr instanceof Error ? suiteErr.message : String(suiteErr) }, { status: 500 });
      }

      // Save each test case to DB
      let savedCount = 0;
      for (let i = 0; i < suite.testCases.length; i++) {
        const tc = suite.testCases[i];
        const feature = features[i];
        if (feature) {
          try {
            const existing = feature.testCases[0];
            if (existing) {
              await db.testCase.update({
                where: { id: existing.id },
                data: { name: tc.name, description: tc.description, code: tc.code, selector: feature.selector ?? undefined },
              });
            } else {
              await db.testCase.create({
                data: {
                  name: tc.name,
                  description: tc.description,
                  code: tc.code,
                  selector: feature.selector ?? undefined,
                  featureId: feature.id,
                },
              });
            }
            savedCount++;
          } catch {
            // Skip failures
          }
        }
      }

      // Use the combined code we already generated (or try again if it failed the first time)
      if (!combinedCode) {
        try {
          combinedCode = generateCombinedTestFile("Probato Project", targetUrl, featureData);
        } catch (e2) {
          console.error("[Generate] Second attempt at combined code failed:", e2);
          combinedCode = suite.testCases.map((tc) => tc.code).join("\n\n");
        }
      }

      return NextResponse.json({
        generated: true,
        format: "suite",
        code: combinedCode,
        suite: {
          ...suite,
          testCases: suite.testCases.map((tc) => ({
            name: tc.name,
            featureName: tc.featureName,
            description: tc.description,
            selectors: tc.selectors,
            url: tc.url,
            code: tc.code,
          })),
        },
        savedCount,
        featureCount: features.length,
      });
    }

    return NextResponse.json(
      { error: "Provide featureId (single) or projectId (all features) to generate tests" },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    console.error("[Generate] Failed:", message, stack);
    return NextResponse.json({ error: "Test generation failed", details: message }, { status: 500 });
  }
}

// ── Helper ──────────────────────────────────────────────────────

function buildActionsFromFeatureData(
  feature: { name: string; type: string; selector?: string | null; route?: string | null },
  url: string
) {
  switch (feature.type) {
    case "form":
      return [
        actionHelpers.navigate(url, `Navigate to form`),
        actionHelpers.waitForSelector(sel.css(feature.selector ?? "form"), 5000, "Wait for form"),
        actionHelpers.screenshot(false, "Form loaded"),
        actionHelpers.assertVisible(sel.css(feature.selector ?? "form"), "Verify form is visible"),
      ];
    case "navigation":
      return [
        actionHelpers.navigate(url, `Navigate to page`),
        actionHelpers.waitForSelector(sel.css("nav, [role=navigation]"), 5000, "Wait for navigation"),
        actionHelpers.assertVisible(sel.css("nav, [role=navigation]"), "Verify navigation is visible"),
        actionHelpers.screenshot(false, "Navigation check"),
      ];
    case "page":
      return [
        actionHelpers.navigate(feature.route ?? url, `Navigate to ${feature.name}`),
        actionHelpers.waitForSelector(sel.css("body"), 5000, "Wait for page"),
        actionHelpers.screenshot(false, "Page loaded"),
      ];
    default:
      return [
        actionHelpers.navigate(url, `Navigate to page`),
        actionHelpers.waitForSelector(sel.css("body"), 5000, "Wait for page"),
        ...(feature.selector
          ? [actionHelpers.assertVisible(sel.css(feature.selector), `Verify ${feature.name} is visible`)]
          : []),
        actionHelpers.screenshot(false, "Basic check"),
      ];
  }
}
