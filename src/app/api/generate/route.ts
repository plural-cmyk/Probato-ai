import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatePlaywrightTest, generateTestSuite, generateCombinedTestFile } from "@/lib/agent/test-generator";

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

    // Mode 1: Generate for a single feature
    if (featureId) {
      const feature = await db.feature.findUnique({
        where: { id: featureId },
        include: { testCases: true },
      });

      if (!feature) {
        return NextResponse.json({ error: "Feature not found" }, { status: 404 });
      }

      // Use the feature's route or the provided URL
      const targetUrl = url ?? feature.route ?? "";
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

      const targetUrl = url ?? features[0]?.route ?? "";
      if (!targetUrl) {
        return NextResponse.json({ error: "No URL available. Provide a URL or ensure features have routes." }, { status: 400 });
      }

      // Build feature data for test generation
      const featureData = features.map((f) => ({
        name: f.name,
        type: f.type,
        description: f.description ?? undefined,
        selector: f.selector ?? undefined,
        suggestedActions: buildActionsFromFeatureData(f, targetUrl),
      }));

      if (format === "combined") {
        // Generate a single combined test file
        const combinedCode = generateCombinedTestFile(
          features[0].project ? "Probato Project" : "Project",
          targetUrl,
          featureData
        );

        return NextResponse.json({
          generated: true,
          format: "combined",
          code: combinedCode,
          featureCount: features.length,
          totalSelectors: featureData.reduce((sum, f) => sum + f.suggestedActions.length, 0),
        });
      }

      // Generate individual test cases
      const suite = generateTestSuite("Project", targetUrl, featureData);

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

      return NextResponse.json({
        generated: true,
        format: "suite",
        suite: {
          ...suite,
          testCases: suite.testCases.map((tc) => ({
            name: tc.name,
            featureName: tc.featureName,
            description: tc.description,
            selectors: tc.selectors,
            url: tc.url,
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
    console.error("[Generate] Failed:", message);
    return NextResponse.json({ error: "Test generation failed", details: message }, { status: 500 });
  }
}

// ── Helper ──────────────────────────────────────────────────────

function buildActionsFromFeatureData(
  feature: { name: string; type: string; selector?: string | null; route?: string | null },
  url: string
) {
  // Dynamic import to avoid circular dependency
  const { sel: s, actions: a } = require("@/lib/agent/actions");

  switch (feature.type) {
    case "form":
      return [
        a.navigate(url, `Navigate to form`),
        a.waitForSelector(s.css(feature.selector ?? "form"), 5000, "Wait for form"),
        a.screenshot(false, "Form loaded"),
        a.assertVisible(s.css(feature.selector ?? "form"), "Verify form is visible"),
      ];
    case "navigation":
      return [
        a.navigate(url, `Navigate to page`),
        a.waitForSelector(s.css("nav, [role=navigation]"), 5000, "Wait for navigation"),
        a.assertVisible(s.css("nav, [role=navigation]"), "Verify navigation is visible"),
        a.screenshot(false, "Navigation check"),
      ];
    case "page":
      return [
        a.navigate(feature.route ?? url, `Navigate to ${feature.name}`),
        a.waitForSelector(s.css("body"), 5000, "Wait for page"),
        a.screenshot(false, "Page loaded"),
      ];
    default:
      return [
        a.navigate(url, `Navigate to page`),
        a.waitForSelector(s.css("body"), 5000, "Wait for page"),
        ...(feature.selector
          ? [a.assertVisible(s.css(feature.selector), `Verify ${feature.name} is visible`)]
          : []),
        a.screenshot(false, "Basic check"),
      ];
  }
}
