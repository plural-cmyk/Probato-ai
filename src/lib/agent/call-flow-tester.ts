/**
 * Voice/Video Call Flow Tester (M27)
 *
 * Tests voice/video call flows across two browser sandboxes:
 *   - Caller agent: initiates a call, verifies ring/connected state,
 *     toggles mute, checks call quality, then hangs up
 *   - Callee agent: detects incoming call, answers, verifies connected
 *     state, toggles speaker, checks audio indicators
 *
 * Architecture:
 *   - Builds on M25 Multi-Sandbox Orchestrator for browser provisioning & sync
 *   - Uses DB-backed SyncEvent bus for cross-agent coordination
 *   - Concrete call action handlers replace the "custom" no-ops from M25
 *   - 3-tier LLM analysis for call-specific insights
 *   - Safe payload: benign marker strings only (never real exploits)
 *
 * Call actions implemented:
 *   - dial: click dial/call button and enter callee identifier
 *   - answer: click answer/accept button
 *   - hangup: click hangup/end-call button
 *   - verify_ring: check ring indicator element
 *   - verify_incoming_call: check incoming call UI element
 *   - verify_call_connected: check call status for connected/active
 *   - verify_call_ended: check call status for ended/idle
 *   - verify_call_timer: check call timer element exists
 *   - verify_call_quality: check call quality indicator
 *   - verify_audio_indicator: check audio/speaker indicator
 *   - toggle_mute: click mute/unmute button
 *   - toggle_speaker: click speaker toggle button
 *   - toggle_video: click video toggle button
 */

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { checkCredits, deductCredits } from "@/lib/billing/credits";
import { getBrowserInstance, cleanupBrowser } from "@/lib/browser/chromium";
import type { Page, Browser } from "puppeteer-core";
import {
  runOrchestratedSession,
  abortOrchestratedSession,
  type OrchestratorInput,
  type AgentConfig,
  type AgentAction,
  type Finding,
} from "@/lib/agent/multi-device-orchestrator";

// ── Types ──────────────────────────────────────────────────────

export interface CallFlowTestInput {
  projectId?: string;
  userId: string;
  url: string;
  testRunId?: string;
  /** Identifier for the callee (default: PROBATO_CALLEE_2024) */
  calleeIdentifier?: string;
  /** CSS selector for the dial/call button */
  dialButtonSelector?: string;
  /** CSS selector for the answer/accept button */
  answerButtonSelector?: string;
  /** CSS selector for the hangup/end-call button */
  hangupButtonSelector?: string;
  /** CSS selector for the mute/unmute button */
  muteButtonSelector?: string;
  /** CSS selector for the speaker toggle button */
  speakerButtonSelector?: string;
  /** CSS selector for the video toggle button */
  videoToggleSelector?: string;
  /** CSS selector for the ring indicator element */
  ringIndicatorSelector?: string;
  /** CSS selector for the call status element */
  callStatusSelector?: string;
  /** CSS selector for the call timer element */
  callTimerSelector?: string;
  /** CSS selector for the incoming call indicator */
  incomingCallSelector?: string;
  /** CSS selector for the call quality indicator */
  callQualitySelector?: string;
  /** Sync timeout in ms (default 30000) */
  syncTimeoutMs?: number;
  /** How long to stay in the call in ms (default 5000) */
  callDurationMs?: number;
  /** Type of call to test (default "audio") */
  callType?: "audio" | "video" | "screen_share";
}

export interface CallPhaseCheckResult {
  phase: string;
  status: "passed" | "failed" | "skipped";
  details: string;
  latencyMs?: number;
}

export interface AudioCheckResult {
  type: string;
  status: "passed" | "failed" | "skipped";
  details: string;
  latencyMs?: number;
}

export interface CallEvent {
  timestamp: number;
  agent: string;
  action: string;
  details: string;
}

export interface CallFlowTestResult {
  id: string;
  sessionId: string;
  status: "completed" | "failed";
  overallScore: number;
  connectionScore: number;
  audioScore: number;
  callFlowScore: number;
  ringLatencyMs: number;
  connectionLatencyMs: number;
  callDurationMs: number;
  callFlowEvents: CallEvent[];
  callPhaseChecks: CallPhaseCheckResult[];
  audioChecks: AudioCheckResult[];
  findings: Finding[];
  recommendations: string[];
  summary: string;
  llmUsed: boolean;
  duration: number;
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────

/** Benign test callee identifier — never a real phone number */
const DEFAULT_CALLEE_IDENTIFIER = "PROBATO_CALLEE_2024";

/** Common CSS selectors for dial/call buttons across popular frameworks */
const DIAL_BUTTON_SELECTORS = [
  '[data-testid="dial-button"]',
  '[data-testid="call-button"]',
  'button[aria-label*="call" i]',
  'button[aria-label*="dial" i]',
  'button[class*="call-btn"]',
  'button[class*="dial-btn"]',
  '[class*="start-call"]',
  '[class*="make-call"]',
  'button svg[class*="phone"]',
  ".call-button",
  ".dial-button",
];

const ANSWER_BUTTON_SELECTORS = [
  '[data-testid="answer-button"]',
  '[data-testid="accept-button"]',
  'button[aria-label*="answer" i]',
  'button[aria-label*="accept" i]',
  'button[aria-label*="accept call" i]',
  'button[class*="answer-btn"]',
  'button[class*="accept-btn"]',
  '[class*="accept-call"]',
  '[class*="answer-call"]',
  ".answer-button",
  ".accept-button",
];

const HANGUP_BUTTON_SELECTORS = [
  '[data-testid="hangup-button"]',
  '[data-testid="end-call-button"]',
  'button[aria-label*="hang up" i]',
  'button[aria-label*="end call" i]',
  'button[aria-label*="end" i]',
  'button[class*="hangup-btn"]',
  'button[class*="end-call-btn"]',
  '[class*="end-call"]',
  '[class*="hang-up"]',
  ".hangup-button",
  ".end-call-button",
];

const RING_INDICATOR_SELECTORS = [
  '[data-testid="ring-indicator"]',
  '[data-testid="ringing-indicator"]',
  ".ring-indicator",
  ".ringing-indicator",
  '[class*="ringing"]',
  '[class*="ring-indicator"]',
  '[aria-label*="ringing" i]',
  '[class*="incoming-ring"]',
];

const CALL_STATUS_SELECTORS = [
  '[data-testid="call-status"]',
  '[data-testid="call-state"]',
  ".call-status",
  ".call-state",
  '[class*="call-status"]',
  '[class*="call-state"]',
  '[aria-label*="call status" i]',
  '[class*="connection-status"]',
];

const MUTE_BUTTON_SELECTORS = [
  '[data-testid="mute-button"]',
  '[data-testid="mic-toggle"]',
  'button[aria-label*="mute" i]',
  'button[aria-label*="unmute" i]',
  'button[aria-label*="microphone" i]',
  'button[class*="mute-btn"]',
  'button[class*="mic-toggle"]',
  '[class*="mute-button"]',
  '[class*="mic-button"]',
  ".mute-button",
];

const SPEAKER_BUTTON_SELECTORS = [
  '[data-testid="speaker-button"]',
  '[data-testid="speaker-toggle"]',
  'button[aria-label*="speaker" i]',
  'button[aria-label*="speakerphone" i]',
  'button[class*="speaker-btn"]',
  'button[class*="speaker-toggle"]',
  '[class*="speaker-button"]',
  ".speaker-button",
];

const VIDEO_TOGGLE_SELECTORS = [
  '[data-testid="video-toggle"]',
  '[data-testid="camera-toggle"]',
  'button[aria-label*="video" i]',
  'button[aria-label*="camera" i]',
  'button[class*="video-toggle"]',
  'button[class*="camera-toggle"]',
  '[class*="video-button"]',
  '[class*="camera-button"]',
  ".video-toggle",
];

const INCOMING_CALL_SELECTORS = [
  '[data-testid="incoming-call"]',
  '[data-testid="incoming-call-indicator"]',
  ".incoming-call",
  ".incoming-call-indicator",
  '[class*="incoming-call"]',
  '[class*="call-incoming"]',
  '[aria-label*="incoming call" i]',
  '[class*="ringing-call"]',
];

const CALL_QUALITY_SELECTORS = [
  '[data-testid="call-quality"]',
  '[data-testid="quality-indicator"]',
  ".call-quality",
  ".quality-indicator",
  '[class*="call-quality"]',
  '[class*="quality-indicator"]',
  '[aria-label*="quality" i]',
  '[class*="signal-strength"]',
  '[class*="network-quality"]',
];

const CALL_TIMER_SELECTORS = [
  '[data-testid="call-timer"]',
  '[data-testid="call-duration"]',
  ".call-timer",
  ".call-duration",
  '[class*="call-timer"]',
  '[class*="call-duration"]',
  '[class*="timer"]',
  '[aria-label*="call duration" i]',
  '[aria-label*="call timer" i]',
];

// ── Main Entry Point ──────────────────────────────────────────

export async function runCallFlowTest(
  input: CallFlowTestInput
): Promise<CallFlowTestResult> {
  const startTime = Date.now();
  const calleeIdentifier = input.calleeIdentifier ?? DEFAULT_CALLEE_IDENTIFIER;
  const callDurationMs = input.callDurationMs ?? 5000;

  const emptyResult = (): CallFlowTestResult => ({
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
    duration: Date.now() - startTime,
    error: "Call flow test failed to initialize",
  });

  // 1. Check credits
  const creditCheck = await checkCredits(input.userId, "call_flow_test");
  if (!creditCheck.hasSufficient) {
    return {
      ...emptyResult(),
      error: `Insufficient credits. Need 12, have ${creditCheck.balance}.`,
    };
  }

  // 2. Build call-specific agent configs
  const agents = getCallFlowAgents(calleeIdentifier, input);

  // 3. Run orchestrated session
  const orchestratorInput: OrchestratorInput = {
    projectId: input.projectId,
    userId: input.userId,
    url: input.url,
    testRunId: input.testRunId,
    scenarioType: "call",
    agents,
    maxConcurrentBrowsers: 2,
    syncTimeoutMs: input.syncTimeoutMs ?? 30000,
  };

  let sessionResult;
  try {
    sessionResult = await runOrchestratedSession(orchestratorInput);
  } catch (err: unknown) {
    return {
      ...emptyResult(),
      error: `Orchestrated session failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Analyze call-specific results
  const callFlowEvents = extractCallFlowEvents(sessionResult.agentResults);
  const callPhaseChecks = analyzeCallPhases(sessionResult.agentResults, calleeIdentifier);
  const audioChecks = analyzeAudioQuality(sessionResult.agentResults);

  // 5. Calculate scores
  const connectionScore = calculateCategoryScore(callPhaseChecks);
  const audioScore = calculateCategoryScore(audioChecks);
  const callFlowScore = calculateCategoryScore(
    callPhaseChecks.filter((c) => ["dial", "ring", "answer", "connected", "hangup", "ended"].includes(c.phase))
  );
  const overallScore = Math.round(
    connectionScore * 0.4 + audioScore * 0.3 + callFlowScore * 0.3
  );

  // 6. Measure latencies
  const { ringLatencyMs, connectionLatencyMs } = extractCallLatency(callPhaseChecks);

  // 7. LLM analysis for call-specific insights
  let summary = "";
  let llmUsed = false;
  let callFlowFindings: Finding[] = [];

  try {
    const llmResult = await callLLMForCallAnalysis(
      input.url,
      calleeIdentifier,
      callPhaseChecks,
      audioChecks,
      callFlowEvents
    );
    summary = llmResult.summary;
    callFlowFindings = llmResult.findings;
    llmUsed = true;
  } catch {
    summary = generateCallFlowSummary(connectionScore, audioScore, callFlowScore, callPhaseChecks);
  }

  // 8. Combine findings
  const findings = [
    ...sessionResult.findings,
    ...callFlowFindings,
    ...generateCallFlowFindings(callPhaseChecks, audioChecks),
  ];

  const recommendations = [
    ...sessionResult.recommendations,
    ...generateCallFlowRecommendations(callPhaseChecks, audioChecks),
  ];

  // 9. Create CallFlowTestSession record
  let callFlowSession;
  try {
    callFlowSession = await db.callFlowTestSession.create({
      data: {
        status: sessionResult.status === "completed" ? "completed" : "failed",
        url: input.url,
        calleeIdentifier,
        callType: input.callType ?? "audio",
        ringLatencyMs,
        connectionLatencyMs,
        callDurationMs,
        callFlowEvents,
        callPhaseChecks,
        audioChecks,
        overallScore,
        connectionScore,
        audioScore,
        callFlowScore,
        findings,
        recommendations,
        llmUsed,
        duration: Date.now() - startTime,
        error: sessionResult.error,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        userId: input.userId,
        projectId: input.projectId ?? null,
        testRunId: input.testRunId ?? null,
        orchestratedSessionId: sessionResult.sessionId,
      },
    });
  } catch (err: unknown) {
    // If we can't persist, still return the result
    console.error("Failed to create CallFlowTestSession:", err);
  }

  // 10. Deduct credits
  await deductCredits(
    input.userId,
    "call_flow_test",
    callFlowSession?.id ?? sessionResult.sessionId,
    "call_flow_test_session"
  );

  return {
    id: callFlowSession?.id ?? "",
    sessionId: sessionResult.sessionId,
    status: sessionResult.status === "completed" ? "completed" : "failed",
    overallScore,
    connectionScore,
    audioScore,
    callFlowScore,
    ringLatencyMs,
    connectionLatencyMs,
    callDurationMs,
    callFlowEvents,
    callPhaseChecks,
    audioChecks,
    findings,
    recommendations,
    summary,
    llmUsed,
    duration: Date.now() - startTime,
    error: sessionResult.error,
  };
}

// ── Agent Configuration ────────────────────────────────────────

export function getCallFlowAgents(
  calleeIdentifier: string,
  input: CallFlowTestInput
): AgentConfig[] {
  const callDurationMs = input.callDurationMs ?? 5000;

  return [
    {
      role: "caller",
      actions: [
        {
          type: "navigate",
          value: "{{url}}",
          description: "Navigate to calling app",
        },
        {
          type: "barrier",
          value: "call_ready",
          description: "Wait for both agents to be ready",
        },
        {
          type: "custom",
          value: "dial",
          selector: input.dialButtonSelector,
          description: `Dial callee: "${calleeIdentifier}"`,
        },
        {
          type: "signal",
          value: "call_dialed",
          description: "Signal that call has been dialed",
        },
        {
          type: "waitForSignal",
          selector: "caller",
          description: "Wait for callee to answer",
        },
        {
          type: "custom",
          value: "verify_call_connected",
          selector: input.callStatusSelector,
          description: "Verify call is in connected/active state",
        },
        {
          type: "custom",
          value: "verify_call_timer",
          selector: input.callTimerSelector,
          description: "Verify call timer is displayed",
        },
        {
          type: "wait",
          value: String(callDurationMs),
          description: `Stay in call for ${callDurationMs}ms`,
        },
        {
          type: "custom",
          value: "toggle_mute",
          selector: input.muteButtonSelector,
          description: "Toggle mute on/off",
        },
        {
          type: "wait",
          value: "1000",
          description: "Wait 1 second with mute on",
        },
        {
          type: "custom",
          value: "toggle_mute",
          selector: input.muteButtonSelector,
          description: "Toggle mute back off",
        },
        {
          type: "custom",
          value: "verify_call_quality",
          selector: input.callQualitySelector,
          description: "Verify call quality indicator",
        },
        {
          type: "signal",
          value: "call_ending",
          description: "Signal that call is about to end",
        },
        {
          type: "waitForSignal",
          selector: "caller",
          description: "Wait for hangup confirmation from callee",
        },
        {
          type: "custom",
          value: "hangup",
          selector: input.hangupButtonSelector,
          description: "Hang up the call",
        },
        {
          type: "custom",
          value: "verify_call_ended",
          selector: input.callStatusSelector,
          description: "Verify call has ended",
        },
        {
          type: "screenshot",
          description: "Capture caller final state",
        },
      ],
      description: "Agent that initiates calls and verifies call flow",
    },
    {
      role: "callee",
      actions: [
        {
          type: "navigate",
          value: "{{url}}",
          description: "Navigate to calling app",
        },
        {
          type: "barrier",
          value: "call_ready",
          description: "Wait for both agents to be ready",
        },
        {
          type: "custom",
          value: "verify_incoming_call",
          selector: input.incomingCallSelector,
          description: "Verify incoming call UI is displayed",
        },
        {
          type: "waitForSignal",
          selector: "callee",
          description: "Wait for caller to dial",
        },
        {
          type: "custom",
          value: "answer",
          selector: input.answerButtonSelector,
          description: "Answer the incoming call",
        },
        {
          type: "signal",
          value: "call_answered",
          description: "Signal that call has been answered",
        },
        {
          type: "waitForSignal",
          selector: "callee",
          description: "Wait for call ending signal from caller",
        },
        {
          type: "custom",
          value: "verify_call_connected",
          selector: input.callStatusSelector,
          description: "Verify call is in connected state",
        },
        {
          type: "custom",
          value: "toggle_speaker",
          selector: input.speakerButtonSelector,
          description: "Toggle speaker on/off",
        },
        {
          type: "wait",
          value: "500",
          description: "Wait 500ms with speaker toggled",
        },
        {
          type: "custom",
          value: "toggle_speaker",
          selector: input.speakerButtonSelector,
          description: "Toggle speaker back",
        },
        {
          type: "custom",
          value: "verify_audio_indicator",
          selector: input.callQualitySelector,
          description: "Verify audio indicator is visible",
        },
        {
          type: "screenshot",
          description: "Capture callee final state",
        },
      ],
      description: "Agent that receives calls and verifies incoming call flow",
    },
  ];
}

// ── Call Action Handlers ───────────────────────────────────────
// These are executed by the orchestrator's executeAction() when it
// encounters type="custom" actions. The orchestrator delegates to
// handleCallCustomAction() which we export.

export async function handleCallCustomAction(
  page: Page,
  action: AgentAction,
  sessionId: string,
  agentRole: string,
  syncTimeoutMs: number
): Promise<{ evidence?: string }> {
  switch (action.value) {
    case "dial":
      return dialCall(page, action, sessionId, agentRole);
    case "answer":
      return answerCall(page, action);
    case "hangup":
      return hangupCall(page, action);
    case "verify_ring":
      return verifyRingIndicator(page, action);
    case "verify_incoming_call":
      return verifyIncomingCall(page, action);
    case "verify_call_connected":
      return verifyCallConnected(page, action);
    case "verify_call_ended":
      return verifyCallEnded(page, action);
    case "verify_call_timer":
      return verifyCallTimer(page, action);
    case "verify_call_quality":
      return verifyCallQuality(page, action);
    case "verify_audio_indicator":
      return verifyAudioIndicator(page, action);
    case "toggle_mute":
      return toggleMute(page, action);
    case "toggle_speaker":
      return toggleSpeaker(page, action);
    case "toggle_video":
      return toggleVideo(page, action);
    default:
      return { evidence: `Unknown call action: ${action.value}` };
  }
}

async function dialCall(
  page: Page,
  action: AgentAction,
  sessionId: string,
  agentRole: string
): Promise<{ evidence: string }> {
  const calleeIdentifier = action.description?.replace(/^Dial callee:\s*/, "").replace(/^"/, "").replace(/"$/, "") ?? DEFAULT_CALLEE_IDENTIFIER;
  const selectors = action.selector
    ? [action.selector]
    : DIAL_BUTTON_SELECTORS;

  // Try each selector to find the dial/call button
  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout: 3000 });
      if (el) {
        await el.click();
        // Wait for dial pad or input to appear
        await new Promise((r) => setTimeout(r, 500));

        // Try to find a dial input/phone number field to type the callee identifier
        const dialInputSelectors = [
          'input[data-testid="dial-input"]',
          'input[placeholder*="phone" i]',
          'input[placeholder*="number" i]',
          'input[placeholder*="name" i]',
          'input[placeholder*="call" i]',
          'input[type="tel"]',
          'input[class*="dial-input"]',
          'input[class*="phone-input"]',
          "#dial-input",
          "#phone-input",
          'input',
        ];

        let typed = false;
        for (const inputSel of dialInputSelectors) {
          try {
            const inputEl = await page.$(inputSel);
            if (inputEl) {
              await inputEl.click({ clickCount: 3 });
              await inputEl.type(calleeIdentifier, { delay: 30 });
              typed = true;
              break;
            }
          } catch {
            continue;
          }
        }

        // If we found and typed in an input, press Enter or click call button again
        if (typed) {
          await page.keyboard.press("Enter");
        }

        // Record the dial time in sync event for latency measurement
        await db.syncEvent.create({
          data: {
            sessionId,
            eventType: "state_update",
            sourceAgent: agentRole,
            targetAgent: null,
            payload: {
              stateKey: "call_dialed_at",
              stateValue: Date.now(),
              calleeIdentifier,
            },
          },
        });

        return { evidence: `Dialed callee "${calleeIdentifier}" via ${selector}${typed ? " with input" : " directly"}` };
      }
    } catch {
      continue; // try next selector
    }
  }

  // Fallback: try typing callee identifier in any visible input, then pressing Enter
  try {
    const inputEl = await page.waitForSelector('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="number" i]', { timeout: 3000 });
    if (inputEl) {
      await inputEl.click({ clickCount: 3 });
      await inputEl.type(calleeIdentifier, { delay: 30 });
      await page.keyboard.press("Enter");

      await db.syncEvent.create({
        data: {
          sessionId,
          eventType: "state_update",
          sourceAgent: agentRole,
          targetAgent: null,
          payload: {
            stateKey: "call_dialed_at",
            stateValue: Date.now(),
            calleeIdentifier,
          },
        },
      });

      return { evidence: `Dialed callee "${calleeIdentifier}" via fallback input` };
    }
  } catch { /* fall through */ }

  throw new Error("Could not find dial/call button element to initiate call");
}

async function answerCall(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : ANSWER_BUTTON_SELECTORS;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout: 5000 });
      if (el) {
        await el.click();
        // Wait a moment for call to connect
        await new Promise((r) => setTimeout(r, 1000));
        return { evidence: `Answered incoming call via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  // Fallback: try clicking any green/accept button
  try {
    const el = await page.waitForSelector('button[class*="accept"], button[class*="green"], button[class*="answer"]', { timeout: 3000 });
    if (el) {
      await el.click();
      await new Promise((r) => setTimeout(r, 1000));
      return { evidence: "Answered call via fallback accept button" };
    }
  } catch { /* fall through */ }

  throw new Error("Could not find answer/accept button to answer incoming call");
}

async function hangupCall(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : HANGUP_BUTTON_SELECTORS;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout: 3000 });
      if (el) {
        await el.click();
        // Wait a moment for call to end
        await new Promise((r) => setTimeout(r, 500));
        return { evidence: `Hung up call via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  // Fallback: try red/end button
  try {
    const el = await page.waitForSelector('button[class*="end-call"], button[class*="red"], button[class*="hangup"]', { timeout: 3000 });
    if (el) {
      await el.click();
      await new Promise((r) => setTimeout(r, 500));
      return { evidence: "Hung up call via fallback end-call button" };
    }
  } catch { /* fall through */ }

  throw new Error("Could not find hangup/end-call button to end call");
}

async function verifyRingIndicator(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : RING_INDICATOR_SELECTORS;

  const timeout = action.timeout ?? 8000;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout });
      if (el) {
        const text = await page.evaluate((sel: string) => {
          const indicator = document.querySelector(sel);
          return indicator?.textContent?.trim().substring(0, 200) ?? "";
        }, selector);

        return { evidence: `Ring indicator found: "${text}" via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  // Ring indicator not found — caller may have already connected
  return { evidence: "No ring indicator found (call may have already connected)" };
}

async function verifyIncomingCall(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : INCOMING_CALL_SELECTORS;

  const timeout = action.timeout ?? 10000;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout });
      if (el) {
        const text = await page.evaluate((sel: string) => {
          const indicator = document.querySelector(sel);
          return indicator?.textContent?.trim().substring(0, 200) ?? "";
        }, selector);

        return { evidence: `Incoming call indicator found: "${text}" via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  // Not finding an incoming call indicator is not necessarily a failure if call already connected
  return { evidence: "No incoming call indicator found (may have been auto-answered or call already connected)" };
}

async function verifyCallConnected(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : CALL_STATUS_SELECTORS;

  const timeout = action.timeout ?? 10000;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout });
      if (el) {
        const statusText = await page.evaluate((sel: string) => {
          const status = document.querySelector(sel);
          return (
            status?.textContent?.trim() ??
            status?.getAttribute("aria-label") ??
            status?.getAttribute("title") ??
            status?.className ??
            ""
          );
        }, selector);

        const isConnected = /connected|active|in.call|ongoing|on.call/i.test(statusText);
        return {
          evidence: `Call status found: ${isConnected ? "connected" : statusText || "unknown"} via ${selector}`,
        };
      }
    } catch {
      continue;
    }
  }

  // Fallback: check page body for connected/active text
  try {
    const bodyHasConnected = await page.evaluate(() => {
      const body = document.body.innerText;
      return /connected|active call|in call|ongoing/i.test(body);
    });
    if (bodyHasConnected) {
      return { evidence: "Call appears connected based on page content" };
    }
  } catch { /* fall through */ }

  throw new Error("Could not verify call is connected — no connected/active status found");
}

async function verifyCallEnded(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : CALL_STATUS_SELECTORS;

  const timeout = action.timeout ?? 5000;

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const statusText = await page.evaluate((sel: string) => {
          const status = document.querySelector(sel);
          return (
            status?.textContent?.trim() ??
            status?.getAttribute("aria-label") ??
            status?.getAttribute("title") ??
            status?.className ??
            ""
          );
        }, selector);

        const isEnded = /ended|idle|disconnected|call.ended|call.finished/i.test(statusText);
        return {
          evidence: `Call status after hangup: ${isEnded ? "ended" : statusText || "unknown"} via ${selector}`,
        };
      }
    } catch {
      continue;
    }
  }

  // Fallback: check page body for ended/idle text
  try {
    const bodyHasEnded = await page.evaluate(() => {
      const body = document.body.innerText;
      return /call ended|disconnected|idle|call finished/i.test(body);
    });
    if (bodyHasEnded) {
      return { evidence: "Call appears ended based on page content" };
    }
  } catch { /* fall through */ }

  // Not critical — the call UI may have changed after hangup
  return { evidence: "Could not confirm call ended status (UI may have transitioned away from call view)" };
}

async function verifyCallTimer(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : CALL_TIMER_SELECTORS;

  const timeout = action.timeout ?? 5000;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout });
      if (el) {
        const timerText = await page.evaluate((sel: string) => {
          const timer = document.querySelector(sel);
          return timer?.textContent?.trim() ?? "";
        }, selector);

        return { evidence: `Call timer found: "${timerText}" via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  // Not finding a timer is not critical — some apps don't show one
  return { evidence: "No call timer element found (app may not display call duration)" };
}

async function verifyCallQuality(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : CALL_QUALITY_SELECTORS;

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const qualityText = await page.evaluate((sel: string) => {
          const quality = document.querySelector(sel);
          return (
            quality?.textContent?.trim() ??
            quality?.getAttribute("aria-label") ??
            quality?.getAttribute("title") ??
            quality?.className ??
            ""
          );
        }, selector);

        const isGood = /excellent|good|high|hd/i.test(qualityText);
        return {
          evidence: `Call quality indicator found: ${isGood ? "good" : qualityText || "unknown"} via ${selector}`,
        };
      }
    } catch {
      continue;
    }
  }

  return { evidence: "No call quality indicator found (app may not display quality level)" };
}

async function verifyAudioIndicator(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : [...CALL_QUALITY_SELECTORS, ...SPEAKER_BUTTON_SELECTORS];

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const indicatorText = await page.evaluate((sel: string) => {
          const indicator = document.querySelector(sel);
          return (
            indicator?.textContent?.trim() ??
            indicator?.getAttribute("aria-label") ??
            indicator?.className ??
            ""
          );
        }, selector);

        return { evidence: `Audio indicator found: "${indicatorText.substring(0, 100)}" via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  return { evidence: "No audio/speaker indicator found" };
}

async function toggleMute(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : MUTE_BUTTON_SELECTORS;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout: 3000 });
      if (el) {
        // Check current mute state before clicking
        const beforeState = await page.evaluate((sel: string) => {
          const btn = document.querySelector(sel);
          return (
            btn?.getAttribute("aria-pressed") ??
            btn?.getAttribute("aria-label") ??
            btn?.className ??
            ""
          );
        }, selector);

        await el.click();
        await new Promise((r) => setTimeout(r, 300));

        // Check state after clicking
        const afterState = await page.evaluate((sel: string) => {
          const btn = document.querySelector(sel);
          return (
            btn?.getAttribute("aria-pressed") ??
            btn?.getAttribute("aria-label") ??
            btn?.className ??
            ""
          );
        }, selector);

        const wasMuted = /mute|muted|off/i.test(beforeState);
        const nowMuted = /mute|muted|off/i.test(afterState);
        const toggled = wasMuted !== nowMuted;

        return {
          evidence: `Toggled mute via ${selector} — ${toggled ? "state changed" : "clicked"} (before: "${beforeState.substring(0, 50)}", after: "${afterState.substring(0, 50)}")`,
        };
      }
    } catch {
      continue;
    }
  }

  // Mute button not found — not critical for call flow
  return { evidence: "No mute button found (mute toggle skipped)" };
}

async function toggleSpeaker(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : SPEAKER_BUTTON_SELECTORS;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout: 3000 });
      if (el) {
        const beforeState = await page.evaluate((sel: string) => {
          const btn = document.querySelector(sel);
          return (
            btn?.getAttribute("aria-pressed") ??
            btn?.getAttribute("aria-label") ??
            btn?.className ??
            ""
          );
        }, selector);

        await el.click();
        await new Promise((r) => setTimeout(r, 300));

        const afterState = await page.evaluate((sel: string) => {
          const btn = document.querySelector(sel);
          return (
            btn?.getAttribute("aria-pressed") ??
            btn?.getAttribute("aria-label") ??
            btn?.className ??
            ""
          );
        }, selector);

        return {
          evidence: `Toggled speaker via ${selector} (before: "${beforeState.substring(0, 50)}", after: "${afterState.substring(0, 50)}")`,
        };
      }
    } catch {
      continue;
    }
  }

  return { evidence: "No speaker button found (speaker toggle skipped)" };
}

async function toggleVideo(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : VIDEO_TOGGLE_SELECTORS;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout: 3000 });
      if (el) {
        const beforeState = await page.evaluate((sel: string) => {
          const btn = document.querySelector(sel);
          return (
            btn?.getAttribute("aria-pressed") ??
            btn?.getAttribute("aria-label") ??
            btn?.className ??
            ""
          );
        }, selector);

        await el.click();
        await new Promise((r) => setTimeout(r, 300));

        const afterState = await page.evaluate((sel: string) => {
          const btn = document.querySelector(sel);
          return (
            btn?.getAttribute("aria-pressed") ??
            btn?.getAttribute("aria-label") ??
            btn?.className ??
            ""
          );
        }, selector);

        return {
          evidence: `Toggled video via ${selector} (before: "${beforeState.substring(0, 50)}", after: "${afterState.substring(0, 50)}")`,
        };
      }
    } catch {
      continue;
    }
  }

  return { evidence: "No video toggle button found (video toggle skipped)" };
}

// ── Analysis Functions ─────────────────────────────────────────

function extractCallFlowEvents(
  agentResults: Record<string, any>
): CallEvent[] {
  const events: CallEvent[] = [];

  for (const [role, result] of Object.entries(agentResults)) {
    if (!result?.actions) continue;

    for (const action of result.actions) {
      events.push({
        timestamp: Date.now() - (action.duration ?? 0),
        agent: role,
        action: action.type,
        details: action.evidence ?? action.error ?? "",
      });
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

function analyzeCallPhases(
  agentResults: Record<string, any>,
  calleeIdentifier: string
): CallPhaseCheckResult[] {
  const checks: CallPhaseCheckResult[] = [];
  const callerResult = agentResults.caller;
  const calleeResult = agentResults.callee;

  // Phase 1: Dial — caller initiated the call
  const dialAction = callerResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("Dialed callee")
  );
  checks.push({
    phase: "dial",
    status: dialAction?.status === "passed" ? "passed" : "failed",
    details: dialAction?.evidence ?? "Caller did not successfully dial",
    latencyMs: dialAction?.duration,
  });

  // Phase 2: Ring — ring indicator was detected (by caller side)
  const ringAction = callerResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("Ring indicator")
  );
  checks.push({
    phase: "ring",
    status: ringAction?.evidence?.includes("found") ? "passed" : "skipped",
    details: ringAction?.evidence ?? "Ring indicator not detected",
    latencyMs: ringAction?.duration,
  });

  // Phase 3: Incoming call — callee detected incoming call
  const incomingAction = calleeResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("Incoming call")
  );
  checks.push({
    phase: "answer",
    status: incomingAction?.evidence?.includes("found") ? "passed" : "skipped",
    details: incomingAction?.evidence ?? "Incoming call indicator not detected",
    latencyMs: incomingAction?.duration,
  });

  // Phase 4: Connected — both agents verified connected state
  const callerConnectedAction = callerResult?.actions?.find(
    (a: any) => a.type === "custom" && a.value === "verify_call_connected"
  );
  const calleeConnectedAction = calleeResult?.actions?.find(
    (a: any) => a.type === "custom" && a.value === "verify_call_connected"
  );

  const callerConnected = callerConnectedAction?.evidence?.includes("connected");
  const calleeConnected = calleeConnectedAction?.evidence?.includes("connected");

  checks.push({
    phase: "connected",
    status: callerConnected || calleeConnected ? "passed" : "failed",
    details: callerConnected
      ? `Caller verified connected: ${callerConnectedAction?.evidence}`
      : calleeConnected
      ? `Callee verified connected: ${calleeConnectedAction?.evidence}`
      : "Neither agent confirmed call connected state",
    latencyMs: callerConnectedAction?.duration ?? calleeConnectedAction?.duration,
  });

  // Phase 5: Call duration — call stayed active for intended duration
  const waitAction = callerResult?.actions?.find(
    (a: any) => a.type === "wait" && a.status === "passed"
  );
  checks.push({
    phase: "duration",
    status: waitAction?.status === "passed" ? "passed" : "failed",
    details: waitAction?.evidence ?? "Call did not remain active for intended duration",
    latencyMs: waitAction?.duration,
  });

  // Phase 6: Hangup — caller hung up successfully
  const hangupAction = callerResult?.actions?.find(
    (a: any) => a.type === "custom" && a.value === "hangup"
  );
  checks.push({
    phase: "hangup",
    status: hangupAction?.evidence?.includes("Hung up") ? "passed" : "failed",
    details: hangupAction?.evidence ?? "Caller did not successfully hang up",
    latencyMs: hangupAction?.duration,
  });

  // Phase 7: Ended — call ended state verified
  const endedAction = callerResult?.actions?.find(
    (a: any) => a.type === "custom" && a.value === "verify_call_ended"
  );
  checks.push({
    phase: "ended",
    status: endedAction?.evidence?.includes("ended") ? "passed" : "skipped",
    details: endedAction?.evidence ?? "Call ended state not verified",
    latencyMs: endedAction?.duration,
  });

  // Phase 8: Signal exchange — call_dialed and call_answered signals
  const dialSignalAction = callerResult?.actions?.find(
    (a: any) => a.type === "signal" && a.evidence?.includes("call_dialed")
  );
  checks.push({
    phase: "signal_dial",
    status: dialSignalAction?.status === "passed" ? "passed" : "failed",
    details: dialSignalAction?.evidence ?? "Call dialed signal not sent",
  });

  const answerSignalAction = calleeResult?.actions?.find(
    (a: any) => a.type === "signal" && a.evidence?.includes("call_answered")
  );
  checks.push({
    phase: "signal_answer",
    status: answerSignalAction?.status === "passed" ? "passed" : "failed",
    details: answerSignalAction?.evidence ?? "Call answered signal not sent",
  });

  return checks;
}

function analyzeAudioQuality(
  agentResults: Record<string, any>
): AudioCheckResult[] {
  const checks: AudioCheckResult[] = [];
  const callerResult = agentResults.caller;
  const calleeResult = agentResults.callee;

  // Check 1: Mute toggle by caller
  const muteActions = callerResult?.actions?.filter(
    (a: any) => a.type === "custom" && a.value === "toggle_mute"
  ) ?? [];
  const muteWorked = muteActions.some((a: any) => a.evidence?.includes("Toggled mute"));
  checks.push({
    type: "mute_toggle",
    status: muteWorked ? "passed" : "skipped",
    details: muteWorked
      ? `Mute toggle worked (${muteActions.length} toggles performed)`
      : "Mute toggle could not be verified",
    latencyMs: muteActions[0]?.duration,
  });

  // Check 2: Speaker toggle by callee
  const speakerActions = calleeResult?.actions?.filter(
    (a: any) => a.type === "custom" && a.value === "toggle_speaker"
  ) ?? [];
  const speakerWorked = speakerActions.some((a: any) => a.evidence?.includes("Toggled speaker"));
  checks.push({
    type: "speaker_toggle",
    status: speakerWorked ? "passed" : "skipped",
    details: speakerWorked
      ? `Speaker toggle worked (${speakerActions.length} toggles performed)`
      : "Speaker toggle could not be verified",
    latencyMs: speakerActions[0]?.duration,
  });

  // Check 3: Call quality indicator
  const qualityAction = callerResult?.actions?.find(
    (a: any) => a.type === "custom" && a.value === "verify_call_quality"
  );
  checks.push({
    type: "call_quality",
    status: qualityAction?.evidence?.includes("good") ? "passed" : "skipped",
    details: qualityAction?.evidence ?? "Call quality indicator not verified",
    latencyMs: qualityAction?.duration,
  });

  // Check 4: Audio indicator on callee side
  const audioAction = calleeResult?.actions?.find(
    (a: any) => a.type === "custom" && a.value === "verify_audio_indicator"
  );
  checks.push({
    type: "audio_indicator",
    status: audioAction?.evidence?.includes("found") ? "passed" : "skipped",
    details: audioAction?.evidence ?? "Audio indicator not verified",
    latencyMs: audioAction?.duration,
  });

  // Check 5: Call timer visible
  const timerAction = callerResult?.actions?.find(
    (a: any) => a.type === "custom" && a.value === "verify_call_timer"
  );
  checks.push({
    type: "call_timer",
    status: timerAction?.evidence?.includes("found") ? "passed" : "skipped",
    details: timerAction?.evidence ?? "Call timer not verified",
    latencyMs: timerAction?.duration,
  });

  return checks;
}

// ── Scoring ────────────────────────────────────────────────────

function calculateCategoryScore(
  checks: Array<{ status: string }>
): number {
  if (checks.length === 0) return 0;

  const passed = checks.filter((c) => c.status === "passed").length;
  const failed = checks.filter((c) => c.status === "failed").length;
  const skipped = checks.filter((c) => c.status === "skipped").length;

  // Passed = full credit, skipped = 50% credit, failed = 0%
  const weightedScore = passed * 1.0 + skipped * 0.5 + failed * 0;
  return Math.round((weightedScore / checks.length) * 100);
}

function extractCallLatency(
  checks: CallPhaseCheckResult[]
): { ringLatencyMs: number; connectionLatencyMs: number } {
  const ringCheck = checks.find((c) => c.phase === "ring");
  const connectedCheck = checks.find((c) => c.phase === "connected");

  return {
    ringLatencyMs: ringCheck?.latencyMs ?? 0,
    connectionLatencyMs: connectedCheck?.latencyMs ?? 0,
  };
}

// ── LLM Analysis ──────────────────────────────────────────────

async function callLLMForCallAnalysis(
  url: string,
  calleeIdentifier: string,
  callPhaseChecks: CallPhaseCheckResult[],
  audioChecks: AudioCheckResult[],
  callFlowEvents: CallEvent[]
): Promise<{ summary: string; findings: Finding[] }> {
  // Tier 1: z-ai-web-dev-sdk
  try {
    const zai = await ZAI.create();
    const prompt = `Analyze voice/video call flow test results for ${url}.

Callee Identifier: "${calleeIdentifier}"

Call Phase Checks: ${JSON.stringify(callPhaseChecks, null, 2)}
Audio Checks: ${JSON.stringify(audioChecks, null, 2)}
Call Flow Events: ${JSON.stringify(callFlowEvents, null, 2)}

Provide a JSON response with:
1. "summary": A 2-3 sentence summary of the call flow test outcome
2. "findings": Array of {type, severity (critical/high/medium/low/info), title, description, agents[], recommendation}

Focus on: call connection reliability, audio quality, ring latency, call phase transitions, and user experience quality.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a voice/video call systems testing analyst. Always respond with valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary ?? "",
        findings: parsed.findings ?? [],
      };
    }
  } catch { /* fall through */ }

  // Tier 2: External API
  const externalUrl = process.env.LLM_EXTERNAL_API_URL;
  const externalKey = process.env.LLM_EXTERNAL_API_KEY;
  if (externalUrl && externalKey) {
    try {
      const response = await fetch(externalUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${externalKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a voice/video call systems testing analyst. Always respond with valid JSON." },
            { role: "user", content: `Analyze call flow test for ${url}: phases=${JSON.stringify(callPhaseChecks)}, audio=${JSON.stringify(audioChecks)}` },
          ],
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary ?? "",
          findings: parsed.findings ?? [],
        };
      }
    } catch { /* fall through to rule-based */ }
  }

  // Tier 3: Rule-based fallback
  return {
    summary: generateCallFlowSummary(
      calculateCategoryScore(callPhaseChecks),
      calculateCategoryScore(audioChecks),
      calculateCategoryScore(callPhaseChecks.filter((c) => ["dial", "ring", "answer", "connected", "hangup", "ended"].includes(c.phase))),
      callPhaseChecks
    ),
    findings: [],
  };
}

function generateCallFlowSummary(
  connectionScore: number,
  audioScore: number,
  callFlowScore: number,
  callPhaseChecks: CallPhaseCheckResult[]
): string {
  const allPhasesPassed = callPhaseChecks
    .filter((c) => ["dial", "connected", "hangup"].includes(c.phase))
    .every((c) => c.status === "passed");
  const connStatus = allPhasesPassed
    ? "Call connection and flow verified successfully."
    : connectionScore >= 50
    ? "Call connection partially verified — some phases failed."
    : "Call connection verification failed — significant issues detected.";

  return (
    `Voice/video call flow test completed. ${connStatus} ` +
    `Connection score: ${connectionScore}/100, Audio score: ${audioScore}/100, ` +
    `Call flow score: ${callFlowScore}/100. ` +
    `${connectionScore >= 80 && audioScore >= 60 ? "Overall call health is good." : "Investigation recommended for failing call phases."}`
  );
}

function generateCallFlowFindings(
  callPhaseChecks: CallPhaseCheckResult[],
  audioChecks: AudioCheckResult[]
): Finding[] {
  const findings: Finding[] = [];

  // Failed call phase checks
  for (const check of callPhaseChecks) {
    if (check.status === "failed") {
      const severity = ["dial", "connected", "hangup"].includes(check.phase) ? "high" : "medium";
      findings.push({
        type: "call_phase_failure",
        severity,
        title: `Call phase failed: ${check.phase}`,
        description: check.details,
        agents: check.phase === "answer" || check.phase === "signal_answer" ? ["callee"] : ["caller"],
        recommendation: getPhaseRecommendation(check.phase),
      });
    }
  }

  // Failed audio checks
  for (const check of audioChecks) {
    if (check.status === "failed") {
      findings.push({
        type: "audio_failure",
        severity: "medium",
        title: `Audio check failed: ${check.type}`,
        description: check.details,
        agents: check.type === "speaker_toggle" ? ["callee"] : ["caller"],
        recommendation: "Check audio device permissions and WebRTC configuration.",
      });
    }
  }

  return findings;
}

function getPhaseRecommendation(phase: string): string {
  switch (phase) {
    case "dial":
      return "Verify the dial/call button selector is correct and the calling app is accessible.";
    case "ring":
      return "Check ring indicator CSS selectors and ensure the callee is online.";
    case "answer":
      return "Verify the answer/accept button selector and ensure incoming call UI is rendered.";
    case "connected":
      return "Verify WebRTC connection establishment and check call status selectors.";
    case "duration":
      return "Check that the call remained stable for the intended duration without disconnection.";
    case "hangup":
      return "Verify the hangup/end-call button selector is correct.";
    case "ended":
      return "Check that the call ended state is properly displayed after hangup.";
    case "signal_dial":
      return "Verify cross-agent signal delivery for call_dialed event.";
    case "signal_answer":
      return "Verify cross-agent signal delivery for call_answered event.";
    default:
      return "Investigate the call flow issue and verify CSS selectors for the calling app.";
  }
}

function generateCallFlowRecommendations(
  callPhaseChecks: CallPhaseCheckResult[],
  audioChecks: AudioCheckResult[]
): string[] {
  const recs: string[] = [];

  const phaseFailures = callPhaseChecks.filter((c) => c.status === "failed").length;
  if (phaseFailures > 0) {
    recs.push(`${phaseFailures} call phase check(s) failed — verify dial, answer, and hangup button selectors for your calling app.`);
  }

  const audioFailures = audioChecks.filter((c) => c.status === "failed").length;
  if (audioFailures > 0) {
    recs.push(`${audioFailures} audio check(s) failed — check audio device permissions, WebRTC configuration, and mute/speaker button selectors.`);
  }

  const dialPhase = callPhaseChecks.find((c) => c.phase === "dial");
  if (dialPhase?.status === "failed") {
    recs.push("Call dial phase failed — provide a specific dialButtonSelector to match your app's dial/call button.");
  }

  const connectedPhase = callPhaseChecks.find((c) => c.phase === "connected");
  if (connectedPhase?.status === "failed") {
    recs.push("Call connected verification failed — ensure WebRTC connection is established and callStatusSelector matches your app's status element.");
  }

  const hangupPhase = callPhaseChecks.find((c) => c.phase === "hangup");
  if (hangupPhase?.status === "failed") {
    recs.push("Call hangup failed — provide a specific hangupButtonSelector to match your app's end-call button.");
  }

  const allSkipped = [...callPhaseChecks, ...audioChecks].every((c) => c.status === "skipped");
  if (allSkipped && callPhaseChecks.length > 0) {
    recs.push("All call phase and audio checks were skipped — consider providing more specific CSS selectors for your calling app.");
  }

  if (recs.length === 0) {
    recs.push("All call flow checks passed. The voice/video call flow is functioning correctly across devices.");
  }

  return recs;
}
