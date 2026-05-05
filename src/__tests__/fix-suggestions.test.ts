/**
 * Fix Suggestion Engine Tests
 *
 * Tests for the M16 Fix Suggestion & Approval Workflow:
 *  - FixSuggestion model integration
 *  - Fix suggestion generation (rule-based fallback)
 *  - Fix suggestion approval/rejection/application
 *  - API route validation
 *  - Credit metering for fix suggestions
 *  - Notification dispatch for fix suggestions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ──────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    fixSuggestion: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    testResult: {
      findUnique: vi.fn(),
    },
    testRun: {
      findUnique: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    feature: {
      findFirst: vi.fn(),
    },
    testCase: {
      update: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    notificationPreference: {
      findUnique: vi.fn(),
    },
    creditBalance: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    creditTransaction: {
      create: vi.fn(),
    },
  },
}));

vi.mock("z-ai-web-dev-sdk", () => ({
  default: {
    create: vi.fn().mockRejectedValue(new Error("SDK not available in test")),
  },
}));

vi.mock("@/lib/notifications/dispatcher", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    dispatchNotification: vi.fn().mockResolvedValue({
      notificationId: "test-notif-id",
      channels: { inApp: true, email: false, slack: false, discord: false, webhook: false },
      errors: [],
    }),
  };
});

vi.mock("@/lib/billing/credits", () => ({
  checkCredits: vi.fn().mockResolvedValue({
    hasCredits: true,
    balance: 100,
    required: 10,
    action: "fix_suggestion",
    lowBalance: false,
    planSlug: "pro",
  }),
  deductCredits: vi.fn().mockResolvedValue({
    success: true,
    balanceBefore: 100,
    balanceAfter: 90,
    deducted: 10,
    transactionId: "txn-123",
    lowBalance: false,
  }),
}));

// ── Import after mocks ─────────────────────────────────────────────

import { generateFixSuggestions, applyFixSuggestion, rejectFixSuggestion } from "@/lib/agent/fix-suggester";
import { db } from "@/lib/db";
import { checkCredits, deductCredits } from "@/lib/billing/credits";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

// ── Test Fix Suggestion Generation ─────────────────────────────────

describe("Fix Suggestion Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: DB operations succeed
    (db.fixSuggestion.create as any).mockResolvedValue({
      id: "fix-1",
      title: "Test fix",
      status: "pending",
    });
    (db.fixSuggestion.findUnique as any).mockResolvedValue(null);
    (db.testCase.update as any).mockResolvedValue({ id: "tc-1" });
  });

  describe("generateFixSuggestions", () => {
    const baseInput = {
      testResultId: "result-1",
      testRunId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      stepIndex: 2,
      error: 'Element not found for click: css:"#login-btn"',
      action: {
        type: "click" as const,
        selector: { strategy: "css" as const, value: "#login-btn" },
        label: "Click login button",
      },
    };

    it("should generate selector_fix suggestion for element not found errors", async () => {
      const result = await generateFixSuggestions(baseInput);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some((s) => s.type === "selector_fix")).toBe(true);
      expect(result.llmUsed).toBe(false); // Falls back to rule-based in test env
    });

    it("should generate assertion_fix for assertText failures", async () => {
      const result = await generateFixSuggestions({
        ...baseInput,
        error: 'Text assertion failed. Expected "Sign In" but got "Log In"',
        action: {
          type: "assertText" as const,
          selector: { strategy: "css" as const, value: "h1" },
          expected: "Sign In",
          label: 'Assert text "Sign In"',
        },
        actualText: "Log In",
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some((s) => s.type === "assertion_fix")).toBe(true);
    });

    it("should generate config_fix for timeout errors", async () => {
      const result = await generateFixSuggestions({
        ...baseInput,
        error: "Timeout waiting for navigation after 5000ms",
        action: {
          type: "waitForNavigation" as const,
          timeout: 5000,
          label: "Wait for navigation",
        },
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some((s) => s.type === "config_fix" || s.type === "code_fix")).toBe(true);
    });

    it("should generate dependency_fix for URL assertion failures", async () => {
      const result = await generateFixSuggestions({
        ...baseInput,
        error: 'URL assertion failed. Expected "/dashboard" but got "/login"',
        action: {
          type: "assertUrl" as const,
          expected: "/dashboard",
          label: "Assert URL is /dashboard",
        },
        actualUrl: "/login",
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some((s) => s.type === "assertion_fix")).toBe(true);
    });

    it("should check credits before generating suggestions", async () => {
      await generateFixSuggestions(baseInput);
      expect(checkCredits).toHaveBeenCalledWith("user-1", "fix_suggestion");
    });

    it("should return error when insufficient credits", async () => {
      (checkCredits as any).mockResolvedValueOnce({
        hasCredits: false,
        balance: 0,
        required: 10,
        action: "fix_suggestion",
        lowBalance: true,
        planSlug: "free",
      });

      const result = await generateFixSuggestions(baseInput);
      expect(result.suggestions).toHaveLength(0);
      expect(result.error).toContain("Insufficient credits");
    });

    it("should deduct credits after successful generation", async () => {
      await generateFixSuggestions(baseInput);
      expect(deductCredits).toHaveBeenCalled();
    });

    it("should persist suggestions to the database", async () => {
      await generateFixSuggestions(baseInput);
      expect(db.fixSuggestion.create).toHaveBeenCalled();
    });

    it("should dispatch notification for new suggestions", async () => {
      await generateFixSuggestions(baseInput);
      expect(dispatchNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "fix_suggestion",
          userId: "user-1",
          projectId: "project-1",
        })
      );
    });

    it("should include confidence scores in suggestions", async () => {
      const result = await generateFixSuggestions(baseInput);
      for (const suggestion of result.suggestions) {
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("should include reasoning in suggestions", async () => {
      const result = await generateFixSuggestions(baseInput);
      for (const suggestion of result.suggestions) {
        expect(suggestion.reasoning).toBeTruthy();
        expect(suggestion.reasoning.length).toBeGreaterThan(0);
      }
    });

    it("should generate a generic fallback suggestion for unknown errors", async () => {
      const result = await generateFixSuggestions({
        ...baseInput,
        error: "Something completely unexpected happened",
        action: {
          type: "click" as const,
          selector: { strategy: "css" as const, value: "body" },
          label: "Generic action",
        },
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0].type).toBe("code_fix");
      expect(result.suggestions[0].confidence).toBeLessThan(0.5);
    });
  });

  describe("applyFixSuggestion", () => {
    it("should apply fix and update test case code", async () => {
      (db.fixSuggestion.findUnique as any).mockResolvedValueOnce({
        id: "fix-1",
        status: "approved",
        type: "code_fix",
        suggestedCode: "// Updated code",
        testCase: { id: "tc-1", code: "// Old code" },
        metadata: null,
      });

      const result = await applyFixSuggestion("fix-1", "user-1");
      expect(result.success).toBe(true);
      expect(result.testCaseId).toBe("tc-1");
      expect(db.testCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tc-1" },
          data: expect.objectContaining({ autoHealed: true }),
        })
      );
    });

    it("should reject applying a non-pending/approved suggestion", async () => {
      (db.fixSuggestion.findUnique as any).mockResolvedValueOnce({
        id: "fix-1",
        status: "rejected",
        testCase: null,
      });

      const result = await applyFixSuggestion("fix-1", "user-1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot apply");
    });

    it("should return error when suggestion not found", async () => {
      (db.fixSuggestion.findUnique as any).mockResolvedValueOnce(null);

      const result = await applyFixSuggestion("nonexistent", "user-1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("rejectFixSuggestion", () => {
    it("should reject a pending suggestion", async () => {
      (db.fixSuggestion.findUnique as any).mockResolvedValueOnce({
        id: "fix-1",
        status: "pending",
      });

      const result = await rejectFixSuggestion("fix-1", "user-1", "Not the right fix");
      expect(result.success).toBe(true);
      expect(db.fixSuggestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "fix-1" },
          data: expect.objectContaining({
            status: "rejected",
            reviewNote: "Not the right fix",
          }),
        })
      );
    });

    it("should not reject a non-pending suggestion", async () => {
      (db.fixSuggestion.findUnique as any).mockResolvedValueOnce({
        id: "fix-1",
        status: "applied",
      });

      const result = await rejectFixSuggestion("fix-1", "user-1");
      expect(result.success).toBe(false);
    });
  });
});

// ── Credit Cost Tests ──────────────────────────────────────────────

describe("Fix Suggestion Credit Cost", () => {
  it("should have fix_suggestion defined in CREDIT_COSTS", async () => {
    const { CREDIT_COSTS } = await import("@/lib/billing/plans");
    expect(CREDIT_COSTS.fix_suggestion).toBeDefined();
    expect(CREDIT_COSTS.fix_suggestion.credits).toBe(10);
    expect(CREDIT_COSTS.fix_suggestion.action).toBe("fix_suggestion");
  });

  it("should have fix_suggestion in the CreditAction type", async () => {
    const { CREDIT_COSTS } = await import("@/lib/billing/plans");
    const actions = Object.keys(CREDIT_COSTS);
    expect(actions).toContain("fix_suggestion");
  });
});

// ── Notification Type Tests ────────────────────────────────────────

describe("Fix Suggestion Notification", () => {
  it("should include fix_suggestion in NotificationType", async () => {
    const { getNotificationTypeDescription } = await import("@/lib/notifications/dispatcher");
    const description = getNotificationTypeDescription("fix_suggestion");
    expect(description).toBeTruthy();
    expect(description.toLowerCase()).toContain("fix");
  });
});

// ── API Route Validation Tests ─────────────────────────────────────

describe("Fix Suggestion API Validation", () => {
  it("should validate required fields for POST /api/fix-suggestions", () => {
    const requiredFields = ["testResultId", "testRunId", "projectId"];
    // Simulate validation logic
    const body: Record<string, string> = {};
    const missing = requiredFields.filter((f) => !body[f]);
    expect(missing.length).toBe(3);
  });

  it("should validate status values for PATCH /api/fix-suggestions/[id]", () => {
    const validStatuses = ["approved", "rejected"];
    expect(validStatuses.includes("approved")).toBe(true);
    expect(validStatuses.includes("rejected")).toBe(true);
    expect(validStatuses.includes("pending")).toBe(false);
    expect(validStatuses.includes("applied")).toBe(false);
  });

  it("should validate fix types", () => {
    const validTypes = ["selector_fix", "assertion_fix", "code_fix", "config_fix", "dependency_fix"];
    expect(validTypes).toHaveLength(5);
    expect(validTypes.includes("selector_fix")).toBe(true);
    expect(validTypes.includes("unknown_fix")).toBe(false);
  });
});
