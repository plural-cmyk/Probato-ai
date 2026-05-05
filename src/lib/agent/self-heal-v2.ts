/**
 * Probato Self-Healing Tests v2 Agent
 *
 * Extends the Phase 1 auto-heal engine with:
 * - Selector repair with confidence-based auto-apply
 * - Project-wide maintenance scanning (deprecation, assertion drift, step staleness, code quality)
 * - Auto-repair for pending selector fixes above a confidence threshold
 * - Deprecation detection for known Playwright API patterns
 *
 * M30: Self-Healing Tests v2 & Auto-Maintenance
 */

import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────

export interface SelectorRepairResult {
  id: string;
  testCaseId: string;
  oldSelector: string;
  newSelector: string;
  confidence: number;
  status: string;
}

export interface AutoRepairResult {
  repaired: number;
  pending: number;
}

// ── Known Deprecation Patterns ─────────────────────────────────────

interface DeprecationPattern {
  pattern: RegExp;
  replacement: string;
  severity: "critical" | "warning" | "info";
  description: string;
}

const DEPRECATION_PATTERNS: DeprecationPattern[] = [
  {
    pattern: /page\.waitFor\(\s*\d+\s*\)/g,
    replacement: "page.waitForTimeout()",
    severity: "critical",
    description: "page.waitFor(timeout) is deprecated — use page.waitForTimeout(timeout) in newer Playwright",
  },
  {
    pattern: /page\.waitForNavigation\(/g,
    replacement: "await expect(page).toHaveURL()",
    severity: "warning",
    description: "page.waitForNavigation() is fragile — use await expect(page).toHaveURL() instead",
  },
  {
    pattern: /page\.\$\(/g,
    replacement: "page.locator()",
    severity: "warning",
    description: "page.$() is discouraged — use page.locator() for auto-waiting and retryability",
  },
  {
    pattern: /page\.\$\$\(/g,
    replacement: "page.locator().all()",
    severity: "warning",
    description: "page.$$() is discouraged — use page.locator().all() for multiple element selection",
  },
  {
    pattern: />\s*>/g,
    replacement: " >> ",
    severity: "info",
    description: "CSS selectors with >> chaining should use locator chaining for better maintainability",
  },
];

// ── repairSelector ──────────────────────────────────────────────────

/**
 * Create a selector repair record. If confidence >= 0.85, auto-apply
 * the repair by updating the TestCase and marking the repair as applied.
 */
export async function repairSelector(
  testCaseId: string,
  oldSelector: string,
  newSelector: string,
  confidence: number
): Promise<SelectorRepairResult> {
  // Create the repair record as pending
  const repair = await db.selectorRepair.create({
    data: {
      testCaseId,
      oldSelector,
      newSelector,
      confidence,
      status: "pending",
    },
  });

  // If high confidence, auto-apply
  if (confidence >= 0.85) {
    await db.$transaction([
      // Update the test case selector
      db.testCase.update({
        where: { id: testCaseId },
        data: {
          selector: newSelector,
          autoHealed: true,
        },
      }),
      // Mark repair as applied
      db.selectorRepair.update({
        where: { id: repair.id },
        data: {
          status: "applied",
          appliedAt: new Date(),
        },
      }),
    ]);
  }

  // Return the (possibly updated) repair record
  const finalRepair = await db.selectorRepair.findUnique({
    where: { id: repair.id },
  });

  return {
    id: finalRepair!.id,
    testCaseId: finalRepair!.testCaseId,
    oldSelector: finalRepair!.oldSelector,
    newSelector: finalRepair!.newSelector,
    confidence: finalRepair!.confidence,
    status: finalRepair!.status,
  };
}

// ── scanMaintenance ──────────────────────────────────────────────────

/**
 * Scan all test cases in a project for maintenance issues across 4 categories:
 * - deprecation: deprecated API patterns in test code
 * - assertion_drift: assertion values drifting from actual results
 * - step_staleness: selectors/features that no longer exist
 * - code_quality: duplicates, overly complex assertions, unused imports
 */
export async function scanMaintenance(
  projectId: string
): Promise<typeof records> {
  const records: Array<{
    id: string;
    projectId: string;
    testCaseId: string | null;
    category: string;
    severity: string;
    title: string;
    description: string;
    suggestedDiff: string | null;
    effort: number;
    status: string;
  }> = [];

  // Get all test cases for the project
  const testCases = await db.testCase.findMany({
    where: {
      feature: { projectId },
    },
    include: {
      feature: true,
    },
  });

  // Get features for staleness checks
  const features = await db.feature.findMany({
    where: { projectId },
  });

  // Get recent test run results for assertion drift
  const recentTestRuns = await db.testRun.findMany({
    where: {
      projectId,
      status: { in: ["passed", "failed"] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      results: {
        where: { status: { in: ["passed", "failed"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  for (const testCase of testCases) {
    const code = testCase.code ?? "";

    // ─── Deprecation Check ───────────────────────────────────────
    for (const dep of DEPRECATION_PATTERNS) {
      if (dep.pattern.test(code)) {
        // Reset regex lastIndex
        dep.pattern.lastIndex = 0;
        const matches = code.match(dep.pattern);
        if (matches && matches.length > 0) {
          const suggestedDiff = `--- a/${testCase.name}\n+++ b/${testCase.name}\n@@ @@\n-${matches[0]}\n+${dep.replacement}`;

          const record = await db.testMaintenanceRecord.create({
            data: {
              projectId,
              testCaseId: testCase.id,
              category: "deprecation",
              severity: dep.severity,
              title: `Deprecated API: ${matches[0].substring(0, 60)}`,
              description: dep.description,
              suggestedDiff,
              effort: dep.severity === "critical" ? 2 : 1,
              status: "open",
            },
          });
          records.push(record);
        }
      }
      // Reset regex lastIndex for next iteration
      dep.pattern.lastIndex = 0;
    }

    // ─── Assertion Drift Check ───────────────────────────────────
    if (recentTestRuns.length > 0) {
      // Look for assertion patterns in code
      const assertionMatches = code.match(/expect\([^)]+\)\.(?:to|not\.)?\w+\([^)]*\)/g);
      if (assertionMatches && assertionMatches.length > 0) {
        // Check recent test results for this feature
        const featureResults = recentTestRuns.flatMap((run) =>
          run.results.filter((r) => r.featureName === testCase.feature.name && r.status === "failed")
        );

        if (featureResults.length > 0) {
          // More than 30% recent failures suggests assertion drift
          const totalForFeature = recentTestRuns.flatMap((run) =>
            run.results.filter((r) => r.featureName === testCase.feature.name)
          ).length;
          const failRate = totalForFeature > 0 ? featureResults.length / totalForFeature : 0;

          if (failRate > 0.3) {
            const record = await db.testMaintenanceRecord.create({
              data: {
                projectId,
                testCaseId: testCase.id,
                category: "assertion_drift",
                severity: "warning",
                title: `Assertion drift detected in ${testCase.name}`,
                description: `${Math.round(failRate * 100)}% of recent runs for this test have failed. Assertion values may have drifted from actual behavior. Recent error: ${featureResults[0]?.error ?? "N/A"}`,
                suggestedDiff: null,
                effort: 3,
                status: "open",
              },
            });
            records.push(record);
          }
        }
      }
    }

    // ─── Step Staleness Check ────────────────────────────────────
    if (testCase.selector) {
      // Check if the feature still exists and has matching selectors
      const featureSelectors = features
        .filter((f) => f.selector)
        .map((f) => f.selector);

      // Check if test references a selector from a feature that no longer exists
      const testCaseFeature = features.find((f) => f.id === testCase.featureId);
      if (!testCaseFeature) {
        // Feature was deleted but test case still references it
        const record = await db.testMaintenanceRecord.create({
          data: {
            projectId,
            testCaseId: testCase.id,
            category: "step_staleness",
            severity: "critical",
            title: `Stale test: feature no longer exists`,
            description: `Test case "${testCase.name}" references a feature that has been deleted. This test should be updated or removed.`,
            suggestedDiff: null,
            effort: 2,
            status: "open",
          },
        });
        records.push(record);
      } else if (testCaseFeature.selector && testCase.selector !== testCaseFeature.selector) {
        // Selector mismatch - test selector doesn't match feature selector
        const record = await db.testMaintenanceRecord.create({
          data: {
            projectId,
            testCaseId: testCase.id,
            category: "step_staleness",
            severity: "warning",
            title: `Selector mismatch with feature`,
            description: `Test case "${testCase.name}" uses selector "${testCase.selector}" but the feature "${testCaseFeature.name}" now uses "${testCaseFeature.selector}". The test may be targeting the wrong element.`,
            suggestedDiff: `--- a/${testCase.name}\n+++ b/${testCase.name}\n@@ @@\n-${testCase.selector}\n+${testCaseFeature.selector}`,
            effort: 2,
            status: "open",
          },
        });
        records.push(record);
      }
    }

    // ─── Code Quality Check ──────────────────────────────────────
    // Check for duplicate test case names
    const duplicates = testCases.filter(
      (tc) => tc.name === testCase.name && tc.id !== testCase.id
    );
    if (duplicates.length > 0 && !records.some((r) => r.testCaseId === testCase.id && r.category === "code_quality")) {
      const record = await db.testMaintenanceRecord.create({
        data: {
          projectId,
          testCaseId: testCase.id,
          category: "code_quality",
          severity: "info",
          title: `Duplicate test case name: ${testCase.name}`,
          description: `Multiple test cases share the name "${testCase.name}". This can cause confusion and may indicate redundant tests.`,
          suggestedDiff: null,
          effort: 1,
          status: "open",
        },
      });
      records.push(record);
    }

    // Check for overly complex assertions
    const complexAssertionPattern = /expect[\s\S]*?\.(?:and|or)\s*\(/g;
    if (complexAssertionPattern.test(code)) {
      complexAssertionPattern.lastIndex = 0;
      const record = await db.testMaintenanceRecord.create({
        data: {
          projectId,
          testCaseId: testCase.id,
          category: "code_quality",
          severity: "info",
          title: `Complex assertion in ${testCase.name}`,
          description: `Test case "${testCase.name}" contains complex chained assertions (.and/.or). Consider simplifying for better readability and debugging.`,
          suggestedDiff: null,
          effort: 2,
          status: "open",
        },
      });
      records.push(record);
      complexAssertionPattern.lastIndex = 0;
    }

    // Check for unused imports
    const importMatches = code.match(/import\s+\{([^}]+)\}\s+from\s+['"]@playwright\/test['"]/);
    if (importMatches) {
      const imports = importMatches[1].split(",").map((s) => s.trim());
      for (const imp of imports) {
        const importName = imp.replace(/\s+as\s+\w+/, "").trim();
        if (importName && !code.includes(importName, code.indexOf(importName) + importName.length)) {
          // The import only appears once (in the import statement itself)
          const record = await db.testMaintenanceRecord.create({
            data: {
              projectId,
              testCaseId: testCase.id,
              category: "code_quality",
              severity: "info",
              title: `Unused import: ${importName}`,
              description: `Import "${importName}" from @playwright/test appears to be unused in test case "${testCase.name}".`,
              suggestedDiff: `--- a/${testCase.name}\n+++ b/${testCase.name}\n@@ @@\n-import { ${importName} } from '@playwright/test';\n+// Removed unused import: ${importName}`,
              effort: 1,
              status: "open",
            },
          });
          records.push(record);
        }
      }
    }
  }

  return records;
}

// ── autoRepair ──────────────────────────────────────────────────────

/**
 * Apply all pending selector repairs for a test case where confidence
 * meets or exceeds the threshold. Returns counts of repaired and still-pending.
 */
export async function autoRepair(
  testCaseId: string,
  confidenceThreshold: number = 0.8
): Promise<AutoRepairResult> {
  const pendingRepairs = await db.selectorRepair.findMany({
    where: {
      testCaseId,
      status: "pending",
      confidence: { gte: confidenceThreshold },
    },
    orderBy: { confidence: "desc" },
  });

  let repaired = 0;
  let pending = 0;

  for (const repair of pendingRepairs) {
    try {
      await db.$transaction([
        // Update the test case selector
        db.testCase.update({
          where: { id: testCaseId },
          data: {
            selector: repair.newSelector,
            autoHealed: true,
          },
        }),
        // Mark repair as applied
        db.selectorRepair.update({
          where: { id: repair.id },
          data: {
            status: "applied",
            appliedAt: new Date(),
          },
        }),
      ]);
      repaired++;
    } catch (error) {
      console.error(`[AutoRepair] Failed to apply repair ${repair.id}:`, error);
      pending++;
    }
  }

  // Count remaining pending repairs below threshold
  const remainingPending = await db.selectorRepair.count({
    where: {
      testCaseId,
      status: "pending",
      confidence: { lt: confidenceThreshold },
    },
  });

  pending += remainingPending;

  return { repaired, pending };
}

// ── detectDeprecations ──────────────────────────────────────────────

/**
 * Scan all test code in a project for known deprecation patterns.
 * Creates TestMaintenanceRecord entries with category "deprecation".
 */
export async function detectDeprecations(
  projectId: string
): Promise<typeof deprecationRecords> {
  const deprecationRecords: Array<{
    id: string;
    projectId: string;
    testCaseId: string | null;
    category: string;
    severity: string;
    title: string;
    description: string;
    suggestedDiff: string | null;
    effort: number;
    status: string;
  }> = [];

  const testCases = await db.testCase.findMany({
    where: {
      feature: { projectId },
    },
    include: {
      feature: true,
    },
  });

  for (const testCase of testCases) {
    const code = testCase.code ?? "";

    for (const dep of DEPRECATION_PATTERNS) {
      // Reset regex state
      dep.pattern.lastIndex = 0;

      if (dep.pattern.test(code)) {
        dep.pattern.lastIndex = 0;
        const matches = code.match(dep.pattern);
        if (matches && matches.length > 0) {
          // Check if this deprecation already recorded
          const existing = await db.testMaintenanceRecord.findFirst({
            where: {
              projectId,
              testCaseId: testCase.id,
              category: "deprecation",
              title: { contains: matches[0].substring(0, 30) },
              status: { notIn: ["dismissed", "resolved"] },
            },
          });

          if (!existing) {
            const suggestedDiff = `--- a/${testCase.name}\n+++ b/${testCase.name}\n@@ @@\n-${matches[0]}\n+${dep.replacement}`;

            const record = await db.testMaintenanceRecord.create({
              data: {
                projectId,
                testCaseId: testCase.id,
                category: "deprecation",
                severity: dep.severity,
                title: `Deprecated API: ${matches[0].substring(0, 60)}`,
                description: `${dep.description} Found in test case "${testCase.name}" (${testCase.feature.name}).`,
                suggestedDiff,
                effort: dep.severity === "critical" ? 2 : 1,
                status: "open",
              },
            });
            deprecationRecords.push(record);
          }
        }
      }
      // Reset for next test case
      dep.pattern.lastIndex = 0;
    }
  }

  return deprecationRecords;
}
