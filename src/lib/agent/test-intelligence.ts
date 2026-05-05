/**
 * M29: Test Intelligence Agent
 *
 * Core intelligence engine for dependency graph building,
 * smart test selection, flakiness analysis, and impact prioritization.
 */

import { db } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────

interface DependencyEdge {
  testCaseId: string;
  sourcePath: string;
  functionName: string | null;
  dependencyType: string;
  confidence: number;
}

interface PriorityEntry {
  testCaseId: string;
  priorityScore: number;
  reason: string;
  category: string;
}

// ── Dependency Graph Builder ─────────────────────────────────────

/**
 * Build a dependency graph for all test cases in a project.
 * Analyzes Playwright test code to detect imports, navigations,
 * API calls, and render dependencies.
 */
export async function buildDependencyGraph(
  projectId: string
): Promise<{ edges: number; tests: number }> {
  // Find all features for the project, then their test cases
  const features = await db.feature.findMany({
    where: { projectId },
    include: { testCases: true },
  });

  const testCases = features.flatMap((f) => f.testCases);
  let edgesCreated = 0;

  for (const testCase of testCases) {
    const dependencies = analyzeTestCode(testCase.code);

    for (const dep of dependencies) {
      await db.testDependencyGraph.upsert({
        where: {
          testCaseId_sourcePath_functionName_dependencyType: {
            testCaseId: testCase.id,
            sourcePath: dep.sourcePath,
            functionName: dep.functionName ?? "",
            dependencyType: dep.dependencyType,
          },
        },
        create: {
          testCaseId: testCase.id,
          projectId,
          sourcePath: dep.sourcePath,
          functionName: dep.functionName,
          dependencyType: dep.dependencyType,
          confidence: dep.confidence,
          lastVerifiedAt: new Date(),
        },
        update: {
          confidence: dep.confidence,
          lastVerifiedAt: new Date(),
        },
      });
      edgesCreated++;
    }
  }

  return { edges: edgesCreated, tests: testCases.length };
}

/**
 * Analyze Playwright test code to extract dependency edges.
 * Pattern-matches for:
 * - import statements → dependencyType: "import"
 * - page.goto('/...') or page.navigate → dependencyType: "navigate"
 * - page.route('...') or API fetch calls → dependencyType: "api_call"
 * - data-testid= references → dependencyType: "render"
 */
function analyzeTestCode(code: string): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const lines = code.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Match import statements: import ... from '...' or import ... from "..."
    const importMatch = trimmed.match(
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/
    );
    if (importMatch) {
      const sourcePath = importMatch[1];
      // Skip node_modules / external packages (don't start with . or /)
      if (sourcePath.startsWith(".") || sourcePath.startsWith("/")) {
        edges.push({
          testCaseId: "", // Will be filled by caller
          sourcePath,
          functionName: null,
          dependencyType: "import",
          confidence: 0.9,
        });
      }
      continue;
    }

    // Match page.goto('/...') or page.navigate('/...')
    const gotoMatch = trimmed.match(
      /page\.goto\(\s*['"]([^'"]+)['"]/
    );
    if (gotoMatch) {
      edges.push({
        testCaseId: "",
        sourcePath: gotoMatch[1],
        functionName: null,
        dependencyType: "navigate",
        confidence: 0.95,
      });
      continue;
    }

    const navigateMatch = trimmed.match(
      /page\.navigate\(\s*['"]([^'"]+)['"]/
    );
    if (navigateMatch) {
      edges.push({
        testCaseId: "",
        sourcePath: navigateMatch[1],
        functionName: null,
        dependencyType: "navigate",
        confidence: 0.9,
      });
      continue;
    }

    // Match page.route('...') or API fetch calls
    const routeMatch = trimmed.match(
      /page\.route\(\s*['"]([^'"]+)['"]/
    );
    if (routeMatch) {
      edges.push({
        testCaseId: "",
        sourcePath: routeMatch[1],
        functionName: null,
        dependencyType: "api_call",
        confidence: 0.85,
      });
      continue;
    }

    // Match fetch('/...') or fetch("...")
    const fetchMatch = trimmed.match(
      /fetch\(\s*['"]([^'"]+)['"]/
    );
    if (fetchMatch) {
      edges.push({
        testCaseId: "",
        sourcePath: fetchMatch[1],
        functionName: null,
        dependencyType: "api_call",
        confidence: 0.8,
      });
      continue;
    }

    // Match data-testid= references (render dependency)
    const testIdMatch = trimmed.match(
      /data-testid\s*=\s*['"]([^'"]+)['"]/
    );
    if (testIdMatch) {
      edges.push({
        testCaseId: "",
        sourcePath: `testid:${testIdMatch[1]}`,
        functionName: testIdMatch[1],
        dependencyType: "render",
        confidence: 0.7,
      });
      continue;
    }

    // Also match getByTestId('...') — another pattern for test IDs
    const getByTestIdMatch = trimmed.match(
      /getByTestId\(\s*['"]([^'"]+)['"]/
    );
    if (getByTestIdMatch) {
      edges.push({
        testCaseId: "",
        sourcePath: `testid:${getByTestIdMatch[1]}`,
        functionName: getByTestIdMatch[1],
        dependencyType: "render",
        confidence: 0.75,
      });
      continue;
    }
  }

  return edges;
}

// ── Smart Test Selection ─────────────────────────────────────────

/**
 * Smart test selection based on changed files.
 * Uses the dependency graph to find tests that are affected
 * by the changed files, then computes coverage percentage.
 */
export async function smartSelectTests(
  projectId: string,
  changedFiles: string[]
): Promise<{
  id: string;
  projectId: string;
  selectedTests: string[];
  skippedTests: string[];
  coveragePercent: number;
  rationale: string;
}> {
  // Get all dependency edges for the project
  const allEdges = await db.testDependencyGraph.findMany({
    where: { projectId },
  });

  // Get all test cases for the project
  const features = await db.feature.findMany({
    where: { projectId },
    include: { testCases: true },
  });
  const allTestCases = features.flatMap((f) => f.testCases);
  const allTestCaseIds = new Set(allTestCases.map((tc) => tc.id));

  // Find test cases directly linked to changed files
  const selectedSet = new Set<string>();

  for (const edge of allEdges) {
    for (const changedFile of changedFiles) {
      // Check if the edge source path matches or is a prefix of a changed file
      if (
        edge.sourcePath === changedFile ||
        changedFile.includes(edge.sourcePath) ||
        edge.sourcePath.includes(changedFile)
      ) {
        selectedSet.add(edge.testCaseId);
      }
    }
  }

  // Transitive closure: find test cases that depend on features whose
  // test cases are already selected (same feature dependency chain)
  const selectedFeatureIds = new Set<string>();
  for (const tc of allTestCases) {
    if (selectedSet.has(tc.id)) {
      selectedFeatureIds.add(tc.featureId);
    }
  }

  // Add test cases from features that have dependencies on affected features
  for (const feature of features) {
    if (feature.dependencies.length > 0) {
      const hasAffectedDep = feature.dependencies.some((depId) =>
        selectedFeatureIds.has(depId)
      );
      if (hasAffectedDep) {
        for (const tc of feature.testCases) {
          selectedSet.add(tc.id);
        }
        selectedFeatureIds.add(feature.id);
      }
    }
  }

  const selectedTests = Array.from(selectedSet);
  const skippedTests = Array.from(allTestCaseIds).filter(
    (id) => !selectedSet.has(id)
  );

  // Compute coverage percentage
  const totalTests = allTestCaseIds.size;
  const coveragePercent =
    totalTests > 0 ? (selectedTests.length / totalTests) * 100 : 0;

  // Generate rationale
  const rationale = `Selected ${selectedTests.length} of ${totalTests} tests based on ${changedFiles.length} changed files. Coverage: ${coveragePercent.toFixed(1)}%. ${selectedTests.length === 0 ? "No tests directly linked to changed files found." : "Tests selected via dependency graph matching and transitive feature dependencies."}`;

  // Store the result
  const result = await db.smartSelectionResult.create({
    data: {
      projectId,
      triggeringFiles: changedFiles,
      selectedTests,
      skippedTests,
      rationale,
      coveragePercent,
    },
  });

  return {
    id: result.id,
    projectId: result.projectId,
    selectedTests,
    skippedTests,
    coveragePercent,
    rationale,
  };
}

// ── Flakiness Analysis ───────────────────────────────────────────

/**
 * Analyze flakiness for all test cases in a project.
 * Computes flakiness scores based on pass/fail variance in
 * test result history, classifies tests, and generates alerts
 * for newly flaky or worsening tests.
 */
export async function analyzeFlakiness(
  projectId: string
): Promise<
  Array<{
    id: string;
    testCaseId: string;
    flakinessScore: number;
    classification: string;
    primaryIndicator: string | null;
    confidence: number;
  }>
> {
  // Get all features and test cases for the project
  const features = await db.feature.findMany({
    where: { projectId },
    include: { testCases: true },
  });

  const testCases = features.flatMap((f) => f.testCases);

  // Get all test runs for the project
  const testRuns = await db.testRun.findMany({
    where: { projectId },
    include: { results: true },
    orderBy: { createdAt: "desc" },
  });

  // Build a map of test results by test name → status history
  const testResultHistory = new Map<
    string,
    Array<{ status: string; error: string | null; createdAt: Date }>
  >();

  for (const run of testRuns) {
    for (const result of run.results) {
      if (!testResultHistory.has(result.testName)) {
        testResultHistory.set(result.testName, []);
      }
      testResultHistory.get(result.testName)!.push({
        status: result.status,
        error: result.error,
        createdAt: result.createdAt,
      });
    }
  }

  const reports: Array<{
    id: string;
    testCaseId: string;
    flakinessScore: number;
    classification: string;
    primaryIndicator: string | null;
    confidence: number;
  }> = [];

  for (const testCase of testCases) {
    // Match test case to results by name
    const history = testResultHistory.get(testCase.name) ?? [];

    if (history.length < 3) {
      // Not enough data — classify as unknown
      const report = await db.flakinessReport.upsert({
        where: { testCaseId: testCase.id },
        create: {
          testCaseId: testCase.id,
          flakinessScore: 0,
          classification: "unknown",
          primaryIndicator: null,
          confidence: 0,
          recentOutcomes: history.map((h) => h.status),
        },
        update: {
          flakinessScore: 0,
          classification: "unknown",
          primaryIndicator: null,
          confidence: 0,
          recentOutcomes: history.map((h) => h.status),
          lastAnalyzedAt: new Date(),
        },
      });

      reports.push({
        id: report.id,
        testCaseId: testCase.id,
        flakinessScore: 0,
        classification: "unknown",
        primaryIndicator: null,
        confidence: 0,
      });
      continue;
    }

    // Take last 10 results for analysis
    const recentHistory = history.slice(0, 10);
    const outcomes = recentHistory.map((h) => h.status);

    // Compute flakiness score
    const passCount = outcomes.filter((s) => s === "passed").length;
    const failCount = outcomes.filter(
      (s) => s === "failed" || s === "error"
    ).length;
    const total = outcomes.length;

    // Flakiness is based on pass/fail variance (alternating results = flaky)
    let switches = 0;
    for (let i = 1; i < outcomes.length; i++) {
      const prevPassed = outcomes[i - 1] === "passed";
      const currPassed = outcomes[i] === "passed";
      if (prevPassed !== currPassed) switches++;
    }

    const switchRate = switches / Math.max(1, outcomes.length - 1);
    const failRate = failCount / total;

    // Score: 0-20 = stable, 21-60 = flaky, 61-100 with high fail rate = failing
    let flakinessScore: number;
    if (failRate > 0.7) {
      // Consistently failing → high score
      flakinessScore = Math.round(60 + failRate * 40);
    } else {
      // Mix of pass/fail → flakiness based on variance
      flakinessScore = Math.round(switchRate * 80 + failRate * 20);
    }

    flakinessScore = Math.min(100, Math.max(0, flakinessScore));

    // Classification
    let classification: string;
    if (flakinessScore <= 20) {
      classification = "stable";
    } else if (flakinessScore <= 60) {
      classification = "flaky";
    } else {
      classification = "failing";
    }

    // Detect primary indicator from error patterns
    const errorMessages = recentHistory
      .filter((h) => h.error)
      .map((h) => h.error!.toLowerCase());

    let primaryIndicator: string | null = null;
    if (errorMessages.length > 0) {
      const allErrors = errorMessages.join(" ");
      if (allErrors.includes("timeout")) {
        primaryIndicator = "timing";
      } else if (
        allErrors.includes("order") ||
        allErrors.includes("sequence")
      ) {
        primaryIndicator = "order_dependency";
      } else if (allErrors.includes("resource")) {
        primaryIndicator = "resource_contention";
      } else {
        primaryIndicator = "external_dependency";
      }
    }

    // Confidence based on sample size
    const confidence = Math.min(1, total / 10);

    // Get previous report for alert detection
    const previousReport = await db.flakinessReport.findUnique({
      where: { testCaseId: testCase.id },
    });

    // Upsert the report
    const report = await db.flakinessReport.upsert({
      where: { testCaseId: testCase.id },
      create: {
        testCaseId: testCase.id,
        flakinessScore,
        classification,
        primaryIndicator,
        confidence,
        recentOutcomes: outcomes,
      },
      update: {
        flakinessScore,
        classification,
        primaryIndicator,
        confidence,
        recentOutcomes: outcomes,
        lastAnalyzedAt: new Date(),
      },
    });

    // Create alerts for newly flaky tests or score increases > 20
    if (previousReport) {
      const scoreIncrease = flakinessScore - previousReport.flakinessScore;

      if (
        previousReport.classification === "stable" &&
        (classification === "flaky" || classification === "failing")
      ) {
        await db.flakinessAlert.create({
          data: {
            testCaseId: testCase.id,
            flakinessReportId: report.id,
            alertType: "new_flaky",
            message: `Test "${testCase.name}" changed from ${previousReport.classification} to ${classification} (score: ${previousReport.flakinessScore} → ${flakinessScore})`,
            previousScore: previousReport.flakinessScore,
            currentScore: flakinessScore,
          },
        });
      } else if (scoreIncrease > 20) {
        await db.flakinessAlert.create({
          data: {
            testCaseId: testCase.id,
            flakinessReportId: report.id,
            alertType: "score_increase",
            message: `Test "${testCase.name}" flakiness score increased by ${scoreIncrease} points (${previousReport.flakinessScore} → ${flakinessScore})`,
            previousScore: previousReport.flakinessScore,
            currentScore: flakinessScore,
          },
        });
      }
    } else if (classification === "flaky" || classification === "failing") {
      // First report and already flaky/failing
      await db.flakinessAlert.create({
        data: {
          testCaseId: testCase.id,
          flakinessReportId: report.id,
          alertType: "new_flaky",
          message: `Test "${testCase.name}" detected as ${classification} on first analysis (score: ${flakinessScore})`,
          previousScore: null,
          currentScore: flakinessScore,
        },
      });
    }

    reports.push({
      id: report.id,
      testCaseId: testCase.id,
      flakinessScore,
      classification,
      primaryIndicator,
      confidence,
    });
  }

  return reports;
}

// ── Impact Prioritization ────────────────────────────────────────

/**
 * Prioritize tests based on combined signals:
 * - Dependency graph matches (weight: 0.4)
 * - Feature risk scores (weight: 0.35)
 * - Flakiness reports (weight: 0.25)
 *
 * Categories: critical (>= 80), high (>= 60), medium (>= 40), low (< 40)
 */
export async function prioritizeTests(
  projectId: string,
  changedFiles: string[]
): Promise<{
  id: string;
  projectId: string;
  priorityOrder: PriorityEntry[];
  totalAffected: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}> {
  // Get all test cases for the project
  const features = await db.feature.findMany({
    where: { projectId },
    include: {
      testCases: {
        include: {
          dependencies: true,
          flakinessReport: true,
        },
      },
      riskScore: true,
    },
  });

  const allTestCases = features.flatMap((f) => f.testCases);

  // Get dependency edges for matching
  const depEdges = await db.testDependencyGraph.findMany({
    where: { projectId },
  });

  // Build dependency match scores (0-100 per test case)
  const depMatchScores = new Map<string, number>();
  for (const tc of allTestCases) {
    const tcEdges = depEdges.filter((e) => e.testCaseId === tc.id);
    let matchCount = 0;
    for (const edge of tcEdges) {
      for (const changedFile of changedFiles) {
        if (
          edge.sourcePath === changedFile ||
          changedFile.includes(edge.sourcePath) ||
          edge.sourcePath.includes(changedFile)
        ) {
          matchCount++;
          break; // One match per edge is enough
        }
      }
    }
    const score =
      tcEdges.length > 0 ? (matchCount / tcEdges.length) * 100 : 0;
    depMatchScores.set(tc.id, score);
  }

  // Build risk scores (0-100 per test case from feature risk)
  const riskScores = new Map<string, number>();
  for (const feature of features) {
    const riskScore = feature.riskScore?.riskScore ?? 0;
    for (const tc of feature.testCases) {
      riskScores.set(tc.id, riskScore);
    }
  }

  // Build flakiness scores (0-100 per test case)
  const flakinessScores = new Map<string, number>();
  for (const tc of allTestCases) {
    flakinessScores.set(tc.id, tc.flakinessReport?.flakinessScore ?? 0);
  }

  // Compute combined priority scores
  const DEPENDENCY_WEIGHT = 0.4;
  const RISK_WEIGHT = 0.35;
  const FLAKINESS_WEIGHT = 0.25;

  const priorityEntries: PriorityEntry[] = allTestCases.map((tc) => {
    const depScore = depMatchScores.get(tc.id) ?? 0;
    const riskScore = riskScores.get(tc.id) ?? 0;
    const flakeScore = flakinessScores.get(tc.id) ?? 0;

    const priorityScore =
      depScore * DEPENDENCY_WEIGHT +
      riskScore * RISK_WEIGHT +
      flakeScore * FLAKINESS_WEIGHT;

    const roundedScore = Math.round(Math.min(100, Math.max(0, priorityScore)));

    let category: string;
    if (roundedScore >= 80) {
      category = "critical";
    } else if (roundedScore >= 60) {
      category = "high";
    } else if (roundedScore >= 40) {
      category = "medium";
    } else {
      category = "low";
    }

    // Build reason string
    const reasons: string[] = [];
    if (depScore > 0) reasons.push(`dependency match: ${depScore.toFixed(0)}%`);
    if (riskScore > 0) reasons.push(`risk score: ${riskScore.toFixed(0)}`);
    if (flakeScore > 0) reasons.push(`flakiness: ${flakeScore}`);

    return {
      testCaseId: tc.id,
      priorityScore: roundedScore,
      reason: reasons.length > 0 ? reasons.join(", ") : "no signals detected",
      category,
    };
  });

  // Sort by priority score descending
  priorityEntries.sort((a, b) => b.priorityScore - a.priorityScore);

  // Count categories
  const criticalCount = priorityEntries.filter(
    (e) => e.category === "critical"
  ).length;
  const highCount = priorityEntries.filter(
    (e) => e.category === "high"
  ).length;
  const mediumCount = priorityEntries.filter(
    (e) => e.category === "medium"
  ).length;
  const lowCount = priorityEntries.filter(
    (e) => e.category === "low"
  ).length;

  // Filter to only affected tests (those with any signal > 0)
  const affectedEntries = priorityEntries.filter(
    (e) => e.priorityScore > 0
  );

  // Store the result
  const result = await db.impactAnalysisResult.create({
    data: {
      projectId,
      triggeringFiles: changedFiles,
      priorityOrder: priorityEntries.map((e) => ({
        testCaseId: e.testCaseId,
        priorityScore: e.priorityScore,
        reason: e.reason,
      })),
      totalAffected: affectedEntries.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
    },
  });

  return {
    id: result.id,
    projectId,
    priorityOrder: priorityEntries,
    totalAffected: affectedEntries.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  };
}
