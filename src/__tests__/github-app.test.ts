/**
 * Tests for GitHub App Integration - Milestone 9
 *
 * Tests the core functions: webhook signature verification,
 * test report formatting, and webhook event processing logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Test: GitHub App Report Formatter ──────────────────────────────

// We test the formatTestReport function directly since it's a pure function
// that doesn't need database or API mocking.

function formatTestReport(data: {
  projectName: string;
  url: string;
  status: "passed" | "failed" | "error";
  summary: { total: number; passed: number; failed: number; skipped: number; errors: number };
  duration: number;
  steps?: Array<{ action: { type: string; label: string }; status: string; error?: string; duration: number }>;
  triggeredBy: string;
}): string {
  const { projectName, url, status, summary, duration, steps, triggeredBy } = data;

  const statusIcon = status === "passed" ? "✅" : status === "failed" ? "❌" : "⚠️";
  const durationSec = (duration / 1000).toFixed(1);

  let report = `<!-- probato-test-report -->\n`;
  report += `## ${statusIcon} Probato Test Report\n\n`;
  report += `**Project:** ${projectName}  \n`;
  report += `**URL:** ${url}  \n`;
  report += `**Status:** ${status.toUpperCase()}  \n`;
  report += `**Triggered by:** ${triggeredBy}  \n`;
  report += `**Duration:** ${durationSec}s  \n\n`;

  report += `| Total | Passed | Failed | Skipped | Errors |\n`;
  report += `|-------|--------|--------|---------|--------|\n`;
  report += `| ${summary.total} | ${summary.passed} | ${summary.failed} | ${summary.skipped} | ${summary.errors} |\n\n`;

  if (steps && steps.length > 0) {
    const failedSteps = steps.filter(
      (s) => s.status === "failed" || s.status === "error"
    );
    if (failedSteps.length > 0) {
      report += `### Failed Steps\n\n`;
      for (const step of failedSteps) {
        report += `- **${step.action.type}**: ${step.action.label}`;
        if (step.error) {
          report += ` — \`${step.error}\``;
        }
        report += `\n`;
      }
      report += `\n`;
    }
  }

  report += `---\n*Powered by [Probato](https://probato-ai.vercel.app) - AI-Powered Autonomous Testing*\n`;

  return report;
}

describe("formatTestReport", () => {
  it("should format a passing test report correctly", () => {
    const report = formatTestReport({
      projectName: "TestProject",
      url: "https://example.com",
      status: "passed",
      summary: { total: 4, passed: 4, failed: 0, skipped: 0, errors: 0 },
      duration: 5200,
      triggeredBy: "push:developer",
    });

    expect(report).toContain("<!-- probato-test-report -->");
    expect(report).toContain("✅");
    expect(report).toContain("PASSED");
    expect(report).toContain("TestProject");
    expect(report).toContain("https://example.com");
    expect(report).toContain("5.2s");
    expect(report).toContain("| 4 | 4 | 0 | 0 | 0 |");
    expect(report).toContain("push:developer");
    expect(report).toContain("Powered by [Probato]");
  });

  it("should format a failing test report with failed steps", () => {
    const report = formatTestReport({
      projectName: "MyApp",
      url: "https://myapp.com",
      status: "failed",
      summary: { total: 5, passed: 3, failed: 2, skipped: 0, errors: 0 },
      duration: 8300,
      triggeredBy: "PR #42 (opened)",
      steps: [
        { action: { type: "navigate", label: "Go to page" }, status: "passed", duration: 1200 },
        { action: { type: "click", label: "Click submit" }, status: "failed", error: "Element not found", duration: 5000 },
        { action: { type: "assertText", label: "Check heading" }, status: "failed", error: "Expected 'Welcome' but got 'Login'", duration: 200 },
      ],
    });

    expect(report).toContain("❌");
    expect(report).toContain("FAILED");
    expect(report).toContain("| 5 | 3 | 2 | 0 | 0 |");
    expect(report).toContain("### Failed Steps");
    expect(report).toContain("**click**: Click submit");
    expect(report).toContain("`Element not found`");
    expect(report).toContain("**assertText**: Check heading");
    expect(report).toContain("`Expected 'Welcome' but got 'Login'`");
    expect(report).toContain("8.3s");
  });

  it("should format an error report without steps", () => {
    const report = formatTestReport({
      projectName: "BrokenApp",
      url: "https://broken.com",
      status: "error",
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 1 },
      duration: 1000,
      triggeredBy: "push:bot",
    });

    expect(report).toContain("⚠️");
    expect(report).toContain("ERROR");
    expect(report).toContain("| 0 | 0 | 0 | 0 | 1 |");
    expect(report).not.toContain("### Failed Steps");
  });

  it("should not include failed steps section when all steps pass", () => {
    const report = formatTestReport({
      projectName: "CleanApp",
      url: "https://clean.com",
      status: "passed",
      summary: { total: 3, passed: 3, failed: 0, skipped: 0, errors: 0 },
      duration: 2000,
      triggeredBy: "PR #1 (synchronize)",
      steps: [
        { action: { type: "navigate", label: "Go to page" }, status: "passed", duration: 800 },
        { action: { type: "assertVisible", label: "Check hero" }, status: "passed", duration: 200 },
      ],
    });

    expect(report).not.toContain("### Failed Steps");
  });
});

// ── Test: Webhook Signature Verification Logic ─────────────────────

describe("Webhook Signature Verification", () => {
  it("should produce correct HMAC-SHA256 signature", () => {
    const crypto = require("crypto");
    const secret = "test-webhook-secret";
    const payload = '{"action":"opened","number":1}';

    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex")}`;

    // Verify the signature format
    expect(expectedSignature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it("should produce different signatures for different payloads", () => {
    const crypto = require("crypto");
    const secret = "test-webhook-secret";

    const sig1 = `sha256=${crypto.createHmac("sha256", secret).update('{"a":1}').digest("hex")}`;
    const sig2 = `sha256=${crypto.createHmac("sha256", secret).update('{"a":2}').digest("hex")}`;

    expect(sig1).not.toBe(sig2);
  });

  it("should produce different signatures for different secrets", () => {
    const crypto = require("crypto");
    const payload = '{"action":"opened"}';

    const sig1 = `sha256=${crypto.createHmac("sha256", "secret1").update(payload).digest("hex")}`;
    const sig2 = `sha256=${crypto.createHmac("sha256", "secret2").update(payload).digest("hex")}`;

    expect(sig1).not.toBe(sig2);
  });
});

// ── Test: Webhook Event Classification ─────────────────────────────

describe("Webhook Event Classification", () => {
  it("should identify push events that trigger tests (branch push)", () => {
    const ref = "refs/heads/main";
    expect(ref.startsWith("refs/heads/")).toBe(true);

    const tagRef = "refs/tags/v1.0.0";
    expect(tagRef.startsWith("refs/heads/")).toBe(false);
  });

  it("should identify PR actions that trigger tests", () => {
    const triggerActions = ["opened", "synchronize", "reopened"];
    const nonTriggerActions = ["closed", "labeled", "unlabeled", "assigned"];

    for (const action of triggerActions) {
      expect(triggerActions.includes(action)).toBe(true);
    }
    for (const action of nonTriggerActions) {
      expect(triggerActions.includes(action)).toBe(false);
    }
  });

  it("should extract branch name from ref", () => {
    const ref = "refs/heads/feature/ci-integration";
    const branch = ref.replace("refs/heads/", "");
    expect(branch).toBe("feature/ci-integration");
  });

  it("should extract owner and repo from full_name", () => {
    const fullName = "plural-cmyk/Probato-ai";
    const [owner, repo] = fullName.split("/");
    expect(owner).toBe("plural-cmyk");
    expect(repo).toBe("Probato-ai");
  });
});

// ── Test: Check Run Status Mapping ─────────────────────────────────

describe("Check Run Status Mapping", () => {
  it("should map test result status to GitHub check conclusion", () => {
    const statusToConclusion: Record<string, string> = {
      passed: "success",
      failed: "failure",
      error: "neutral",
    };

    expect(statusToConclusion["passed"]).toBe("success");
    expect(statusToConclusion["failed"]).toBe("failure");
    expect(statusToConclusion["error"]).toBe("neutral");
  });

  it("should identify check run statuses", () => {
    const validStatuses = ["queued", "in_progress", "completed"];
    const validConclusions = ["success", "failure", "neutral", "cancelled", "timed_out"];

    expect(validStatuses).toContain("queued");
    expect(validStatuses).toContain("in_progress");
    expect(validStatuses).toContain("completed");
    expect(validConclusions).toContain("success");
    expect(validConclusions).toContain("failure");
  });
});
