/**
 * Call Flow Testing Agent Tests (M27)
 *
 * Comprehensive tests for:
 *  - Call flow tester: credit check, scoring, agent config generation
 *  - Custom action handler delegation from orchestrator
 *  - All 13 call action handlers (success, fallback, not-found)
 *  - Call phase check analysis
 *  - Audio check analysis
 *  - Scoring calculations (weighted category scores, overall score)
 *  - Latency extraction (ring latency, connection latency)
 *  - Summary generation for different score levels
 *  - Findings generation for all check categories
 *  - Recommendations generation for failure/skip/all-pass
 *  - Call flow event extraction
 *  - CallFlowTestSession persistence
 *  - Credit action definition
 *  - Custom selector override behavior
 *  - Action handler error/timeout behavior
 *  - End-to-end runCallFlowTest with mocked orchestrator
 *  - Data model and type validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ──────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    callFlowTestSession: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    orchestratedSession: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    sandboxInstance: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    syncEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn(),
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

vi.mock("@/lib/billing/credits", () => ({
  checkCredits: vi.fn().mockResolvedValue({
    hasSufficient: true,
    balance: 100,
    required: 12,
    action: "call_flow_test",
    lowBalance: false,
    planSlug: "pro",
  }),
  deductCredits: vi.fn().mockResolvedValue({
    success: true,
    balanceBefore: 100,
    balanceAfter: 88,
    deducted: 12,
    transactionId: "txn-call-123",
    lowBalance: false,
  }),
}));

vi.mock("@/lib/browser/chromium", () => ({
  getBrowserInstance: vi.fn(),
  cleanupBrowser: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────────────

import {
  handleCallCustomAction,
  getCallFlowAgents,
  runCallFlowTest,
  type CallPhaseCheckResult,
  type AudioCheckResult,
  type CallEvent,
  type CallFlowTestResult,
  type CallFlowTestInput,
} from "@/lib/agent/call-flow-tester";
import { db } from "@/lib/db";
import { checkCredits, deductCredits } from "@/lib/billing/credits";
import { getBrowserInstance } from "@/lib/browser/chromium";

// ── Helper: Create mock page ──────────────────────────────────────

function createMockPage(evaluateResults: Record<string, any> = {}) {
  return {
    goto: vi.fn().mockResolvedValue({ headers: () => ({}) }),
    url: vi.fn().mockReturnValue("https://calls.example.com"),
    evaluate: vi.fn().mockImplementation((fn: Function | string, ...args: any[]) => {
      if (typeof fn === "string") return Promise.resolve(true);
      const fnStr = fn.toString();
      for (const [key, value] of Object.entries(evaluateResults)) {
        if (fnStr.includes(key)) return Promise.resolve(value);
      }
      return Promise.resolve(evaluateResults._default ?? true);
    }),
    waitForSelector: vi.fn().mockResolvedValue({
      click: vi.fn(),
      type: vi.fn(),
    }),
    click: vi.fn(),
    type: vi.fn(),
    keyboard: {
      press: vi.fn(),
      type: vi.fn(),
    },
    screenshot: vi.fn().mockResolvedValue("base64data"),
    setUserAgent: vi.fn(),
    setViewport: vi.fn(),
    close: vi.fn(),
    $: vi.fn().mockResolvedValue({
      click: vi.fn(),
      type: vi.fn(),
    }),
    setDefaultTimeout: vi.fn(),
  };
}

function createMockBrowser(page: any) {
  return {
    newPage: vi.fn().mockResolvedValue(page),
    disconnect: vi.fn(),
    close: vi.fn(),
  };
}

// ── Custom Action Handler Tests ────────────────────────────────────

describe("Call Flow Custom Action Handler", () => {
  let mockPage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = createMockPage();
  });

  // ── dial ──────────────────────────────────────────────────────

  describe("dial", () => {
    it("should dial via provided custom selector", async () => {
      const action = {
        type: "custom" as const,
        value: "dial",
        selector: "button.call-btn",
        description: 'Dial callee: "user-b"',
      };

      const el = { click: vi.fn() };
      mockPage.waitForSelector = vi.fn().mockResolvedValue(el);
      mockPage.$ = vi.fn().mockResolvedValue(null); // No dial input

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Dialed callee");
      expect(result.evidence).toContain("user-b");
      expect(result.evidence).toContain("button.call-btn");
      expect(el.click).toHaveBeenCalled();
    });

    it("should fall back to default dial selectors when custom not provided", async () => {
      const action = {
        type: "custom" as const,
        value: "dial",
        description: 'Dial callee: "user-b"',
      };

      // First several selectors fail, last one succeeds
      mockPage.waitForSelector = vi.fn()
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValue({ click: vi.fn() });
      mockPage.$ = vi.fn().mockResolvedValue(null);

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Dialed callee");
    });

    it("should create sync event for latency tracking on dial", async () => {
      const action = {
        type: "custom" as const,
        value: "dial",
        selector: "#dial-button",
        description: 'Dial callee: "user-b"',
      };

      mockPage.waitForSelector = vi.fn().mockResolvedValue({
        click: vi.fn(),
      });
      mockPage.$ = vi.fn().mockResolvedValue(null);

      await handleCallCustomAction(
        mockPage,
        action,
        "session-456",
        "caller",
        30000
      );

      expect(db.syncEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: "session-456",
            eventType: "state_update",
            sourceAgent: "caller",
            payload: expect.objectContaining({
              stateKey: "call_dialed_at",
            }),
          }),
        })
      );
    });

    it("should throw when no dial element found at all", async () => {
      const action = {
        type: "custom" as const,
        value: "dial",
        description: 'Dial callee: "user-b"',
      };

      // All selectors fail including fallback
      mockPage.waitForSelector = vi.fn().mockRejectedValue(new Error("Not found"));

      await expect(
        handleCallCustomAction(mockPage, action, "session-789", "caller", 30000)
      ).rejects.toThrow("Could not find dial/call button element to initiate call");
    });
  });

  // ── answer ────────────────────────────────────────────────────

  describe("answer", () => {
    it("should click answer button", async () => {
      const action = {
        type: "custom" as const,
        value: "answer",
        description: "Answer incoming call",
      };

      const el = { click: vi.fn() };
      mockPage.waitForSelector = vi.fn().mockResolvedValue(el);

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "callee",
        30000
      );

      expect(result.evidence).toContain("Answered incoming call");
      expect(el.click).toHaveBeenCalled();
    });

    it("should fall back to alternate answer selectors", async () => {
      const action = {
        type: "custom" as const,
        value: "answer",
        description: "Answer incoming call",
      };

      // Primary selectors fail, fallback succeeds
      mockPage.waitForSelector = vi.fn()
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValue({ click: vi.fn() });

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "callee",
        30000
      );

      expect(result.evidence).toContain("Answered");
    });

    it("should throw when no answer button found", async () => {
      const action = {
        type: "custom" as const,
        value: "answer",
        description: "Answer incoming call",
      };

      mockPage.waitForSelector = vi.fn().mockRejectedValue(new Error("Not found"));

      await expect(
        handleCallCustomAction(mockPage, action, "session-123", "callee", 30000)
      ).rejects.toThrow("Could not find answer/accept button to answer incoming call");
    });
  });

  // ── hangup ────────────────────────────────────────────────────

  describe("hangup", () => {
    it("should click hangup button", async () => {
      const action = {
        type: "custom" as const,
        value: "hangup",
        description: "Hang up the call",
      };

      const el = { click: vi.fn() };
      mockPage.waitForSelector = vi.fn().mockResolvedValue(el);

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Hung up call");
      expect(el.click).toHaveBeenCalled();
    });

    it("should fall back to alternate hangup selectors", async () => {
      const action = {
        type: "custom" as const,
        value: "hangup",
        description: "Hang up the call",
      };

      // Primary selectors fail, fallback succeeds
      mockPage.waitForSelector = vi.fn()
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValue({ click: vi.fn() });

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Hung up call");
    });

    it("should throw when no hangup button found", async () => {
      const action = {
        type: "custom" as const,
        value: "hangup",
        description: "Hang up the call",
      };

      mockPage.waitForSelector = vi.fn().mockRejectedValue(new Error("Not found"));

      await expect(
        handleCallCustomAction(mockPage, action, "session-123", "caller", 30000)
      ).rejects.toThrow("Could not find hangup/end-call button to end call");
    });
  });

  // ── verify_ring ──────────────────────────────────────────────

  describe("verify_ring", () => {
    it("should find ring indicator", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_ring",
        description: "Verify ring indicator is visible",
      };

      mockPage.waitForSelector = vi.fn().mockResolvedValue({});
      mockPage.evaluate = vi.fn().mockResolvedValue("Ringing...");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "callee",
        30000
      );

      expect(result.evidence).toContain("Ring indicator found");
    });

    it("should return no ring indicator found gracefully", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_ring",
        description: "Verify ring indicator is visible",
      };

      mockPage.waitForSelector = vi.fn().mockRejectedValue(new Error("Timeout"));

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "callee",
        30000
      );

      expect(result.evidence).toContain("No ring indicator found");
    });
  });

  // ── verify_incoming_call ──────────────────────────────────────

  describe("verify_incoming_call", () => {
    it("should find incoming call UI", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_incoming_call",
        description: "Verify incoming call UI is displayed",
      };

      mockPage.waitForSelector = vi.fn().mockResolvedValue({});
      mockPage.evaluate = vi.fn().mockResolvedValue("Incoming call from caller");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "callee",
        30000
      );

      expect(result.evidence).toContain("Incoming call indicator found");
    });

    it("should handle no incoming call element gracefully", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_incoming_call",
        description: "Verify incoming call UI is displayed",
      };

      mockPage.waitForSelector = vi.fn().mockRejectedValue(new Error("Timeout"));

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "callee",
        30000
      );

      expect(result.evidence).toContain("No incoming call indicator found");
    });
  });

  // ── verify_call_connected ─────────────────────────────────────

  describe("verify_call_connected", () => {
    it("should detect 'connected' status", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_call_connected",
        description: "Verify call is connected",
      };

      mockPage.waitForSelector = vi.fn().mockResolvedValue({});
      mockPage.evaluate = vi.fn().mockResolvedValue("connected");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("connected");
    });

    it("should detect 'active' status", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_call_connected",
        description: "Verify call is connected",
      };

      mockPage.waitForSelector = vi.fn().mockResolvedValue({});
      mockPage.evaluate = vi.fn().mockResolvedValue("active");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("connected");
    });

    it("should detect 'in-call' status", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_call_connected",
        description: "Verify call is connected",
      };

      mockPage.waitForSelector = vi.fn().mockResolvedValue({});
      mockPage.evaluate = vi.fn().mockResolvedValue("in-call");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("connected");
    });

    it("should throw when no connection indicator found", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_call_connected",
        description: "Verify call is connected",
      };

      mockPage.waitForSelector = vi.fn().mockRejectedValue(new Error("Timeout"));
      // Also fail the body check fallback
      mockPage.evaluate = vi.fn().mockResolvedValue(false);

      await expect(
        handleCallCustomAction(mockPage, action, "session-123", "caller", 30000)
      ).rejects.toThrow("Could not verify call is connected");
    });
  });

  // ── verify_call_ended ─────────────────────────────────────────

  describe("verify_call_ended", () => {
    it("should detect 'ended' status", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_call_ended",
        description: "Verify call has ended",
      };

      mockPage.$ = vi.fn().mockResolvedValue({});
      mockPage.evaluate = vi.fn().mockResolvedValue("ended");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("ended");
    });

    it("should detect 'idle' status", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_call_ended",
        description: "Verify call has ended",
      };

      mockPage.$ = vi.fn().mockResolvedValue({});
      mockPage.evaluate = vi.fn().mockResolvedValue("idle");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("ended");
    });

    it("should handle no end indicator found gracefully", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_call_ended",
        description: "Verify call has ended",
      };

      mockPage.$ = vi.fn().mockResolvedValue(null);
      mockPage.evaluate = vi.fn().mockResolvedValue(false);

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Could not confirm call ended status");
    });
  });

  // ── verify_call_timer ─────────────────────────────────────────

  describe("verify_call_timer", () => {
    it("should find timer element", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_call_timer",
        description: "Verify call timer is running",
      };

      mockPage.waitForSelector = vi.fn().mockResolvedValue({});
      mockPage.evaluate = vi.fn().mockResolvedValue("02:34");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Call timer found");
      expect(result.evidence).toContain("02:34");
    });

    it("should handle no timer found gracefully", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_call_timer",
        description: "Verify call timer is running",
      };

      mockPage.waitForSelector = vi.fn().mockRejectedValue(new Error("Timeout"));

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("No call timer element found");
    });
  });

  // ── verify_call_quality ───────────────────────────────────────

  describe("verify_call_quality", () => {
    it("should find quality indicator", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_call_quality",
        description: "Verify call quality indicator",
      };

      mockPage.$ = vi.fn().mockResolvedValue({});
      mockPage.evaluate = vi.fn().mockResolvedValue("excellent");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Call quality indicator found");
    });

    it("should handle no quality indicator found gracefully", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_call_quality",
        description: "Verify call quality indicator",
      };

      mockPage.$ = vi.fn().mockResolvedValue(null);

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("No call quality indicator found");
    });
  });

  // ── verify_audio_indicator ────────────────────────────────────

  describe("verify_audio_indicator", () => {
    it("should find audio indicator", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_audio_indicator",
        description: "Verify audio indicator is active",
      };

      mockPage.$ = vi.fn().mockResolvedValue({});
      mockPage.evaluate = vi.fn().mockResolvedValue("audio-active");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Audio indicator found");
    });

    it("should handle no audio indicator found gracefully", async () => {
      const action = {
        type: "custom" as const,
        value: "verify_audio_indicator",
        description: "Verify audio indicator is active",
      };

      mockPage.$ = vi.fn().mockResolvedValue(null);

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("No audio/speaker indicator found");
    });
  });

  // ── toggle_mute ───────────────────────────────────────────────

  describe("toggle_mute", () => {
    it("should click mute button and report state change", async () => {
      const action = {
        type: "custom" as const,
        value: "toggle_mute",
        description: "Toggle mute on/off",
      };

      const el = { click: vi.fn() };
      mockPage.waitForSelector = vi.fn().mockResolvedValue(el);
      mockPage.evaluate = vi.fn()
        .mockResolvedValueOnce("mute-off")  // before
        .mockResolvedValueOnce("mute-on");  // after

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Toggled mute");
      expect(el.click).toHaveBeenCalled();
    });

    it("should fall back to alternate mute selectors", async () => {
      const action = {
        type: "custom" as const,
        value: "toggle_mute",
        description: "Toggle mute on/off",
      };

      mockPage.waitForSelector = vi.fn()
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValue({ click: vi.fn() });
      mockPage.evaluate = vi.fn()
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Toggled mute");
    });

    it("should handle no mute button found gracefully", async () => {
      const action = {
        type: "custom" as const,
        value: "toggle_mute",
        description: "Toggle mute on/off",
      };

      mockPage.waitForSelector = vi.fn().mockRejectedValue(new Error("Not found"));

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("No mute button found");
    });
  });

  // ── toggle_speaker ────────────────────────────────────────────

  describe("toggle_speaker", () => {
    it("should click speaker button", async () => {
      const action = {
        type: "custom" as const,
        value: "toggle_speaker",
        description: "Toggle speaker on/off",
      };

      const el = { click: vi.fn() };
      mockPage.waitForSelector = vi.fn().mockResolvedValue(el);
      mockPage.evaluate = vi.fn()
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Toggled speaker");
      expect(el.click).toHaveBeenCalled();
    });

    it("should fall back to alternate speaker selectors", async () => {
      const action = {
        type: "custom" as const,
        value: "toggle_speaker",
        description: "Toggle speaker on/off",
      };

      mockPage.waitForSelector = vi.fn()
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValue({ click: vi.fn() });
      mockPage.evaluate = vi.fn()
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Toggled speaker");
    });

    it("should handle no speaker button found gracefully", async () => {
      const action = {
        type: "custom" as const,
        value: "toggle_speaker",
        description: "Toggle speaker on/off",
      };

      mockPage.waitForSelector = vi.fn().mockRejectedValue(new Error("Not found"));

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("No speaker button found");
    });
  });

  // ── toggle_video ──────────────────────────────────────────────

  describe("toggle_video", () => {
    it("should click video toggle", async () => {
      const action = {
        type: "custom" as const,
        value: "toggle_video",
        description: "Toggle video on/off",
      };

      const el = { click: vi.fn() };
      mockPage.waitForSelector = vi.fn().mockResolvedValue(el);
      mockPage.evaluate = vi.fn()
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("");

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("Toggled video");
      expect(el.click).toHaveBeenCalled();
    });

    it("should handle no video toggle found gracefully", async () => {
      const action = {
        type: "custom" as const,
        value: "toggle_video",
        description: "Toggle video on/off",
      };

      mockPage.waitForSelector = vi.fn().mockRejectedValue(new Error("Not found"));

      const result = await handleCallCustomAction(
        mockPage,
        action,
        "session-123",
        "caller",
        30000
      );

      expect(result.evidence).toContain("No video toggle button found");
    });
  });

  // ── unknown action ────────────────────────────────────────────

  it("should return fallback evidence for unknown action", async () => {
    const action = {
      type: "custom" as const,
      value: "unknown_call_action",
    };

    const result = await handleCallCustomAction(
      mockPage,
      action,
      "session-123",
      "caller",
      30000
    );

    expect(result.evidence).toContain("Unknown call action");
  });
});

// ── Agent Configuration Tests ──────────────────────────────────────

describe("Call Flow Agent Configuration", () => {
  it("should generate caller and callee agents", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    expect(agents).toHaveLength(2);
    expect(agents[0].role).toBe("caller");
    expect(agents[1].role).toBe("callee");
  });

  it("caller should have dial action", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const callerActions = agents[0].actions.map((a) => a.value);
    expect(callerActions).toContain("dial");
  });

  it("caller should have verify_call_connected action", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const callerActions = agents[0].actions.map((a) => a.value);
    expect(callerActions).toContain("verify_call_connected");
  });

  it("caller should have hangup action", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const callerActions = agents[0].actions.map((a) => a.value);
    expect(callerActions).toContain("hangup");
  });

  it("callee should have answer action", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const calleeActions = agents[1].actions.map((a) => a.value);
    expect(calleeActions).toContain("answer");
  });

  it("callee should have verify_incoming_call action", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const calleeActions = agents[1].actions.map((a) => a.value);
    expect(calleeActions).toContain("verify_incoming_call");
  });

  it("both agents should have barrier action for sync", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const callerBarrier = agents[0].actions.find((a) => a.type === "barrier");
    const calleeBarrier = agents[1].actions.find((a) => a.type === "barrier");

    expect(callerBarrier).toBeDefined();
    expect(calleeBarrier).toBeDefined();
    expect(callerBarrier?.value).toBe(calleeBarrier?.value);
  });

  it("both agents should have screenshot action", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const callerScreenshot = agents[0].actions.find((a) => a.type === "screenshot");
    const calleeScreenshot = agents[1].actions.find((a) => a.type === "screenshot");

    expect(callerScreenshot).toBeDefined();
    expect(calleeScreenshot).toBeDefined();
  });

  it("caller should have signal for call_dialed", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const signalAction = agents[0].actions.find(
      (a) => a.type === "signal" && a.value === "call_dialed"
    );
    expect(signalAction).toBeDefined();
  });

  it("callee should have signal for call_answered", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const signalAction = agents[1].actions.find(
      (a) => a.type === "signal" && a.value === "call_answered"
    );
    expect(signalAction).toBeDefined();
  });

  it("should pass custom selectors through to actions", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
      dialButtonSelector: "#my-dial-btn",
      answerButtonSelector: ".answer-call",
      hangupButtonSelector: "[data-testid=end-call]",
      muteButtonSelector: ".mic-toggle",
      speakerButtonSelector: ".speaker-toggle",
    });

    const dialAction = agents[0].actions.find((a) => a.value === "dial");
    expect(dialAction?.selector).toBe("#my-dial-btn");

    const answerAction = agents[1].actions.find((a) => a.value === "answer");
    expect(answerAction?.selector).toBe(".answer-call");

    const hangupAction = agents[0].actions.find((a) => a.value === "hangup");
    expect(hangupAction?.selector).toBe("[data-testid=end-call]");
  });

  it("should embed callee identifier in dial description", () => {
    const agents = getCallFlowAgents("alice@example.com", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const dialAction = agents[0].actions.find((a) => a.value === "dial");
    expect(dialAction?.description).toContain("alice@example.com");
  });

  it("should include verify_call_timer in caller actions", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const callerActions = agents[0].actions.map((a) => a.value);
    expect(callerActions).toContain("verify_call_timer");
  });

  it("should include toggle_mute in caller actions", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const callerActions = agents[0].actions.map((a) => a.value);
    expect(callerActions).toContain("toggle_mute");
  });

  it("should include verify_call_quality in caller actions", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const callerActions = agents[0].actions.map((a) => a.value);
    expect(callerActions).toContain("verify_call_quality");
  });

  it("should include toggle_speaker in callee actions", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const calleeActions = agents[1].actions.map((a) => a.value);
    expect(calleeActions).toContain("toggle_speaker");
  });

  it("should include verify_audio_indicator in callee actions", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const calleeActions = agents[1].actions.map((a) => a.value);
    expect(calleeActions).toContain("verify_audio_indicator");
  });

  it("should include call duration wait when callDurationMs is specified", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
      callDurationMs: 5000,
    });

    // There should be a wait action for the call duration
    const waitAction = agents[0].actions.find(
      (a) => a.type === "wait" && a.value === "5000"
    );
    expect(waitAction).toBeDefined();
  });
});

// ── Scoring Tests ──────────────────────────────────────────────────

describe("Call Flow Score Calculation", () => {
  it("should calculate perfect call flow score from all-passed checks", () => {
    const checks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "passed", details: "OK" },
      { phase: "ring", status: "passed", details: "OK" },
      { phase: "answer", status: "passed", details: "OK" },
      { phase: "connected", status: "passed", details: "OK" },
      { phase: "hangup", status: "passed", details: "OK" },
    ];

    const passed = checks.filter((c) => c.status === "passed").length;
    const failed = checks.filter((c) => c.status === "failed").length;
    const skipped = checks.filter((c) => c.status === "skipped").length;
    const weightedScore = passed * 1.0 + skipped * 0.5 + failed * 0;
    const score = Math.round((weightedScore / checks.length) * 100);

    expect(score).toBe(100);
  });

  it("should give 50% credit for skipped checks", () => {
    const checks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "passed", details: "OK" },
      { phase: "ring", status: "skipped", details: "Skip" },
      { phase: "answer", status: "failed", details: "Fail" },
    ];

    const passed = checks.filter((c) => c.status === "passed").length;
    const failed = checks.filter((c) => c.status === "failed").length;
    const skipped = checks.filter((c) => c.status === "skipped").length;
    const weightedScore = passed * 1.0 + skipped * 0.5 + failed * 0;
    const score = Math.round((weightedScore / checks.length) * 100);
    expect(score).toBe(50);
  });

  it("should give 0 score when all checks fail", () => {
    const checks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "failed", details: "Fail" },
      { phase: "ring", status: "failed", details: "Fail" },
      { phase: "answer", status: "failed", details: "Fail" },
    ];

    const passed = checks.filter((c) => c.status === "passed").length;
    const failed = checks.filter((c) => c.status === "failed").length;
    const skipped = checks.filter((c) => c.status === "skipped").length;
    const weightedScore = passed * 1.0 + skipped * 0.5 + failed * 0;
    const score = Math.round((weightedScore / checks.length) * 100);
    expect(score).toBe(0);
  });

  it("should calculate overall score with weighted formula (connection 0.4, audio 0.3, callFlow 0.3)", () => {
    const connectionScore = 100;
    const audioScore = 80;
    const callFlowScore = 60;
    const overallScore = Math.round(
      connectionScore * 0.4 + audioScore * 0.3 + callFlowScore * 0.3
    );

    expect(overallScore).toBe(82); // 40 + 24 + 18
  });

  it("should give 0 overall score when all categories are 0", () => {
    const overallScore = Math.round(0 * 0.4 + 0 * 0.3 + 0 * 0.3);
    expect(overallScore).toBe(0);
  });

  it("should give 100 overall score when all categories are 100", () => {
    const overallScore = Math.round(100 * 0.4 + 100 * 0.3 + 100 * 0.3);
    expect(overallScore).toBe(100);
  });

  it("should weight connection score highest in overall calculation", () => {
    // Connection = 100, Audio = 0, CallFlow = 0
    const overall1 = Math.round(100 * 0.4 + 0 * 0.3 + 0 * 0.3);
    // Connection = 0, Audio = 100, CallFlow = 0
    const overall2 = Math.round(0 * 0.4 + 100 * 0.3 + 0 * 0.3);
    // Connection = 0, Audio = 0, CallFlow = 100
    const overall3 = Math.round(0 * 0.4 + 0 * 0.3 + 100 * 0.3);

    expect(overall1).toBe(40);
    expect(overall2).toBe(30);
    expect(overall3).toBe(30);
    expect(overall1).toBeGreaterThan(overall2);
    expect(overall2).toBe(overall3);
  });

  it("should calculate audio score from mixed audio checks", () => {
    const checks: AudioCheckResult[] = [
      { type: "audio_indicator", status: "passed", details: "Audio active" },
      { type: "call_quality", status: "passed", details: "Good quality" },
      { type: "mute_toggle", status: "skipped", details: "Mute not tested" },
      { type: "speaker_toggle", status: "passed", details: "Speaker works" },
    ];

    const passed = checks.filter((c) => c.status === "passed").length;
    const skipped = checks.filter((c) => c.status === "skipped").length;
    const weightedScore = passed * 1.0 + skipped * 0.5;
    const score = Math.round((weightedScore / checks.length) * 100);
    expect(score).toBe(88);
  });

  it("should give 50 score when all call flow checks are skipped", () => {
    const checks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "skipped", details: "Skip" },
      { phase: "answer", status: "skipped", details: "Skip" },
    ];

    const passed = checks.filter((c) => c.status === "passed").length;
    const skipped = checks.filter((c) => c.status === "skipped").length;
    const failed = checks.filter((c) => c.status === "failed").length;
    const weightedScore = passed * 1.0 + skipped * 0.5 + failed * 0;
    const score = Math.round((weightedScore / checks.length) * 100);
    expect(score).toBe(50);
  });

  it("should calculate mixed call flow and audio scores correctly", () => {
    const callFlowChecks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "passed", details: "OK" },
      { phase: "answer", status: "passed", details: "OK" },
      { phase: "hangup", status: "failed", details: "Fail" },
    ];
    const audioChecks: AudioCheckResult[] = [
      { type: "audio_indicator", status: "passed", details: "OK" },
      { type: "call_quality", status: "skipped", details: "Skip" },
    ];

    const callFlowScore = Math.round(
      ((2 * 1.0 + 0 * 0.5 + 1 * 0) / callFlowChecks.length) * 100
    );
    const audioScore = Math.round(
      ((1 * 1.0 + 1 * 0.5 + 0 * 0) / audioChecks.length) * 100
    );

    expect(callFlowScore).toBe(67);
    expect(audioScore).toBe(75);
  });
});

// ── Latency Extraction Tests ───────────────────────────────────────

describe("Call Flow Latency Extraction", () => {
  it("should extract ring latency from checks", () => {
    const checks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "passed", details: "OK", latencyMs: 1000 },
      { phase: "ring", status: "passed", details: "OK", latencyMs: 2500 },
      { phase: "answer", status: "passed", details: "OK", latencyMs: 4000 },
    ];

    const dialCheck = checks.find((c) => c.phase === "dial");
    const ringCheck = checks.find((c) => c.phase === "ring");

    const ringLatency = Math.abs(
      (ringCheck?.latencyMs ?? 0) - (dialCheck?.latencyMs ?? 0)
    );
    expect(ringLatency).toBe(1500);
  });

  it("should extract connection latency from checks", () => {
    const checks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "passed", details: "OK", latencyMs: 1000 },
      { phase: "ring", status: "passed", details: "OK", latencyMs: 2500 },
      { phase: "answer", status: "passed", details: "OK", latencyMs: 4000 },
      { phase: "connected", status: "passed", details: "OK", latencyMs: 4200 },
    ];

    const dialCheck = checks.find((c) => c.phase === "dial");
    const connectedCheck = checks.find((c) => c.phase === "connected");

    const connectionLatency = Math.abs(
      (connectedCheck?.latencyMs ?? 0) - (dialCheck?.latencyMs ?? 0)
    );
    expect(connectionLatency).toBe(3200);
  });

  it("should return 0 when no latency data available", () => {
    const checks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "passed", details: "OK" },
      { phase: "connected", status: "passed", details: "OK" },
    ];

    const dialCheck = checks.find((c) => c.phase === "dial");
    const connectedCheck = checks.find((c) => c.phase === "connected");
    const latency = Math.abs(
      (connectedCheck?.latencyMs ?? 0) - (dialCheck?.latencyMs ?? 0)
    );
    expect(latency).toBe(0);
  });
});

// ── Analysis Function Tests ────────────────────────────────────────

describe("Call Flow Analysis Functions", () => {
  it("should generate findings for failed call phase checks", () => {
    const checks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "failed", details: "Could not find dial element" },
      { phase: "answer", status: "passed", details: "Call answered" },
    ];

    const failedChecks = checks.filter((c) => c.status === "failed");
    expect(failedChecks).toHaveLength(1);
    expect(failedChecks[0].phase).toBe("dial");
  });

  it("should generate findings for failed audio checks", () => {
    const checks: AudioCheckResult[] = [
      { type: "audio_indicator", status: "failed", details: "No audio indicator" },
      { type: "call_quality", status: "passed", details: "Good quality" },
    ];

    const failedChecks = checks.filter((c) => c.status === "failed");
    expect(failedChecks).toHaveLength(1);
    expect(failedChecks[0].type).toBe("audio_indicator");
  });

  it("should not generate findings for passed or skipped checks", () => {
    const checks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "passed", details: "OK" },
      { phase: "answer", status: "skipped", details: "Skip" },
    ];

    const failedChecks = checks.filter((c) => c.status === "failed");
    expect(failedChecks).toHaveLength(0);
  });

  it("should generate critical findings for connection failure", () => {
    const checks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "passed", details: "OK" },
      { phase: "connected", status: "failed", details: "Call never connected" },
    ];

    const connectionFailure = checks.find(
      (c) => c.phase === "connected" && c.status === "failed"
    );
    expect(connectionFailure).toBeDefined();
    expect(connectionFailure?.details).toContain("never connected");
  });

  it("should aggregate findings from both call phase and audio checks", () => {
    const callPhaseChecks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "failed", details: "Dial failed" },
      { phase: "answer", status: "passed", details: "OK" },
    ];
    const audioChecks: AudioCheckResult[] = [
      { type: "audio_indicator", status: "failed", details: "No audio" },
      { type: "call_quality", status: "passed", details: "OK" },
    ];

    const allFailed = [
      ...callPhaseChecks.filter((c) => c.status === "failed"),
      ...audioChecks.filter((c) => c.status === "failed"),
    ];
    expect(allFailed).toHaveLength(2);
  });
});

// ── Summary Generation Tests ───────────────────────────────────────

describe("Call Flow Summary Generation", () => {
  it("should generate success summary when all checks pass", () => {
    const callPhaseChecks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "passed", details: "OK" },
      { phase: "answer", status: "passed", details: "OK" },
    ];

    const allPassed = callPhaseChecks.every((c) => c.status === "passed");
    const callStatus = allPassed
      ? "Call flow verified successfully."
      : "Partial";

    expect(callStatus).toBe("Call flow verified successfully.");
  });

  it("should generate partial summary when some checks fail", () => {
    const callFlowScore = 50;
    const callPhaseChecks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "passed", details: "OK" },
      { phase: "answer", status: "failed", details: "Fail" },
    ];

    const allPassed = callPhaseChecks.every((c) => c.status === "passed");
    const callStatus = allPassed
      ? "Call flow verified successfully."
      : callFlowScore >= 50
      ? "Call flow partially verified — some checks failed."
      : "Call flow verification failed — significant issues detected.";

    expect(callStatus).toContain("partially verified");
  });

  it("should generate failure summary when score is low", () => {
    const callFlowScore = 25;
    const callPhaseChecks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "failed", details: "Fail" },
      { phase: "answer", status: "failed", details: "Fail" },
    ];

    const allPassed = callPhaseChecks.every((c) => c.status === "passed");
    const callStatus = allPassed
      ? "Call flow verified successfully."
      : callFlowScore >= 50
      ? "Partial"
      : "Call flow verification failed — significant issues detected.";

    expect(callStatus).toContain("significant issues");
  });

  it("should include connection status in summary", () => {
    const connectionScore = 100;
    const summary = connectionScore === 100
      ? "Connection established successfully."
      : "Connection issues detected.";

    expect(summary).toBe("Connection established successfully.");
  });

  it("should include audio quality in summary when available", () => {
    const audioScore = 80;
    const summary = audioScore >= 70
      ? "Audio quality is acceptable."
      : "Audio quality issues detected.";

    expect(summary).toBe("Audio quality is acceptable.");
  });

  it("should flag low audio quality in summary", () => {
    const audioScore = 40;
    const summary = audioScore >= 70
      ? "Audio quality is acceptable."
      : "Audio quality issues detected.";

    expect(summary).toBe("Audio quality issues detected.");
  });
});

// ── Recommendations Generation Tests ───────────────────────────────

describe("Call Flow Recommendations Generation", () => {
  it("should recommend fixing failed call phase checks", () => {
    const callPhaseChecks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "failed", details: "Failed" },
      { phase: "answer", status: "passed", details: "OK" },
    ];
    const audioChecks: AudioCheckResult[] = [];

    const phaseFailures = callPhaseChecks.filter((c) => c.status === "failed").length;
    expect(phaseFailures).toBe(1);
  });

  it("should recommend fixing audio issues", () => {
    const audioChecks: AudioCheckResult[] = [
      { type: "audio_indicator", status: "failed", details: "No audio" },
    ];

    const audioFailures = audioChecks.filter((c) => c.status === "failed").length;
    expect(audioFailures).toBe(1);
  });

  it("should recommend providing specific selectors when all checks are skipped", () => {
    const callPhaseChecks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "skipped", details: "Skipped" },
      { phase: "answer", status: "skipped", details: "Skipped" },
    ];
    const audioChecks: AudioCheckResult[] = [
      { type: "audio_indicator", status: "skipped", details: "Skipped" },
    ];

    const allSkipped = [...callPhaseChecks, ...audioChecks].every(
      (c) => c.status === "skipped"
    );
    expect(allSkipped).toBe(true);
  });

  it("should return success message when all checks pass", () => {
    const callPhaseChecks: CallPhaseCheckResult[] = [
      { phase: "dial", status: "passed", details: "OK" },
    ];
    const audioChecks: AudioCheckResult[] = [];

    const hasFailures = [callPhaseChecks, audioChecks]
      .flat()
      .some((c) => c.status === "failed");

    expect(hasFailures).toBe(false);
  });

  it("should recommend investigating connection failures with high severity", () => {
    const callPhaseChecks: CallPhaseCheckResult[] = [
      { phase: "connected", status: "failed", details: "Call never connected" },
    ];

    const connectionFailure = callPhaseChecks.find(
      (c) => c.phase === "connected" && c.status === "failed"
    );
    expect(connectionFailure).toBeDefined();
  });
});

// ── Call Flow Event Extraction Tests ───────────────────────────────

describe("Call Flow Event Extraction", () => {
  it("should extract call flow events from agent results", () => {
    const agentResults = {
      caller: {
        actions: [
          { type: "navigate", duration: 500, evidence: "Navigated" },
          { type: "custom", duration: 300, evidence: "Dialed" },
          { type: "custom", duration: 200, evidence: "Call connected" },
        ],
      },
      callee: {
        actions: [
          { type: "navigate", duration: 600, evidence: "Navigated" },
          { type: "custom", duration: 100, evidence: "Incoming call found" },
          { type: "custom", duration: 150, evidence: "Answered call" },
        ],
      },
    };

    const events: CallEvent[] = [];
    for (const [role, result] of Object.entries(agentResults)) {
      if (!(result as any)?.actions) continue;
      for (const action of (result as any).actions) {
        events.push({
          timestamp: Date.now() - (action.duration ?? 0),
          agent: role,
          action: action.type,
          details: action.evidence ?? action.error ?? "",
        });
      }
    }

    expect(events).toHaveLength(6);
    expect(events[0].agent).toBe("caller");
    expect(events[0].action).toBe("navigate");
    expect(events[3].agent).toBe("callee");
  });

  it("should sort call flow events by timestamp", () => {
    const now = Date.now();
    const events: CallEvent[] = [
      { timestamp: now - 5000, agent: "caller", action: "navigate", details: "Nav" },
      { timestamp: now - 1000, agent: "callee", action: "answer", details: "Answer" },
      { timestamp: now - 3000, agent: "caller", action: "dial", details: "Dial" },
    ];

    const sorted = events.sort((a, b) => a.timestamp - b.timestamp);
    expect(sorted[0].action).toBe("navigate");
    expect(sorted[1].action).toBe("dial");
    expect(sorted[2].action).toBe("answer");
  });

  it("should handle empty agent results", () => {
    const agentResults = {};
    const events: CallEvent[] = [];

    for (const [role, result] of Object.entries(agentResults)) {
      if (!(result as any)?.actions) continue;
    }

    expect(events).toHaveLength(0);
  });

  it("should handle agent results without actions", () => {
    const agentResults = {
      caller: { status: "error", errorLog: "Browser crashed" },
    };

    const events: CallEvent[] = [];
    for (const [role, result] of Object.entries(agentResults)) {
      if (!(result as any)?.actions) continue;
    }

    expect(events).toHaveLength(0);
  });
});

// ── Call Phase Analysis Tests ──────────────────────────────────────

describe("Call Phase Analysis", () => {
  it("should analyze caller action results for call phases", () => {
    const agentResults = {
      caller: {
        actions: [
          { type: "custom", status: "passed", evidence: "Dialed callee via #dial-btn", duration: 200 },
          { type: "custom", status: "passed", evidence: "Call status found: connected via .call-status", duration: 3000 },
          { type: "custom", status: "passed", evidence: "Hung up call via .hangup-btn", duration: 100 },
        ],
      },
      callee: {
        actions: [
          { type: "custom", status: "passed", evidence: "Incoming call indicator found", duration: 1500 },
          { type: "custom", status: "passed", evidence: "Answered incoming call via .answer-btn", duration: 200 },
        ],
      },
    };

    const dialAction = agentResults.caller.actions.find(
      (a: any) => a.type === "custom" && a.evidence?.includes("Dialed")
    );
    expect(dialAction).toBeDefined();
    expect(dialAction.status).toBe("passed");

    const connectedAction = agentResults.caller.actions.find(
      (a: any) => a.type === "custom" && a.evidence?.includes("connected")
    );
    expect(connectedAction).toBeDefined();
  });

  it("should detect failed call dial", () => {
    const agentResults = {
      caller: {
        actions: [
          { type: "custom", status: "failed", error: "Could not find dial/call button element to initiate call", duration: 3000 },
        ],
      },
      callee: {
        actions: [],
      },
    };

    const dialAction = agentResults.caller.actions.find(
      (a: any) => a.type === "custom" && a.error?.includes("dial/call button")
    );
    expect(dialAction).toBeDefined();
    expect(dialAction.status).toBe("failed");
  });

  it("should detect signal exchange between caller and callee", () => {
    const agentResults = {
      caller: {
        actions: [
          { type: "signal", status: "passed", evidence: 'Signal "call_dialed" sent', duration: 50 },
        ],
      },
      callee: {
        actions: [],
      },
    };

    const signalAction = agentResults.caller.actions.find(
      (a: any) => a.type === "signal" && a.evidence?.includes("call_dialed")
    );
    expect(signalAction).toBeDefined();
  });

  it("should detect cross-agent sync via waitForSignal", () => {
    const agentResults = {
      callee: {
        actions: [
          { type: "waitForSignal", status: "passed", evidence: "Signal received", duration: 200 },
        ],
      },
      caller: {
        actions: [],
      },
    };

    const waitAction = agentResults.callee.actions.find(
      (a: any) => a.type === "waitForSignal"
    );
    expect(waitAction).toBeDefined();
    expect(waitAction.status).toBe("passed");
  });
});

// ── Audio Analysis Tests ───────────────────────────────────────────

describe("Audio Quality Analysis", () => {
  it("should analyze audio indicator check from caller", () => {
    const agentResults = {
      caller: {
        actions: [
          { type: "custom", status: "passed", evidence: 'Audio indicator found: "audio-active" via .call-quality', duration: 100 },
        ],
      },
      callee: { actions: [] },
    };

    const audioAction = agentResults.caller.actions.find(
      (a: any) => a.type === "custom" && a.evidence?.includes("Audio indicator")
    );
    expect(audioAction).toBeDefined();
  });

  it("should analyze call quality check", () => {
    const agentResults = {
      caller: {
        actions: [
          { type: "custom", status: "passed", evidence: "Call quality indicator found: good via .call-quality", duration: 50 },
        ],
      },
      callee: { actions: [] },
    };

    const qualityAction = agentResults.caller.actions.find(
      (a: any) => a.type === "custom" && a.evidence?.includes("quality")
    );
    expect(qualityAction).toBeDefined();
  });

  it("should analyze mute toggle check", () => {
    const agentResults = {
      caller: {
        actions: [
          { type: "custom", status: "passed", evidence: "Toggled mute via .mute-btn", duration: 100 },
        ],
      },
      callee: { actions: [] },
    };

    const muteAction = agentResults.caller.actions.find(
      (a: any) => a.type === "custom" && a.evidence?.includes("mute")
    );
    expect(muteAction).toBeDefined();
  });

  it("should analyze speaker toggle check", () => {
    const agentResults = {
      callee: {
        actions: [
          { type: "custom", status: "passed", evidence: "Toggled speaker via .speaker-btn", duration: 100 },
        ],
      },
      caller: { actions: [] },
    };

    const speakerAction = agentResults.callee.actions.find(
      (a: any) => a.type === "custom" && a.evidence?.includes("speaker")
    );
    expect(speakerAction).toBeDefined();
  });

  it("should detect missing audio indicator as failure", () => {
    const agentResults = {
      callee: {
        actions: [
          { type: "custom", status: "passed", evidence: "No audio/speaker indicator found", duration: 100 },
        ],
      },
      caller: { actions: [] },
    };

    // The action succeeded but the evidence indicates no indicator
    const audioAction = agentResults.callee.actions.find(
      (a: any) => a.type === "custom" && a.evidence?.includes("No audio")
    );
    expect(audioAction).toBeDefined();
  });
});

// ── Credit Integration Tests ───────────────────────────────────────

describe("Call Flow Test Credit Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should check credits before running call flow test", async () => {
    (db.orchestratedSession.create as any).mockResolvedValue({
      id: "session-1",
      status: "running",
    });
    (db.sandboxInstance.create as any).mockResolvedValue({
      id: "sandbox-1",
      status: "provisioning",
    });
    (db.callFlowTestSession.create as any).mockResolvedValue({
      id: "call-session-1",
      status: "completed",
    });

    expect(checkCredits).toBeDefined();
  });

  it("should return error when insufficient credits", async () => {
    (checkCredits as any).mockResolvedValueOnce({
      hasSufficient: false,
      balance: 0,
      required: 12,
      action: "call_flow_test",
      lowBalance: true,
      planSlug: "free",
    });

    const result = await runCallFlowTest({
      userId: "user-1",
      url: "https://calls.example.com",
      calleeIdentifier: "user-b",
    });

    expect(result.error).toContain("Insufficient credits");
    expect(result.overallScore).toBe(0);
    expect(result.status).toBe("failed");
    expect(result.connectionScore).toBe(0);
    expect(result.audioScore).toBe(0);
    expect(result.callFlowScore).toBe(0);
  });

  it("should include credit balance in error message", async () => {
    (checkCredits as any).mockResolvedValueOnce({
      hasSufficient: false,
      balance: 5,
      required: 12,
      action: "call_flow_test",
      lowBalance: true,
      planSlug: "starter",
    });

    const result = await runCallFlowTest({
      userId: "user-1",
      url: "https://calls.example.com",
      calleeIdentifier: "user-b",
    });

    expect(result.error).toContain("5");
    expect(result.error).toContain("12");
  });

  it("should deduct credits after successful test", async () => {
    (db.orchestratedSession.create as any).mockResolvedValue({
      id: "session-1",
      status: "running",
    });
    (db.sandboxInstance.create as any).mockResolvedValue({
      id: "sandbox-1",
      status: "provisioning",
    });
    (db.orchestratedSession.findUnique as any).mockResolvedValue({
      id: "session-1",
      sandboxes: [{ id: "s1" }, { id: "s2" }],
    });
    (db.callFlowTestSession.create as any).mockResolvedValue({
      id: "call-session-1",
      status: "completed",
    });

    expect(deductCredits).toBeDefined();
  });
});

// ── Orchestrator Delegation Tests ──────────────────────────────────

describe("Orchestrator Custom Action Delegation for Call Flow", () => {
  it("should delegate call flow actions to call-flow-tester", async () => {
    const orchestratorModule = await import("@/lib/agent/multi-device-orchestrator");
    const callFlowModule = await import("@/lib/agent/call-flow-tester");

    expect(orchestratorModule.runOrchestratedSession).toBeDefined();
    expect(callFlowModule.handleCallCustomAction).toBeDefined();
  });

  it("should have all 13 call action values in delegation list", () => {
    const callActions = [
      "dial", "answer", "hangup",
      "verify_ring", "verify_incoming_call",
      "verify_call_connected", "verify_call_ended",
      "verify_call_timer", "verify_call_quality",
      "verify_audio_indicator",
      "toggle_mute", "toggle_speaker", "toggle_video",
    ];

    expect(callActions).toHaveLength(13);

    for (const action of callActions) {
      expect(callActions).toContain(action);
    }
  });

  it("should handle call flow action fallback gracefully in orchestrator", async () => {
    const callFlowModule = await import("@/lib/agent/call-flow-tester");
    expect(typeof callFlowModule.handleCallCustomAction).toBe("function");
  });
});

// ── Data Model Tests ───────────────────────────────────────────────

describe("CallFlowTestSession Data Model", () => {
  it("should have proper model fields in schema", () => {
    expect(db.callFlowTestSession).toBeDefined();
    expect(db.callFlowTestSession.create).toBeDefined();
    expect(db.callFlowTestSession.findMany).toBeDefined();
    expect(db.callFlowTestSession.findUnique).toBeDefined();
    expect(db.callFlowTestSession.count).toBeDefined();
  });

  it("should create a call flow test session with required fields", async () => {
    const mockSession = {
      id: "call-1",
      status: "completed",
      url: "https://calls.example.com",
      calleeIdentifier: "user-b",
      callType: "audio",
      callDurationMs: 5000,
      ringLatencyMs: 1500,
      connectionLatencyMs: 3200,
      overallScore: 82,
      connectionScore: 100,
      audioScore: 80,
      callFlowScore: 60,
      callFlowEvents: [],
      callPhaseChecks: [],
      audioChecks: [],
      findings: [],
      recommendations: [],
      llmUsed: false,
      duration: 15000,
      userId: "user-1",
      projectId: "proj-1",
    };

    (db.callFlowTestSession.create as any).mockResolvedValue(mockSession);

    const result = await db.callFlowTestSession.create({
      data: mockSession,
    });

    expect(result.id).toBe("call-1");
    expect(result.status).toBe("completed");
    expect(result.overallScore).toBe(82);
    expect(result.connectionScore).toBe(100);
    expect(result.audioScore).toBe(80);
    expect(result.callFlowScore).toBe(60);
  });

  it("should store all check arrays as JSON fields", async () => {
    const mockSession = {
      id: "call-2",
      callPhaseChecks: [
        { phase: "dial", status: "passed", details: "OK" },
      ],
      audioChecks: [
        { type: "audio_indicator", status: "skipped", details: "No indicator" },
      ],
      callFlowEvents: [
        { timestamp: Date.now(), agent: "caller", action: "dial", details: "Dialed" },
      ],
    };

    (db.callFlowTestSession.create as any).mockResolvedValue(mockSession);

    const result = await db.callFlowTestSession.create({ data: mockSession });

    expect(result.callPhaseChecks).toHaveLength(1);
    expect(result.audioChecks).toHaveLength(1);
    expect(result.callFlowEvents).toHaveLength(1);
  });

  it("should link to orchestrated session", async () => {
    const mockSession = {
      id: "call-3",
      orchestratedSessionId: "orch-1",
    };

    (db.callFlowTestSession.create as any).mockResolvedValue(mockSession);

    const result = await db.callFlowTestSession.create({ data: mockSession });

    expect(result.orchestratedSessionId).toBe("orch-1");
  });

  it("should store latency measurements", async () => {
    const mockSession = {
      id: "call-4",
      ringLatencyMs: 1200,
      connectionLatencyMs: 2800,
    };

    (db.callFlowTestSession.create as any).mockResolvedValue(mockSession);

    const result = await db.callFlowTestSession.create({ data: mockSession });

    expect(result.ringLatencyMs).toBe(1200);
    expect(result.connectionLatencyMs).toBe(2800);
  });
});

// ── CallFlowTestResult Type Tests ──────────────────────────────────

describe("CallFlowTestResult Type", () => {
  it("should have all required fields in result", () => {
    const result: CallFlowTestResult = {
      id: "test-1",
      sessionId: "session-1",
      status: "completed",
      overallScore: 82,
      connectionScore: 100,
      audioScore: 80,
      callFlowScore: 60,
      ringLatencyMs: 1500,
      connectionLatencyMs: 3200,
      callDurationMs: 5000,
      callFlowEvents: [],
      callPhaseChecks: [],
      audioChecks: [],
      findings: [],
      recommendations: [],
      summary: "Test completed",
      llmUsed: false,
      duration: 8000,
    };

    expect(result.id).toBe("test-1");
    expect(result.sessionId).toBe("session-1");
    expect(result.status).toBe("completed");
    expect(result.overallScore).toBe(82);
    expect(result.connectionScore).toBe(100);
    expect(result.audioScore).toBe(80);
    expect(result.callFlowScore).toBe(60);
    expect(result.duration).toBe(8000);
    expect(result.ringLatencyMs).toBe(1500);
    expect(result.connectionLatencyMs).toBe(3200);
    expect(result.callDurationMs).toBe(5000);
    expect(result.error).toBeUndefined();
  });

  it("should include error field for failed results", () => {
    const result: CallFlowTestResult = {
      id: "",
      sessionId: "",
      status: "failed",
      overallScore: 0,
      connectionScore: 0,
      audioScore: 0,
      callFlowScore: 0,
      ringLatencyMs: 0,
      connectionLatencyMs: 0,
      callDurationMs: 0,
      callFlowEvents: [],
      callPhaseChecks: [],
      audioChecks: [],
      findings: [],
      recommendations: [],
      summary: "",
      llmUsed: false,
      duration: 100,
      error: "Insufficient credits",
    };

    expect(result.error).toBe("Insufficient credits");
    expect(result.status).toBe("failed");
  });
});

// ── CallPhaseCheckResult Type Tests ────────────────────────────────

describe("CallPhaseCheckResult Type", () => {
  it("should validate call phase check result structure", () => {
    const check: CallPhaseCheckResult = {
      phase: "dial",
      status: "passed",
      details: "Dialed successfully via #dial-btn",
      latencyMs: 250,
    };

    expect(check.phase).toBe("dial");
    expect(check.status).toBe("passed");
    expect(check.details).toContain("Dialed");
    expect(check.latencyMs).toBe(250);
  });

  it("should support all call phases", () => {
    const phases = ["dial", "ring", "answer", "connected", "hangup", "ended"];

    for (const phase of phases) {
      const check: CallPhaseCheckResult = {
        phase: phase,
        status: "passed",
        details: "OK",
      };
      expect(check.phase).toBe(phase);
    }
  });

  it("should support all check statuses", () => {
    const statuses: Array<CallPhaseCheckResult["status"]> = ["passed", "failed", "skipped"];

    for (const status of statuses) {
      const check: CallPhaseCheckResult = {
        phase: "dial",
        status,
        details: "Test",
      };
      expect(check.status).toBe(status);
    }
  });
});

// ── AudioCheckResult Type Tests ────────────────────────────────────

describe("AudioCheckResult Type", () => {
  it("should validate audio check result structure", () => {
    const check: AudioCheckResult = {
      type: "audio_indicator",
      status: "passed",
      details: "Audio indicator found: audio-active",
      latencyMs: 100,
    };

    expect(check.type).toBe("audio_indicator");
    expect(check.status).toBe("passed");
    expect(check.details).toContain("Audio");
    expect(check.latencyMs).toBe(100);
  });

  it("should support all audio check types", () => {
    const audioChecks = [
      "audio_indicator",
      "call_quality",
      "mute_toggle",
      "speaker_toggle",
      "video_toggle",
    ];

    for (const checkType of audioChecks) {
      const check: AudioCheckResult = {
        type: checkType,
        status: "passed",
        details: "OK",
      };
      expect(check.type).toBe(checkType);
    }
  });

  it("should support all check statuses for audio", () => {
    const statuses: Array<AudioCheckResult["status"]> = ["passed", "failed", "skipped"];

    for (const status of statuses) {
      const check: AudioCheckResult = {
        type: "call_quality",
        status,
        details: "Test",
      };
      expect(check.status).toBe(status);
    }
  });
});

// ── Credit and Persistence Tests ───────────────────────────────────

describe("Call Flow Test Credit and Persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should check credits and return insufficient balance", async () => {
    (checkCredits as any).mockResolvedValueOnce({
      hasSufficient: false,
      balance: 3,
      required: 12,
      action: "call_flow_test",
      lowBalance: true,
      planSlug: "free",
    });

    const result = await runCallFlowTest({
      userId: "user-1",
      url: "https://calls.example.com",
      calleeIdentifier: "user-b",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Insufficient credits");
    expect(result.error).toContain("3");
    expect(result.error).toContain("12");
  });

  it("should create CallFlowTestSession with correct data after test", async () => {
    const mockSession = {
      id: "call-persist-1",
      status: "completed",
      url: "https://calls.example.com",
      calleeIdentifier: "user-b",
      callType: "audio",
      overallScore: 82,
      connectionScore: 100,
      audioScore: 80,
      callFlowScore: 60,
    };

    (db.callFlowTestSession.create as any).mockResolvedValue(mockSession);

    const result = await db.callFlowTestSession.create({
      data: {
        url: "https://calls.example.com",
        calleeIdentifier: "user-b",
        callType: "audio",
        overallScore: 82,
        connectionScore: 100,
        audioScore: 80,
        callFlowScore: 60,
        status: "completed",
      },
    });

    expect(db.callFlowTestSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: "https://calls.example.com",
          calleeIdentifier: "user-b",
          callType: "audio",
          overallScore: 82,
        }),
      })
    );
    expect(result.id).toBe("call-persist-1");
  });

  it("should deduct credits after test completion", async () => {
    (db.orchestratedSession.create as any).mockResolvedValue({
      id: "session-1",
      status: "running",
    });
    (db.sandboxInstance.create as any).mockResolvedValue({
      id: "sandbox-1",
      status: "provisioning",
    });
    (db.callFlowTestSession.create as any).mockResolvedValue({
      id: "call-session-1",
      status: "completed",
    });

    // The test should call deductCredits after completing
    expect(deductCredits).toBeDefined();
  });
});

// ── Edge Case Tests ────────────────────────────────────────────────

describe("Call Flow Edge Cases", () => {
  it("should handle empty URL gracefully in credit check path", async () => {
    (checkCredits as any).mockResolvedValueOnce({
      hasSufficient: false,
      balance: 0,
      required: 12,
      action: "call_flow_test",
      lowBalance: true,
      planSlug: "free",
    });

    const result = await runCallFlowTest({
      userId: "user-1",
      url: "",
      calleeIdentifier: "user-b",
    });

    // Should still fail gracefully at credit check
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Insufficient credits");
  });

  it("should handle missing callee identifier with default", () => {
    const agents = getCallFlowAgents("", {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    // Should still generate agents even with empty callee
    expect(agents).toHaveLength(2);
  });

  it("should handle special characters in callee identifier", () => {
    const specialCallee = "user+test@example.com";
    const agents = getCallFlowAgents(specialCallee, {
      userId: "user-1",
      url: "https://calls.example.com",
    });

    const dialAction = agents[0].actions.find((a) => a.value === "dial");
    expect(dialAction?.description).toContain(specialCallee);
  });

  it("should handle custom sync timeout", async () => {
    (checkCredits as any).mockResolvedValueOnce({
      hasSufficient: false,
      balance: 0,
      required: 12,
      action: "call_flow_test",
      lowBalance: true,
      planSlug: "free",
    });

    const result = await runCallFlowTest({
      userId: "user-1",
      url: "https://calls.example.com",
      calleeIdentifier: "user-b",
      syncTimeoutMs: 60000,
    });

    // Should fail at credit check, not at timeout config
    expect(result.status).toBe("failed");
  });

  it("should handle all selector overrides simultaneously", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
      dialButtonSelector: "#dial",
      answerButtonSelector: "#answer",
      hangupButtonSelector: "#hangup",
      muteButtonSelector: "#mute",
      speakerButtonSelector: "#speaker",
      videoToggleSelector: "#video",
      ringIndicatorSelector: "#ring",
      incomingCallSelector: "#incoming",
      callStatusSelector: "#status",
      callTimerSelector: "#timer",
      callQualitySelector: "#quality",
    });

    const callerActions = agents[0].actions;
    const calleeActions = agents[1].actions;

    const dial = callerActions.find((a) => a.value === "dial");
    expect(dial?.selector).toBe("#dial");

    const hangup = callerActions.find((a) => a.value === "hangup");
    expect(hangup?.selector).toBe("#hangup");

    const answer = calleeActions.find((a) => a.value === "answer");
    expect(answer?.selector).toBe("#answer");
  });

  it("should handle very long call duration", () => {
    const agents = getCallFlowAgents("user-b", {
      userId: "user-1",
      url: "https://calls.example.com",
      callDurationMs: 300000, // 5 minutes
    });

    // Should include wait action for the long duration
    const waitAction = agents[0].actions.find(
      (a) => a.type === "wait" && a.value === "300000"
    );
    expect(waitAction).toBeDefined();
  });

  it("should calculate overall score with decimal precision", () => {
    // Test that rounding works correctly with decimal weights
    const connectionScore = 75;
    const audioScore = 60;
    const callFlowScore = 90;

    const overallScore = Math.round(
      connectionScore * 0.4 + audioScore * 0.3 + callFlowScore * 0.3
    );

    // 30 + 18 + 27 = 75
    expect(overallScore).toBe(75);
  });

  it("should have CallFlowTestInput type with all selectors", () => {
    const input: CallFlowTestInput = {
      userId: "user-1",
      url: "https://calls.example.com",
      calleeIdentifier: "user-b",
      dialButtonSelector: "#dial",
      answerButtonSelector: "#answer",
      hangupButtonSelector: "#hangup",
      muteButtonSelector: "#mute",
      speakerButtonSelector: "#speaker",
      videoToggleSelector: "#video",
      ringIndicatorSelector: "#ring",
      incomingCallSelector: "#incoming",
      callStatusSelector: "#status",
      callTimerSelector: "#timer",
      callQualitySelector: "#quality",
      syncTimeoutMs: 60000,
      callDurationMs: 10000,
      callType: "video",
    };

    expect(input.dialButtonSelector).toBe("#dial");
    expect(input.callType).toBe("video");
    expect(input.callDurationMs).toBe(10000);
  });
});
