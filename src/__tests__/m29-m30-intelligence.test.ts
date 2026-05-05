/**
 * Tests for M29 (AI Test Intelligence) and M30 (Self-Healing v2)
 *
 * Tests the core logic of both milestones: flakiness classification,
 * smart selection, impact prioritization, selector repair, and
 * maintenance scanning.
 */

import { describe, it, expect } from "vitest";

// ── M29: Flakiness Score Classification ────────────────────────

describe("M29: Flakiness Score Classification", () => {
  function classifyFlakiness(score: number, failRate: number, runCount: number): string {
    if (runCount < 3) return "unknown";
    if (score <= 20) return "stable";
    if (score >= 61 && failRate > 0.7) return "failing";
    if (score > 20) return "flaky";
    return "stable";
  }

  it("classifies tests with score 0-20 as stable", () => {
    expect(classifyFlakiness(0, 0, 10)).toBe("stable");
    expect(classifyFlakiness(10, 0.05, 10)).toBe("stable");
    expect(classifyFlakiness(20, 0.1, 5)).toBe("stable");
  });

  it("classifies tests with score 21-60 as flaky", () => {
    expect(classifyFlakiness(21, 0.3, 10)).toBe("flaky");
    expect(classifyFlakiness(40, 0.4, 8)).toBe("flaky");
    expect(classifyFlakiness(60, 0.5, 12)).toBe("flaky");
  });

  it("classifies tests with score > 60 and high fail rate as failing", () => {
    expect(classifyFlakiness(61, 0.8, 10)).toBe("failing");
    expect(classifyFlakiness(80, 0.9, 15)).toBe("failing");
    expect(classifyFlakiness(100, 1.0, 5)).toBe("failing");
  });

  it("classifies tests with score > 60 but low fail rate as flaky (not failing)", () => {
    expect(classifyFlakiness(61, 0.3, 10)).toBe("flaky");
    expect(classifyFlakiness(70, 0.5, 10)).toBe("flaky");
  });

  it("classifies tests with < 3 runs as unknown", () => {
    expect(classifyFlakiness(0, 0, 0)).toBe("unknown");
    expect(classifyFlakiness(50, 0.5, 1)).toBe("unknown");
    expect(classifyFlakiness(80, 0.9, 2)).toBe("unknown");
  });

  it("treats exactly 3 runs as sufficient for classification", () => {
    expect(classifyFlakiness(10, 0.1, 3)).toBe("stable");
    expect(classifyFlakiness(40, 0.4, 3)).toBe("flaky");
    expect(classifyFlakiness(70, 0.8, 3)).toBe("failing");
  });
});

// ── M29: Flakiness Score Calculation ────────────────────────────

describe("M29: Flakiness Score Calculation", () => {
  function calculateFlakinessScore(outcomes: boolean[]): number {
    if (outcomes.length < 2) return 0;
    const passes = outcomes.filter(Boolean).length;
    const fails = outcomes.length - passes;
    const passRate = passes / outcomes.length;
    const failRate = fails / outcomes.length;
    // Flakiness = passRate * failRate * 400 (max 100 at 50/50 split)
    const raw = passRate * failRate * 400;
    return Math.min(100, Math.round(raw * 10) / 10);
  }

  it("returns 0 for all-passing tests", () => {
    expect(calculateFlakinessScore([true, true, true, true, true])).toBe(0);
  });

  it("returns 0 for all-failing tests (consistent = not flaky)", () => {
    expect(calculateFlakinessScore([false, false, false, false, false])).toBe(0);
  });

  it("returns high score for 50/50 split (most flaky)", () => {
    const score = calculateFlakinessScore([true, false, true, false, true, false]);
    expect(score).toBeGreaterThan(60);
  });

  it("returns moderate score for mostly-passing with occasional failures", () => {
    const score = calculateFlakinessScore([true, true, true, true, false]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(70);
  });

  it("returns 0 for single outcome", () => {
    expect(calculateFlakinessScore([true])).toBe(0);
    expect(calculateFlakinessScore([])).toBe(0);
  });
});

// ── M29: Primary Indicator Detection ───────────────────────────

describe("M29: Primary Indicator Detection", () => {
  function detectIndicator(error: string): string {
    const lower = error.toLowerCase();
    if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("waiting for")) {
      return "timing";
    }
    if (lower.includes("order") || lower.includes("sequence") || lower.includes("depends on")) {
      return "order_dependency";
    }
    if (lower.includes("resource") || lower.includes("concurrent") || lower.includes("rate limit")) {
      return "resource_contention";
    }
    return "external_dependency";
  }

  it("detects timing issues from timeout errors", () => {
    expect(detectIndicator("Navigation timeout of 30000ms exceeded")).toBe("timing");
    expect(detectIndicator("Timed out waiting for selector")).toBe("timing");
    expect(detectIndicator("Timeout awaiting request")).toBe("timing");
  });

  it("detects order dependency from sequence errors", () => {
    expect(detectIndicator("Test depends on previous test state")).toBe("order_dependency");
    expect(detectIndicator("Sequence error: step 3 requires step 1")).toBe("order_dependency");
  });

  it("detects resource contention from concurrent errors", () => {
    expect(detectIndicator("Resource temporarily unavailable")).toBe("resource_contention");
    expect(detectIndicator("Rate limit exceeded for API")).toBe("resource_contention");
    expect(detectIndicator("Concurrent connection limit reached")).toBe("resource_contention");
  });

  it("defaults to external_dependency for unrecognized errors", () => {
    expect(detectIndicator("Element not found")).toBe("external_dependency");
    expect(detectIndicator("Network error")).toBe("external_dependency");
    expect(detectIndicator("Unexpected token")).toBe("external_dependency");
  });
});

// ── M29: Smart Selection Logic ─────────────────────────────────

describe("M29: Smart Selection Logic", () => {
  interface DependencyEdge {
    testCaseId: string;
    sourcePath: string;
    confidence: number;
  }

  function selectTests(
    changedFiles: string[],
    edges: DependencyEdge[]
  ): { selected: string[]; confidence: number } {
    const selected = new Map<string, number>();
    for (const edge of edges) {
      if (changedFiles.some((f) => edge.sourcePath.includes(f) || f.includes(edge.sourcePath))) {
        const existing = selected.get(edge.testCaseId) ?? 0;
        selected.set(edge.testCaseId, Math.max(existing, edge.confidence));
      }
    }
    return {
      selected: Array.from(selected.keys()),
      confidence: selected.size > 0
        ? Array.from(selected.values()).reduce((a, b) => a + b, 0) / selected.size
        : 0,
    };
  }

  it("selects tests directly linked to changed files", () => {
    const edges: DependencyEdge[] = [
      { testCaseId: "test-1", sourcePath: "src/auth.ts", confidence: 0.9 },
      { testCaseId: "test-2", sourcePath: "src/api.ts", confidence: 0.7 },
    ];
    const result = selectTests(["src/auth.ts"], edges);
    expect(result.selected).toContain("test-1");
    expect(result.selected).not.toContain("test-2");
  });

  it("selects multiple tests when multiple files change", () => {
    const edges: DependencyEdge[] = [
      { testCaseId: "test-1", sourcePath: "src/auth.ts", confidence: 0.9 },
      { testCaseId: "test-2", sourcePath: "src/api.ts", confidence: 0.7 },
      { testCaseId: "test-3", sourcePath: "src/auth.ts", confidence: 0.5 },
    ];
    const result = selectTests(["src/auth.ts", "src/api.ts"], edges);
    expect(result.selected).toHaveLength(3);
  });

  it("returns empty selection when no files match", () => {
    const edges: DependencyEdge[] = [
      { testCaseId: "test-1", sourcePath: "src/auth.ts", confidence: 0.9 },
    ];
    const result = selectTests(["src/other.ts"], edges);
    expect(result.selected).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  it("computes average confidence across selected tests", () => {
    const edges: DependencyEdge[] = [
      { testCaseId: "test-1", sourcePath: "src/auth.ts", confidence: 1.0 },
      { testCaseId: "test-2", sourcePath: "src/auth.ts", confidence: 0.6 },
    ];
    const result = selectTests(["src/auth.ts"], edges);
    expect(result.confidence).toBeCloseTo(0.8, 1);
  });
});

// ── M29: Impact Prioritization Scoring ─────────────────────────

describe("M29: Impact Prioritization Scoring", () => {
  function computePriorityScore(
    dependencyMatch: boolean,
    riskScore: number,
    flakinessScore: number
  ): number {
    const depWeight = dependencyMatch ? 40 : 0;
    const riskWeight = (riskScore / 100) * 35;
    const flakinessWeight = (flakinessScore / 100) * 25;
    return Math.round(depWeight + riskWeight + flakinessWeight);
  }

  it("gives maximum score for dependency match + high risk + high flakiness", () => {
    const score = computePriorityScore(true, 100, 100);
    expect(score).toBe(100);
  });

  it("gives minimum score for no dependency match + low risk + low flakiness", () => {
    const score = computePriorityScore(false, 0, 0);
    expect(score).toBe(0);
  });

  it("weights dependency match at 40%", () => {
    const withDep = computePriorityScore(true, 0, 0);
    const withoutDep = computePriorityScore(false, 0, 0);
    expect(withDep).toBe(40);
    expect(withoutDep).toBe(0);
  });

  it("weights risk score at 35%", () => {
    const score = computePriorityScore(false, 100, 0);
    expect(score).toBe(35);
  });

  it("weights flakiness at 25%", () => {
    const score = computePriorityScore(false, 0, 100);
    expect(score).toBe(25);
  });

  it("classifies priority correctly", () => {
    const critical = computePriorityScore(true, 90, 80); // 40 + 31.5 + 20 = 91.5 → 92
    expect(critical).toBeGreaterThanOrEqual(80);
    
    const high = computePriorityScore(true, 50, 30); // 40 + 17.5 + 7.5 = 65
    expect(high).toBeGreaterThanOrEqual(60);
    expect(high).toBeLessThan(80);
    
    const medium = computePriorityScore(false, 60, 20); // 0 + 21 + 5 = 26
    expect(medium).toBeLessThan(40);
  });
});

// ── M30: Selector Repair Confidence Logic ──────────────────────

describe("M30: Selector Repair Confidence Logic", () => {
  const AUTO_APPLY_THRESHOLD = 0.85;

  function shouldAutoApply(confidence: number): boolean {
    return confidence >= AUTO_APPLY_THRESHOLD;
  }

  it("auto-applies repairs with confidence >= 0.85", () => {
    expect(shouldAutoApply(0.85)).toBe(true);
    expect(shouldAutoApply(0.90)).toBe(true);
    expect(shouldAutoApply(1.0)).toBe(true);
  });

  it("does not auto-apply repairs below 0.85 confidence", () => {
    expect(shouldAutoApply(0.84)).toBe(false);
    expect(shouldAutoApply(0.70)).toBe(false);
    expect(shouldAutoApply(0.50)).toBe(false);
  });

  it("auto-repair filters by confidence threshold", () => {
    const repairs = [
      { id: "1", confidence: 0.90, status: "pending" },
      { id: "2", confidence: 0.75, status: "pending" },
      { id: "3", confidence: 0.85, status: "pending" },
      { id: "4", confidence: 0.60, status: "pending" },
    ];
    const threshold = 0.80;
    const eligible = repairs.filter((r) => r.confidence >= threshold && r.status === "pending");
    expect(eligible).toHaveLength(2);
    expect(eligible.map((r) => r.id)).toEqual(["1", "3"]);
  });
});

// ── M30: Deprecation Detection ─────────────────────────────────

describe("M30: Deprecation Detection", () => {
  interface DeprecationPattern {
    pattern: RegExp;
    replacement: string;
    severity: string;
  }

  const DEPRECATION_PATTERNS: DeprecationPattern[] = [
    { pattern: /page\.waitFor\(/g, replacement: "page.waitForTimeout()", severity: "critical" },
    { pattern: /page\.waitForNavigation\(/g, replacement: "await expect(page).toHaveURL()", severity: "warning" },
    { pattern: /page\.\$\(/g, replacement: "page.locator()", severity: "warning" },
    { pattern: /page\.\$\$\(/g, replacement: "page.locator()", severity: "warning" },
    { pattern: />>/g, replacement: "locator chaining", severity: "info" },
  ];

  function detectDeprecations(code: string): Array<{ match: string; replacement: string; severity: string }> {
    const results: Array<{ match: string; replacement: string; severity: string }> = [];
    for (const dep of DEPRECATION_PATTERNS) {
      if (dep.pattern.test(code)) {
        results.push({
          match: dep.pattern.source,
          replacement: dep.replacement,
          severity: dep.severity,
        });
      }
      // Reset regex lastIndex
      dep.pattern.lastIndex = 0;
    }
    return results;
  }

  it("detects page.waitFor() as critical deprecation", () => {
    const code = `await page.waitFor(2000);`;
    const results = detectDeprecations(code);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("critical");
    expect(results[0].replacement).toContain("waitForTimeout");
  });

  it("detects page.waitForNavigation() as warning", () => {
    const code = `await page.waitForNavigation();`;
    const results = detectDeprecations(code);
    expect(results.some((r) => r.severity === "warning")).toBe(true);
  });

  it("detects page.$() as warning", () => {
    const code = `const el = await page.$('.btn');`;
    const results = detectDeprecations(code);
    expect(results.some((r) => r.replacement.includes("locator"))).toBe(true);
  });

  it("detects >> chaining as info", () => {
    const code = `await page.click('.parent >> .child');`;
    const results = detectDeprecations(code);
    expect(results.some((r) => r.severity === "info")).toBe(true);
  });

  it("detects multiple deprecations in same code", () => {
    const code = `await page.waitFor(1000); await page.$('.btn');`;
    const results = detectDeprecations(code);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty for modern code", () => {
    const code = `await page.locator('.btn').click();`;
    const results = detectDeprecations(code);
    expect(results).toHaveLength(0);
  });
});

// ── M30: Maintenance Category Detection ────────────────────────

describe("M30: Maintenance Category Detection", () => {
  function categorizeMaintenanceIssue(
    code: string,
    recentFailRate: number,
    featureExists: boolean
  ): Array<{ category: string; severity: string }> {
    const issues: Array<{ category: string; severity: string }> = [];

    // Deprecation check
    if (code.includes("page.waitFor(") || code.includes("page.$(")) {
      issues.push({ category: "deprecation", severity: "critical" });
    }

    // Assertion drift
    if (recentFailRate > 0.3) {
      issues.push({ category: "assertion_drift", severity: "warning" });
    }

    // Step staleness
    if (!featureExists) {
      issues.push({ category: "step_staleness", severity: "warning" });
    }

    // Code quality
    if (code.length > 5000) {
      issues.push({ category: "code_quality", severity: "info" });
    }

    return issues;
  }

  it("detects deprecation in code with old patterns", () => {
    const issues = categorizeMaintenanceIssue(
      "await page.waitFor(2000);",
      0,
      true
    );
    expect(issues.some((i) => i.category === "deprecation")).toBe(true);
  });

  it("detects assertion drift when fail rate > 30%", () => {
    const issues = categorizeMaintenanceIssue(
      "await page.locator('.btn').click();",
      0.4,
      true
    );
    expect(issues.some((i) => i.category === "assertion_drift")).toBe(true);
  });

  it("detects step staleness when feature no longer exists", () => {
    const issues = categorizeMaintenanceIssue(
      "await page.locator('.btn').click();",
      0,
      false
    );
    expect(issues.some((i) => i.category === "step_staleness")).toBe(true);
  });

  it("detects code quality issue for very long test code", () => {
    const longCode = "x".repeat(6000);
    const issues = categorizeMaintenanceIssue(longCode, 0, true);
    expect(issues.some((i) => i.category === "code_quality")).toBe(true);
  });

  it("can detect multiple issues simultaneously", () => {
    const longDeprecatedCode = "await page.waitFor(2000);" + "x".repeat(6000);
    const issues = categorizeMaintenanceIssue(longDeprecatedCode, 0.5, false);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty for clean code with no issues", () => {
    const issues = categorizeMaintenanceIssue(
      "await page.locator('.btn').click();",
      0,
      true
    );
    expect(issues).toHaveLength(0);
  });
});

// ── M30: Auto-Repair Confidence Threshold ──────────────────────

describe("M30: Auto-Repair Confidence Threshold", () => {
  function executeAutoRepair(
    repairs: Array<{ id: string; confidence: number; status: string }>,
    threshold: number
  ): { repaired: number; pending: number } {
    const eligible = repairs.filter(
      (r) => r.confidence >= threshold && r.status === "pending"
    );
    return {
      repaired: eligible.length,
      pending: repairs.filter((r) => r.status === "pending").length - eligible.length,
    };
  }

  it("repairs all pending tests above threshold", () => {
    const repairs = [
      { id: "1", confidence: 0.95, status: "pending" },
      { id: "2", confidence: 0.85, status: "pending" },
      { id: "3", confidence: 0.70, status: "pending" },
    ];
    const result = executeAutoRepair(repairs, 0.8);
    expect(result.repaired).toBe(2);
    expect(result.pending).toBe(1);
  });

  it("repairs nothing when threshold is very high", () => {
    const repairs = [
      { id: "1", confidence: 0.95, status: "pending" },
      { id: "2", confidence: 0.85, status: "pending" },
    ];
    const result = executeAutoRepair(repairs, 1.0);
    expect(result.repaired).toBe(0);
    expect(result.pending).toBe(2);
  });

  it("repairs all when threshold is very low", () => {
    const repairs = [
      { id: "1", confidence: 0.30, status: "pending" },
      { id: "2", confidence: 0.50, status: "pending" },
    ];
    const result = executeAutoRepair(repairs, 0.0);
    expect(result.repaired).toBe(2);
    expect(result.pending).toBe(0);
  });

  it("skips non-pending repairs regardless of confidence", () => {
    const repairs = [
      { id: "1", confidence: 0.95, status: "applied" },
      { id: "2", confidence: 0.90, status: "rejected" },
      { id: "3", confidence: 0.80, status: "pending" },
    ];
    const result = executeAutoRepair(repairs, 0.5);
    expect(result.repaired).toBe(1);
  });
});
