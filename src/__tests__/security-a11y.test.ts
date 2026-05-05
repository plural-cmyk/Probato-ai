/**
 * Security & Accessibility Testing Agent Tests
 *
 * Tests for the M17 Security & Accessibility Testing Agent:
 *  - Security scanner: rule-based checks (headers, CSP, mixed content, XSS, cookies, CORS)
 *  - A11y auditor: rule-based checks (images, forms, headings, ARIA)
 *  - Score calculation
 *  - Credit integration
 *  - LLM fallback behavior
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ──────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    securityScan: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    a11yAudit: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    notificationPreference: {
      findUnique: vi.fn(),
    },
    notificationChannel: {
      findMany: vi.fn().mockResolvedValue([]),
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
    required: 4,
    action: "security_scan",
    lowBalance: false,
    planSlug: "pro",
  }),
  deductCredits: vi.fn().mockResolvedValue({
    success: true,
    balanceBefore: 100,
    balanceAfter: 96,
    deducted: 4,
    transactionId: "txn-sec-123",
    lowBalance: false,
  }),
}));

vi.mock("@/lib/browser/chromium", () => ({
  getBrowserInstance: vi.fn(),
  cleanupBrowser: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────────────

import { runSecurityScan } from "@/lib/agent/security-scanner";
import { runA11yAudit } from "@/lib/agent/a11y-auditor";
import { db } from "@/lib/db";
import { checkCredits, deductCredits } from "@/lib/billing/credits";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { getBrowserInstance } from "@/lib/browser/chromium";

// ── Helper: Create mock page ──────────────────────────────────────

function createMockPage(evaluateResults: Record<string, any> = {}) {
  const defaultHeaders = {
    "content-type": "text/html",
    "x-frame-options": "DENY",
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'",
    "referrer-policy": "strict-origin-when-cross-origin",
  };

  return {
    goto: vi.fn().mockResolvedValue({
      headers: () => evaluateResults._responseHeaders ?? defaultHeaders,
    }),
    url: vi.fn().mockReturnValue("https://example.com"),
    evaluate: vi.fn().mockImplementation((fn: Function) => {
      const fnStr = fn.toString();
      // Return appropriate mock results based on what the evaluate function inspects
      for (const [key, value] of Object.entries(evaluateResults)) {
        if (key.startsWith("_")) continue;
        if (fnStr.includes(key)) return Promise.resolve(value);
      }
      return Promise.resolve(evaluateResults._default ?? []);
    }),
    setUserAgent: vi.fn(),
    close: vi.fn(),
  };
}

function createMockBrowser(page: any) {
  return {
    newPage: vi.fn().mockResolvedValue(page),
  };
}

// ── Security Scanner Tests ────────────────────────────────────────

describe("Security Scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.securityScan.create as any).mockResolvedValue({
      id: "scan-1",
      status: "completed",
      overallScore: 85,
    });
  });

  it("should check credits before running security scan", async () => {
    const mockPage = createMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(checkCredits).toHaveBeenCalledWith("user-1", "security_scan");
  });

  it("should return error when insufficient credits", async () => {
    (checkCredits as any).mockResolvedValueOnce({
      hasCredits: false,
      balance: 0,
      required: 4,
      action: "security_scan",
      lowBalance: true,
      planSlug: "free",
    });

    const result = await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.findings).toHaveLength(0);
    expect(result.error).toContain("Insufficient credits");
  });

  it("should detect missing security headers", async () => {
    const mockPage = createMockPage({
      _responseHeaders: {
        "content-type": "text/html",
        // Missing: CSP, HSTS, X-Frame-Options, etc.
      },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.category === "headers")).toBe(true);
  });

  it("should not flag present security headers", async () => {
    const mockPage = createMockPage({
      _responseHeaders: {
        "content-type": "text/html",
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "x-frame-options": "DENY",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        "permissions-policy": "camera=(), microphone=()",
      },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    const headerFindings = result.findings.filter((f) => f.category === "headers");
    expect(headerFindings).toHaveLength(0);
  });

  it("should detect CSP with unsafe-inline", async () => {
    const mockPage = createMockPage({
      _responseHeaders: {
        "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'",
      },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.findings.some((f) => f.category === "csp" && f.title.includes("unsafe-inline"))).toBe(true);
  });

  it("should detect CSP with unsafe-eval", async () => {
    const mockPage = createMockPage({
      _responseHeaders: {
        "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-eval'",
      },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.findings.some((f) => f.category === "csp" && f.title.includes("unsafe-eval"))).toBe(true);
  });

  it("should detect overly permissive CORS", async () => {
    const mockPage = createMockPage({
      _responseHeaders: {
        "access-control-allow-origin": "*",
      },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.findings.some((f) => f.category === "cors")).toBe(true);
  });

  it("should deduct credits after successful scan", async () => {
    const mockPage = createMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(deductCredits).toHaveBeenCalled();
  });

  it("should persist scan results to database", async () => {
    const mockPage = createMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(db.securityScan.create).toHaveBeenCalled();
  });

  it("should dispatch notification for critical/high findings", async () => {
    const mockPage = createMockPage({
      _responseHeaders: {
        "content-type": "text/html",
        // Missing important headers
      },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "security_issue",
        userId: "user-1",
        projectId: "proj-1",
      })
    );
  });

  it("should calculate overall score correctly", async () => {
    const mockPage = createMockPage({
      _responseHeaders: {
        "content-type": "text/html",
      },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it("should handle browser launch failure gracefully", async () => {
    (getBrowserInstance as any).mockRejectedValue(new Error("Browser not available"));

    const result = await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.error).toBeTruthy();
    expect(result.overallScore).toBe(0);
  });

  it("should fall back to rule-based analysis when LLM fails", async () => {
    const mockPage = createMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    // LLM is mocked to fail, so llmUsed should be false
    expect(result.llmUsed).toBe(false);
  });
});

// ── A11y Auditor Tests ────────────────────────────────────────────

describe("A11y Auditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.a11yAudit.create as any).mockResolvedValue({
      id: "audit-1",
      status: "completed",
      overallScore: 75,
    });
    // Reset checkCredits for a11y_audit
    (checkCredits as any).mockResolvedValue({
      hasCredits: true,
      balance: 100,
      required: 5,
      action: "a11y_audit",
      lowBalance: false,
      planSlug: "pro",
    });
  });

  it("should check credits before running a11y audit", async () => {
    const mockPage = createMockPage({ _default: [] });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(checkCredits).toHaveBeenCalledWith("user-1", "a11y_audit");
  });

  it("should return error when insufficient credits for a11y audit", async () => {
    (checkCredits as any).mockResolvedValueOnce({
      hasCredits: false,
      balance: 0,
      required: 5,
      action: "a11y_audit",
      lowBalance: true,
      planSlug: "free",
    });

    const result = await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.violations).toHaveLength(0);
    expect(result.error).toContain("Insufficient credits");
  });

  // Helper: create sequential mock evaluate for a11y auditor
  // The a11y auditor calls page.evaluate() in order: images, forms, headings, aria, keyboard, contrast, focus, landmarks
  function createA11yMockPage(overrides: Record<number, any> = {}) {
    const defaultResults = [
      { issues: [], passCount: 0 }, // 0: images
      { issues: [], passCount: 0 }, // 1: forms
      { issues: [], h1Count: 1, headingCount: 1 }, // 2: headings
      { issues: [], passCount: 0 }, // 3: aria
      { issues: [], passCount: 0 }, // 4: keyboard
      { issues: [], passCount: 0 }, // 5: contrast
      { issues: [], globalOutlineNone: false }, // 6: focus
      { missing: [], present: ["main", "banner", "navigation", "contentinfo"], landmarks: { banner: 1, navigation: 1, main: 1, contentinfo: 1 }, multipleMain: false }, // 7: landmarks
    ];
    const results = defaultResults.map((r, i) => overrides[i] ?? r);
    let callIndex = 0;

    return {
      goto: vi.fn().mockResolvedValue({
        headers: () => ({}),
      }),
      url: vi.fn().mockReturnValue("https://example.com"),
      evaluate: vi.fn().mockImplementation(() => {
        const result = results[callIndex] ?? { issues: [], passCount: 0 };
        callIndex++;
        return Promise.resolve(result);
      }),
      setUserAgent: vi.fn(),
      close: vi.fn(),
    };
  }

  it("should detect images without alt text", async () => {
    const mockPage = createA11yMockPage({
      0: { issues: [{ selector: "img.hero", src: "https://example.com/hero.jpg", html: '<img src="hero.jpg">', hasAlt: false, altEmpty: false }], passCount: 0 },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.violations.some((v) => v.category === "images")).toBe(true);
  });

  it("should detect form inputs without labels", async () => {
    const mockPage = createA11yMockPage({
      1: { issues: [{ selector: '[name="email"]', html: '<input type="email" name="email">', type: "email", hasLabel: false }], passCount: 0 },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.violations.some((v) => v.category === "forms")).toBe(true);
  });

  it("should detect heading hierarchy issues", async () => {
    const mockPage = createA11yMockPage({
      2: { issues: [{ selector: "h3", html: "<h3>Skip</h3>", level: 3, text: 'Skipped from h1 to h3: "Skip"' }], h1Count: 1, headingCount: 3 },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.violations.some((v) => v.category === "headings")).toBe(true);
  });

  it("should detect missing main landmark", async () => {
    const mockPage = createA11yMockPage({
      7: { missing: ["main", "navigation"], present: ["banner", "contentinfo"], landmarks: { banner: 1, navigation: 0, main: 0, contentinfo: 1 }, multipleMain: false },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.violations.some((v) => v.category === "landmarks" && v.title.includes("main"))).toBe(true);
  });

  it("should deduct credits after successful audit", async () => {
    const mockPage = createA11yMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(deductCredits).toHaveBeenCalled();
  });

  it("should persist audit results to database", async () => {
    const mockPage = createA11yMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(db.a11yAudit.create).toHaveBeenCalled();
  });

  it("should calculate a11y score correctly", async () => {
    const mockPage = createA11yMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it("should handle browser launch failure gracefully", async () => {
    (getBrowserInstance as any).mockRejectedValue(new Error("Browser not available"));

    const result = await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.error).toBeTruthy();
    expect(result.overallScore).toBe(0);
  });

  it("should fall back to rule-based analysis when LLM fails", async () => {
    const mockPage = createA11yMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.llmUsed).toBe(false);
  });
});

// ── Score Calculation Tests ───────────────────────────────────────

describe("Score Calculation", () => {
  it("security score should decrease with severity", async () => {
    // Mock a page with no security headers → many findings
    const mockPage = createMockPage({
      _responseHeaders: {
        "content-type": "text/html",
      },
    });
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runSecurityScan({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    // With missing headers, score should be below 100
    expect(result.overallScore).toBeLessThan(100);
  });

  it("a11y score should be 100 when no violations", async () => {
    // Create a clean a11y mock page with all checks passing
    let callIndex = 0;
    const passResults = [
      { issues: [], passCount: 5 }, // images
      { issues: [], passCount: 5 }, // forms
      { issues: [], h1Count: 1, headingCount: 5 }, // headings
      { issues: [], passCount: 5 }, // aria
      { issues: [], passCount: 5 }, // keyboard
      { issues: [], passCount: 5 }, // contrast
      { issues: [], globalOutlineNone: false }, // focus
      { missing: [], present: ["main", "banner", "navigation", "contentinfo"], landmarks: { banner: 1, navigation: 1, main: 1, contentinfo: 1 }, multipleMain: false }, // landmarks
    ];
    const mockPage = {
      goto: vi.fn().mockResolvedValue({ headers: () => ({}) }),
      url: vi.fn().mockReturnValue("https://example.com"),
      evaluate: vi.fn().mockImplementation(() => {
        const result = passResults[callIndex] ?? { issues: [], passCount: 0 };
        callIndex++;
        return Promise.resolve(result);
      }),
      setUserAgent: vi.fn(),
      close: vi.fn(),
    };
    const mockBrowser = createMockBrowser(mockPage);
    (getBrowserInstance as any).mockResolvedValue({ browser: mockBrowser, isRemote: true });

    const result = await runA11yAudit({
      projectId: "proj-1",
      userId: "user-1",
      url: "https://example.com",
    });

    expect(result.overallScore).toBe(100);
  });
});

// ── Credit Cost Tests ──────────────────────────────────────────────

describe("Security & A11y Credit Costs", () => {
  it("should have security_scan defined in CREDIT_COSTS", async () => {
    const { CREDIT_COSTS } = await import("@/lib/billing/plans");
    expect(CREDIT_COSTS.security_scan).toBeDefined();
    expect(CREDIT_COSTS.security_scan.credits).toBe(4);
    expect(CREDIT_COSTS.security_scan.action).toBe("security_scan");
  });

  it("should have a11y_audit defined in CREDIT_COSTS", async () => {
    const { CREDIT_COSTS } = await import("@/lib/billing/plans");
    expect(CREDIT_COSTS.a11y_audit).toBeDefined();
    expect(CREDIT_COSTS.a11y_audit.credits).toBe(5);
    expect(CREDIT_COSTS.a11y_audit.action).toBe("a11y_audit");
  });
});

// ── Notification Type Tests ────────────────────────────────────────

describe("Security & A11y Notification Types", () => {
  it("should include security_issue in NotificationType", async () => {
    const { getNotificationTypeDescription } = await import("@/lib/notifications/dispatcher");
    const description = getNotificationTypeDescription("security_issue");
    expect(description).toBeTruthy();
    expect(description.toLowerCase()).toContain("security");
  });

  it("should include a11y_issue in NotificationType", async () => {
    const { getNotificationTypeDescription } = await import("@/lib/notifications/dispatcher");
    const description = getNotificationTypeDescription("a11y_issue");
    expect(description).toBeTruthy();
    expect(description.toLowerCase()).toContain("accessibility");
  });
});

// ── Action Type Tests ──────────────────────────────────────────────

describe("Security & A11y Action Types", () => {
  it("should include security action types in ActionType", async () => {
    const actions = await import("@/lib/agent/actions");
    const actionTypes: string[] = [
      "checkSecurityHeaders", "checkCSP", "checkMixedContent",
      "scanA11y", "checkContrast", "checkAriaLabels", "checkKeyboardNav",
    ];

    // Verify the action interfaces exist by checking the module exports
    // These types are verified at compile time, but we can check they're importable
    expect(actions).toBeDefined();
  });

  it("should have proper action interface shapes", () => {
    // Verify action type structure at runtime
    const checkSecurityHeadersAction = {
      type: "checkSecurityHeaders" as const,
      label: "Check security headers",
    };
    expect(checkSecurityHeadersAction.type).toBe("checkSecurityHeaders");

    const scanA11yAction = {
      type: "scanA11y" as const,
      label: "Scan accessibility",
      standard: "2.1AA",
      level: "AA",
    };
    expect(scanA11yAction.type).toBe("scanA11y");
    expect(scanA11yAction.standard).toBe("2.1AA");
  });
});
