import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/dashboard/intelligence ─ Test Intelligence Analytics ──
//
// Returns comprehensive analytics for the Test Intelligence Dashboard:
//   - healthScore: composite 0-100 health metric
//   - passRateTrend: daily pass rate over last 14 days
//   - flakyTests: tests with intermittent pass/fail patterns
//   - failureClusters: grouped failure reasons
//   - autoHealAnalytics: auto-heal success rate & stats
//   - slowestTests: top 10 slowest test results
//   - riskScores: per-feature risk assessment
//   - durationTrend: average duration over last 14 days
//   - securityA11yTrend: security & accessibility scores over time
//   - recommendations: AI-generated actionable insights

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const days = parseInt(url.searchParams.get("days") ?? "14", 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // ── Base filter ──
    const projectFilter = projectId
      ? { projectId, project: { userId } }
      : { project: { userId } };

    // ── Fetch test runs in range ──
    const testRuns = await db.testRun.findMany({
      where: {
        ...projectFilter,
        startedAt: { gte: since },
        status: { in: ["passed", "failed", "error"] },
      },
      include: {
        results: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: "asc" },
    });

    // ── Fetch all test results in range ──
    const allResults = testRuns.flatMap((run) =>
      run.results.map((r) => ({
        ...r,
        runStatus: run.status,
        runStartedAt: run.startedAt,
        projectName: run.project.name,
        projectId: run.projectId,
      }))
    );

    // ── 1. Health Score ──
    const totalRuns = testRuns.length;
    const passedRuns = testRuns.filter((r) => r.status === "passed").length;
    const failedRuns = testRuns.filter((r) => r.status === "failed").length;
    const errorRuns = testRuns.filter((r) => r.status === "error").length;
    const passRate = totalRuns > 0 ? passedRuns / totalRuns : 0;

    const totalResults = allResults.length;
    const passedResults = allResults.filter((r) => r.status === "passed").length;
    const failedResults = allResults.filter((r) => r.status === "failed").length;

    // Flake penalty: flaky tests reduce health
    const flakyTests = detectFlakyTests(allResults);
    const flakePenalty = Math.min(flakyTests.length * 3, 20); // max 20-point penalty

    // Duration penalty: slow tests reduce health
    const avgDuration = totalResults > 0
      ? allResults.reduce((sum, r) => sum + (r.duration ?? 0), 0) / totalResults
      : 0;
    const durationPenalty = avgDuration > 30000 ? 10 : avgDuration > 15000 ? 5 : 0;

    const healthScore = Math.round(
      Math.max(0, Math.min(100, passRate * 100 - flakePenalty - durationPenalty))
    );

    // ── 2. Pass Rate Trend ──
    const passRateTrend = computeDailyTrend(testRuns, days, (runs) => {
      const total = runs.length;
      const passed = runs.filter((r) => r.status === "passed").length;
      return total > 0 ? Math.round((passed / total) * 100) : null;
    });

    // ── 3. Duration Trend ──
    const durationTrend = computeDailyTrend(testRuns, days, (runs) => {
      const durations = runs
        .filter((r) => r.startedAt && r.endedAt)
        .map((r) => r.endedAt!.getTime() - r.startedAt!.getTime());
      return durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;
    });

    // ── 4. Failure Clusters ──
    const failureClusters = computeFailureClusters(allResults);

    // ── 5. Auto-Heal Analytics ──
    const fixSuggestions = await db.fixSuggestion.findMany({
      where: {
        ...projectFilter,
        createdAt: { gte: since },
      },
      select: {
        id: true,
        type: true,
        status: true,
        confidence: true,
        createdAt: true,
      },
    });

    const totalHeals = fixSuggestions.length;
    const appliedHeals = fixSuggestions.filter(
      (s) => s.status === "applied" || s.status === "approved"
    ).length;
    const rejectedHeals = fixSuggestions.filter((s) => s.status === "rejected").length;
    const pendingHeals = fixSuggestions.filter((s) => s.status === "pending").length;
    const avgConfidence =
      totalHeals > 0
        ? fixSuggestions.reduce((sum, s) => sum + (s.confidence ?? 0), 0) / totalHeals
        : 0;

    const healByType: Record<string, { total: number; applied: number }> = {};
    for (const s of fixSuggestions) {
      const t = s.type ?? "unknown";
      if (!healByType[t]) healByType[t] = { total: 0, applied: 0 };
      healByType[t].total++;
      if (s.status === "applied" || s.status === "approved") healByType[t].applied++;
    }

    const autoHealAnalytics = {
      totalHeals,
      appliedHeals,
      rejectedHeals,
      pendingHeals,
      successRate: totalHeals > 0 ? Math.round((appliedHeals / totalHeals) * 100) : 0,
      avgConfidence: Math.round(avgConfidence),
      byType: healByType,
    };

    // ── 6. Slowest Tests ──
    const slowestTests = [...allResults]
      .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        testName: r.testName,
        featureName: r.featureName,
        duration: r.duration ?? 0,
        status: r.status,
        projectName: r.projectName,
        createdAt: r.createdAt,
      }));

    // ── 7. Risk Scores (from DB or computed) ──
    const featureIds = [...new Set(allResults.map((r) => r.featureName).filter(Boolean))];
    const existingRiskScores = await db.featureRiskScore.findMany({
      where: {
        feature: {
          project: { userId },
          ...(projectId ? { projectId } : {}),
        },
      },
      include: {
        feature: { select: { id: true, name: true, type: true, project: { select: { name: true } } } },
      },
      orderBy: { riskScore: "desc" },
      take: 20,
    });

    // Also compute on-the-fly for features without persisted scores
    const riskScores = existingRiskScores.length > 0
      ? existingRiskScores.map((rs) => ({
          featureId: rs.featureId,
          featureName: rs.feature.name,
          featureType: rs.feature.type,
          projectName: rs.feature.project.name,
          riskScore: rs.riskScore,
          flakeRate: rs.flakeRate,
          failRate: rs.failRate,
          avgDuration: rs.avgDuration,
          lastFailedAt: rs.lastFailedAt,
          autoHealCount: rs.autoHealCount,
          failCluster: rs.failCluster,
        }))
      : computeFeatureRisks(allResults);

    // ── 8. Security & A11y Trend ──
    const securityScans = await db.securityScan.findMany({
      where: {
        ...projectFilter,
        createdAt: { gte: since },
      },
      select: { id: true, score: true, severity: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const a11yAudits = await db.a11yAudit.findMany({
      where: {
        ...projectFilter,
        createdAt: { gte: since },
      },
      select: { id: true, score: true, level: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const securityA11yTrend = {
      security: securityScans.map((s) => ({
        date: s.createdAt.toISOString().split("T")[0],
        score: s.score,
        severity: s.severity,
      })),
      a11y: a11yAudits.map((a) => ({
        date: a.createdAt.toISOString().split("T")[0],
        score: a.score,
        level: a.level,
      })),
    };

    // ── 9. Summary Stats ──
    const totalFeatures = await db.feature.count({
      where: {
        project: { userId },
        ...(projectId ? { projectId } : {}),
      },
    });

    const totalSchedules = await db.schedule.count({
      where: {
        userId,
        ...(projectId ? { projectId } : {}),
      },
    });

    const activeSchedules = await db.schedule.count({
      where: {
        userId,
        enabled: true,
        ...(projectId ? { projectId } : {}),
      },
    });

    // ── 10. Recommendations ──
    const recommendations = generateRecommendations({
      healthScore,
      passRate,
      flakyTests: flakyTests.length,
      failedRuns,
      errorRuns,
      avgDuration,
      autoHealSuccessRate: autoHealAnalytics.successRate,
      pendingHeals,
      highRiskFeatures: riskScores.filter((r) => r.riskScore >= 70).length,
      totalFeatures,
      securityScans: securityScans.length,
      a11yAudits: a11yAudits.length,
    });

    // ── Persist risk scores for features that don't have them yet ──
    await persistRiskScores(riskScores, userId, projectId).catch(() => {
      // Non-blocking: don't fail the request if persistence fails
    });

    return NextResponse.json({
      healthScore,
      summary: {
        totalRuns,
        passedRuns,
        failedRuns,
        errorRuns,
        passRate: Math.round(passRate * 100),
        totalResults,
        passedResults,
        failedResults,
        avgDuration: Math.round(avgDuration),
        totalFeatures,
        totalSchedules,
        activeSchedules,
      },
      passRateTrend,
      durationTrend,
      flakyTests,
      failureClusters,
      autoHealAnalytics,
      slowestTests,
      riskScores,
      securityA11yTrend,
      recommendations,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Intelligence API] GET failed:", message);
    return NextResponse.json(
      { error: "Failed to load intelligence data", details: message },
      { status: 500 }
    );
  }
}

// ── Helper: Detect Flaky Tests ──────────────────────────────────

interface ResultWithMeta {
  testName: string;
  featureName: string | null;
  status: string;
  duration: number | null;
  error: string | null;
  createdAt: Date;
  runStatus: string;
  runStartedAt: Date | null;
  projectName: string;
  projectId: string;
}

function detectFlakyTests(results: ResultWithMeta[]) {
  // Group by testName
  const byTest = new Map<string, ResultWithMeta[]>();
  for (const r of results) {
    const key = r.testName || r.featureName || "unknown";
    if (!byTest.has(key)) byTest.set(key, []);
    byTest.get(key)!.push(r);
  }

  const flaky: {
    testName: string;
    featureName: string | null;
    passCount: number;
    failCount: number;
    totalRuns: number;
    flakeRate: number;
    recentPattern: string[];
  }[] = [];

  for (const [testName, runs] of byTest) {
    if (runs.length < 3) continue; // Need at least 3 runs to detect flakiness

    const passCount = runs.filter((r) => r.status === "passed").length;
    const failCount = runs.filter((r) => r.status === "failed" || r.status === "error").length;
    const totalRuns = runs.length;

    // A test is flaky if it has both passes and failures and neither is < 10%
    if (passCount > 0 && failCount > 0 && passCount / totalRuns > 0.1 && failCount / totalRuns > 0.1) {
      const flakeRate = failCount / totalRuns;
      const recentPattern = runs
        .slice(-8)
        .map((r) => (r.status === "passed" ? "P" : r.status === "failed" ? "F" : "E"));

      flaky.push({
        testName,
        featureName: runs[0].featureName,
        passCount,
        failCount,
        totalRuns,
        flakeRate: Math.round(flakeRate * 100) / 100,
        recentPattern,
      });
    }
  }

  return flaky.sort((a, b) => b.flakeRate - a.flakeRate).slice(0, 15);
}

// ── Helper: Compute Failure Clusters ────────────────────────────

function computeFailureClusters(results: ResultWithMeta[]) {
  const failedResults = results.filter(
    (r) => r.status === "failed" || r.status === "error"
  );

  const clusters: Record<string, { count: number; examples: string[]; featureNames: Set<string> }> = {};

  for (const r of failedResults) {
    let category = "unknown";

    if (r.error) {
      const err = r.error.toLowerCase();
      if (err.includes("timeout") || err.includes("timed out") || err.includes("waiting for")) {
        category = "timeout";
      } else if (err.includes("selector") || err.includes("not found") || err.includes("no element") || err.includes("waiting for selector")) {
        category = "selector";
      } else if (err.includes("assert") || err.includes("expected") || err.includes("text mismatch")) {
        category = "assertion";
      } else if (err.includes("navigate") || err.includes("navigation") || err.includes("url")) {
        category = "navigation";
      } else if (err.includes("network") || err.includes("fetch") || err.includes("500") || err.includes("503") || err.includes("connection")) {
        category = "network";
      } else if (err.includes("permission") || err.includes("auth") || err.includes("forbidden") || err.includes("401") || err.includes("403")) {
        category = "auth";
      } else {
        category = "other";
      }
    }

    if (!clusters[category]) {
      clusters[category] = { count: 0, examples: [], featureNames: new Set() };
    }
    clusters[category].count++;
    if (clusters[category].examples.length < 3) {
      clusters[category].examples.push(r.error?.slice(0, 120) ?? "No error message");
    }
    if (r.featureName) clusters[category].featureNames.add(r.featureName);
  }

  return Object.entries(clusters)
    .map(([category, data]) => ({
      category,
      count: data.count,
      examples: data.examples,
      affectedFeatures: [...data.featureNames].length,
    }))
    .sort((a, b) => b.count - a.count);
}

// ── Helper: Compute Feature Risks ──────────────────────────────

function computeFeatureRisks(results: ResultWithMeta[]) {
  const byFeature = new Map<string, ResultWithMeta[]>();
  for (const r of results) {
    const key = r.featureName || r.testName || "unknown";
    if (!byFeature.has(key)) byFeature.set(key, []);
    byFeature.get(key)!.push(r);
  }

  const risks: {
    featureId: string;
    featureName: string;
    featureType: string;
    projectName: string;
    riskScore: number;
    flakeRate: number;
    failRate: number;
    avgDuration: number;
    lastFailedAt: Date | null;
    autoHealCount: number;
    failCluster: string | null;
  }[] = [];

  for (const [featureName, runs] of byFeature) {
    const total = runs.length;
    const fails = runs.filter((r) => r.status === "failed" || r.status === "error").length;
    const passes = runs.filter((r) => r.status === "passed").length;
    const failRate = total > 0 ? fails / total : 0;

    // Flake rate: proportion of intermittent failures
    const isFlaky = passes > 0 && fails > 0 && passes / total > 0.1 && fails / total > 0.1;
    const flakeRate = isFlaky ? fails / total : 0;

    // Duration factor
    const avgDuration = total > 0
      ? runs.reduce((sum, r) => sum + (r.duration ?? 0), 0) / total
      : 0;

    // Compute composite risk score (0-100)
    let riskScore = 0;
    riskScore += failRate * 50; // up to 50 points for failure rate
    riskScore += flakeRate * 25; // up to 25 points for flake rate
    riskScore += avgDuration > 30000 ? 15 : avgDuration > 15000 ? 10 : avgDuration > 8000 ? 5 : 0;
    riskScore = Math.min(100, Math.round(riskScore));

    const lastFail = runs
      .filter((r) => r.status === "failed" || r.status === "error")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    risks.push({
      featureId: "",
      featureName,
      featureType: runs[0]?.featureName ? "discovered" : "test",
      projectName: runs[0]?.projectName ?? "",
      riskScore,
      flakeRate: Math.round(flakeRate * 100) / 100,
      failRate: Math.round(failRate * 100) / 100,
      avgDuration: Math.round(avgDuration),
      lastFailedAt: lastFail?.createdAt ?? null,
      autoHealCount: 0,
      failCluster: null,
    });
  }

  return risks.sort((a, b) => b.riskScore - a.riskScore).slice(0, 20);
}

// ── Helper: Daily Trend Computation ────────────────────────────

function computeDailyTrend<T>(
  items: (T & { startedAt: Date | null })[],
  days: number,
  compute: (items: (T & { startedAt: Date | null })[]) => number | null
): { date: string; value: number | null }[] {
  const buckets = new Map<string, (T & { startedAt: Date | null })[]>();

  // Initialize all days
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    buckets.set(key, []);
  }

  // Fill buckets
  for (const item of items) {
    if (item.startedAt) {
      const key = item.startedAt.toISOString().split("T")[0];
      if (buckets.has(key)) {
        buckets.get(key)!.push(item);
      }
    }
  }

  return [...buckets.entries()].map(([date, items]) => ({
    date,
    value: compute(items),
  }));
}

// ── Helper: Generate Recommendations ───────────────────────────

function generateRecommendations(data: {
  healthScore: number;
  passRate: number;
  flakyTests: number;
  failedRuns: number;
  errorRuns: number;
  avgDuration: number;
  autoHealSuccessRate: number;
  pendingHeals: number;
  highRiskFeatures: number;
  totalFeatures: number;
  securityScans: number;
  a11yAudits: number;
}): {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  action: string;
  category: string;
}[] {
  const recs: {
    id: string;
    priority: "critical" | "high" | "medium" | "low";
    title: string;
    description: string;
    action: string;
    category: string;
  }[] = [];

  if (data.healthScore < 50) {
    recs.push({
      id: "low-health",
      priority: "critical",
      title: "Test health is critically low",
      description: `Your test health score is ${data.healthScore}/100. Focus on fixing the most common failure patterns to improve reliability.`,
      action: "Review failure clusters",
      category: "health",
    });
  }

  if (data.flakyTests > 0) {
    recs.push({
      id: "flaky-tests",
      priority: "high",
      title: `${data.flakyTests} flaky test${data.flakyTests > 1 ? "s" : ""} detected`,
      description: `Flaky tests undermine confidence in your test suite. Consider adding retries, improving selectors, or quarantining these tests.`,
      action: "View flaky tests",
      category: "flake",
    });
  }

  if (data.pendingHeals > 0) {
    recs.push({
      id: "pending-heals",
      priority: "high",
      title: `${data.pendingHeals} auto-heal suggestion${data.pendingHeals > 1 ? "s" : ""} pending review`,
      description: `Review and apply auto-heal suggestions to fix broken selectors and improve test stability.`,
      action: "Review suggestions",
      category: "autoheal",
    });
  }

  if (data.highRiskFeatures > 0) {
    recs.push({
      id: "high-risk",
      priority: "medium",
      title: `${data.highRiskFeatures} high-risk feature${data.highRiskFeatures > 1 ? "s" : ""} identified`,
      description: "These features have high failure rates, flakiness, or slow execution. Prioritize manual review and refactoring.",
      action: "View risk scores",
      category: "risk",
    });
  }

  if (data.avgDuration > 20000) {
    recs.push({
      id: "slow-tests",
      priority: "medium",
      title: "Average test duration is high",
      description: `Tests average ${Math.round(data.avgDuration / 1000)}s. Consider optimizing slow tests or running them in parallel.`,
      action: "View slowest tests",
      category: "performance",
    });
  }

  if (data.securityScans === 0 && data.totalFeatures > 0) {
    recs.push({
      id: "no-security",
      priority: "medium",
      title: "No security scans yet",
      description: "Run your first security scan to identify vulnerabilities like XSS, CSRF, and injection attacks.",
      action: "Run security scan",
      category: "security",
    });
  }

  if (data.a11yAudits === 0 && data.totalFeatures > 0) {
    recs.push({
      id: "no-a11y",
      priority: "low",
      title: "No accessibility audits yet",
      description: "Run an accessibility audit to ensure your application meets WCAG standards.",
      action: "Run a11y audit",
      category: "a11y",
    });
  }

  if (data.autoHealSuccessRate > 0 && data.autoHealSuccessRate < 60) {
    recs.push({
      id: "low-heal-rate",
      priority: "medium",
      title: "Auto-heal success rate is low",
      description: `Only ${data.autoHealSuccessRate}% of auto-heal suggestions are being applied. Review rejected suggestions to improve the system.`,
      action: "Review auto-heal",
      category: "autoheal",
    });
  }

  if (data.errorRuns > data.failedRuns && data.errorRuns > 2) {
    recs.push({
      id: "infrastructure-errors",
      priority: "critical",
      title: "Infrastructure errors detected",
      description: `${data.errorRuns} test runs failed with infrastructure errors (not test failures). Check browser availability, network connectivity, and deployment health.`,
      action: "Check browser status",
      category: "infrastructure",
    });
  }

  return recs.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// ── Helper: Persist Risk Scores ─────────────────────────────────

async function persistRiskScores(
  riskScores: {
    featureId: string;
    featureName: string;
    riskScore: number;
    flakeRate: number;
    failRate: number;
    avgDuration: number;
    lastFailedAt: Date | null;
    autoHealCount: number;
    failCluster: string | null;
  }[],
  userId: string,
  projectId: string | null
) {
  // Only persist for features that have a known featureId (from DB)
  const withFeatureId = riskScores.filter((r) => r.featureId);
  if (withFeatureId.length === 0) return;

  for (const rs of withFeatureId) {
    await db.featureRiskScore.upsert({
      where: { featureId: rs.featureId },
      create: {
        featureId: rs.featureId,
        riskScore: rs.riskScore,
        flakeRate: rs.flakeRate,
        failRate: rs.failRate,
        avgDuration: rs.avgDuration,
        lastFailedAt: rs.lastFailedAt,
        autoHealCount: rs.autoHealCount,
        failCluster: rs.failCluster,
        computedAt: new Date(),
      },
      update: {
        riskScore: rs.riskScore,
        flakeRate: rs.flakeRate,
        failRate: rs.failRate,
        avgDuration: rs.avgDuration,
        lastFailedAt: rs.lastFailedAt,
        autoHealCount: rs.autoHealCount,
        failCluster: rs.failCluster,
        computedAt: new Date(),
      },
    });
  }
}
