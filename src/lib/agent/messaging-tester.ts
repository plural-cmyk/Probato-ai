/**
 * Cross-Device Messaging & Notification Tester (M26)
 *
 * Tests messaging flows across two browser sandboxes:
 *   - Sender agent: opens conversation, sends a test message, verifies delivery receipt
 *   - Receiver agent: waits for message, verifies content, checks notifications
 *
 * Architecture:
 *   - Builds on M25 Multi-Sandbox Orchestrator for browser provisioning & sync
 *   - Uses DB-backed SyncEvent bus for cross-agent coordination
 *   - Concrete messaging action handlers replace the "custom" no-ops from M25
 *   - 3-tier LLM analysis for messaging-specific insights
 *   - Safe payload: benign marker strings only (never real exploits)
 *
 * Messaging actions implemented:
 *   - send_message: fill chat input and send via Enter key
 *   - verify_message_received: assert message text appears in chat
 *   - check_notification_badge: check unread count badge element
 *   - wait_for_notification: wait for a notification/toast to appear
 *   - dismiss_notification: click dismiss/close on a notification
 *   - verify_delivery_receipt: check delivery/read indicator (single/double tick)
 *   - verify_typing_indicator: check typing indicator element
 *   - open_conversation: click on a conversation/chat item
 *   - verify_online_status: check online/offline status indicator
 *   - check_push_notification: verify push notification text content
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

export interface MessagingTestInput {
  projectId?: string;
  userId: string;
  url: string;
  testRunId?: string;
  testMessage?: string;
  /** CSS selector for the chat input field (default: common chat selectors) */
  chatInputSelector?: string;
  /** CSS selector for the send button (default: auto-detect Enter key) */
  sendButtonSelector?: string;
  /** CSS selector for conversation list items */
  conversationSelector?: string;
  /** CSS selector for notification badge */
  notificationBadgeSelector?: string;
  /** CSS selector for delivery receipts (ticks) */
  deliveryReceiptSelector?: string;
  /** CSS selector for typing indicator */
  typingIndicatorSelector?: string;
  /** CSS selector for online status indicator */
  onlineStatusSelector?: string;
  /** CSS selector for notification toast/popup */
  notificationToastSelector?: string;
  /** Sync timeout in ms (default 30000) */
  syncTimeoutMs?: number;
}

export interface MessageCheckResult {
  check: string;
  status: "passed" | "failed" | "skipped";
  details: string;
  latencyMs?: number;
}

export interface NotificationCheckResult {
  type: string; // badge, toast, push, in_app
  status: "passed" | "failed" | "skipped";
  details: string;
  latencyMs?: number;
}

export interface DeliveryCheckResult {
  type: string; // sent, delivered, read
  status: "passed" | "failed" | "skipped";
  details: string;
  latencyMs?: number;
}

export interface ConversationEvent {
  timestamp: number;
  agent: string;
  action: string;
  details: string;
}

export interface MessagingTestResult {
  id: string;
  sessionId: string;
  status: "completed" | "failed";
  overallScore: number;
  messageScore: number;
  notificationScore: number;
  deliveryScore: number;
  messageDeliveryMs: number;
  notificationDeliveryMs: number;
  conversationFlow: ConversationEvent[];
  messageChecks: MessageCheckResult[];
  notificationChecks: NotificationCheckResult[];
  deliveryChecks: DeliveryCheckResult[];
  findings: Finding[];
  recommendations: string[];
  summary: string;
  llmUsed: boolean;
  duration: number;
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────

/** Benign test message marker — never a real exploit */
const DEFAULT_TEST_MESSAGE = "PROBATO_TEST_MSG_2024";

/** Common CSS selectors for chat inputs across popular frameworks */
const CHAT_INPUT_SELECTORS = [
  'textarea[data-testid="chat-input"]',
  'input[data-testid="chat-input"]',
  'textarea[placeholder*="message" i]',
  'input[placeholder*="message" i]',
  'textarea[placeholder*="type" i]',
  'input[placeholder*="type" i]',
  'div[contenteditable="true"][role="textbox"]',
  'textarea.chat-input',
  'input.chat-input',
  "#chat-input",
  "#message-input",
  'textarea',
];

const NOTIFICATION_BADGE_SELECTORS = [
  '[data-testid="notification-badge"]',
  ".notification-badge",
  ".unread-badge",
  ".badge-count",
  '[class*="notification"][class*="badge"]',
  '[class*="unread"][class*="count"]',
];

const DELIVERY_RECEIPT_SELECTORS = [
  '[data-testid="delivery-receipt"]',
  '[data-testid="read-receipt"]',
  ".message-status",
  ".delivery-tick",
  ".read-tick",
  '[class*="delivered"]',
  '[class*="read-indicator"]',
  '[aria-label*="delivered" i]',
  '[aria-label*="read" i]',
];

const TYPING_INDICATOR_SELECTORS = [
  '[data-testid="typing-indicator"]',
  ".typing-indicator",
  '[class*="typing"]',
  '[aria-label*="typing" i]',
];

const NOTIFICATION_TOAST_SELECTORS = [
  '[data-testid="notification-toast"]',
  ".toast",
  ".notification-toast",
  '[class*="toast"]',
  '[role="alert"]',
  '[class*="notification-popup"]',
];

const CONVERSATION_SELECTORS = [
  '[data-testid="conversation-item"]',
  ".conversation-item",
  ".chat-item",
  ".contact-item",
  '[class*="conversation"]',
  '[class*="chat-list"]',
];

const ONLINE_STATUS_SELECTORS = [
  '[data-testid="online-status"]',
  ".online-indicator",
  ".status-indicator",
  '[class*="online"]',
  '[class*="status-dot"]',
];

// ── Main Entry Point ──────────────────────────────────────────

export async function runMessagingTest(
  input: MessagingTestInput
): Promise<MessagingTestResult> {
  const startTime = Date.now();
  const testMessage = input.testMessage ?? DEFAULT_TEST_MESSAGE;

  const emptyResult = (): MessagingTestResult => ({
    id: "",
    sessionId: "",
    status: "failed",
    overallScore: 0,
    messageScore: 0,
    notificationScore: 0,
    deliveryScore: 0,
    messageDeliveryMs: 0,
    notificationDeliveryMs: 0,
    conversationFlow: [],
    messageChecks: [],
    notificationChecks: [],
    deliveryChecks: [],
    findings: [],
    recommendations: [],
    summary: "",
    llmUsed: false,
    duration: Date.now() - startTime,
    error: "Messaging test failed to initialize",
  });

  // 1. Check credits
  const creditCheck = await checkCredits(input.userId, "messaging_test");
  if (!creditCheck.hasSufficient) {
    return {
      ...emptyResult(),
      error: `Insufficient credits. Need 12, have ${creditCheck.balance}.`,
    };
  }

  // 2. Build messaging-specific agent configs
  const agents = getMessagingAgents(testMessage, input);

  // 3. Run orchestrated session
  const orchestratorInput: OrchestratorInput = {
    projectId: input.projectId,
    userId: input.userId,
    url: input.url,
    testRunId: input.testRunId,
    scenarioType: "messaging",
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

  // 4. Analyze messaging-specific results
  const conversationFlow = extractConversationFlow(sessionResult.agentResults);
  const messageChecks = analyzeMessageDelivery(sessionResult.agentResults, testMessage);
  const notificationChecks = analyzeNotificationDelivery(sessionResult.agentResults);
  const deliveryChecks = analyzeDeliveryReceipts(sessionResult.agentResults);

  // 5. Calculate scores
  const messageScore = calculateCategoryScore(messageChecks);
  const notificationScore = calculateCategoryScore(notificationChecks);
  const deliveryScore = calculateCategoryScore(deliveryChecks);
  const overallScore = Math.round(
    messageScore * 0.5 + notificationScore * 0.3 + deliveryScore * 0.2
  );

  // 6. Measure latencies
  const messageDeliveryMs = extractMessageLatency(messageChecks);
  const notificationDeliveryMs = extractNotificationLatency(notificationChecks);

  // 7. LLM analysis for messaging-specific insights
  let summary = "";
  let llmUsed = false;
  let messagingFindings: Finding[] = [];

  try {
    const llmResult = await callLLMForMessagingAnalysis(
      input.url,
      testMessage,
      messageChecks,
      notificationChecks,
      deliveryChecks,
      conversationFlow
    );
    summary = llmResult.summary;
    messagingFindings = llmResult.findings;
    llmUsed = true;
  } catch {
    summary = generateMessagingSummary(messageScore, notificationScore, deliveryScore, messageChecks);
  }

  // 8. Combine findings
  const findings = [
    ...sessionResult.findings,
    ...messagingFindings,
    ...generateMessagingFindings(messageChecks, notificationChecks, deliveryChecks),
  ];

  const recommendations = [
    ...sessionResult.recommendations,
    ...generateMessagingRecommendations(messageChecks, notificationChecks, deliveryChecks),
  ];

  // 9. Create MessagingTestSession record
  let messagingSession;
  try {
    messagingSession = await db.messagingTestSession.create({
      data: {
        status: sessionResult.status === "completed" ? "completed" : "failed",
        url: input.url,
        testMessage,
        messageDeliveryMs,
        notificationDeliveryMs,
        conversationFlow,
        messageChecks,
        notificationChecks,
        deliveryChecks,
        overallScore,
        messageScore,
        notificationScore,
        deliveryScore,
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
    console.error("Failed to create MessagingTestSession:", err);
  }

  // 10. Deduct credits
  await deductCredits(
    input.userId,
    "messaging_test",
    messagingSession?.id ?? sessionResult.sessionId,
    "messaging_test_session"
  );

  return {
    id: messagingSession?.id ?? "",
    sessionId: sessionResult.sessionId,
    status: sessionResult.status === "completed" ? "completed" : "failed",
    overallScore,
    messageScore,
    notificationScore,
    deliveryScore,
    messageDeliveryMs,
    notificationDeliveryMs,
    conversationFlow,
    messageChecks,
    notificationChecks,
    deliveryChecks,
    findings,
    recommendations,
    summary,
    llmUsed,
    duration: Date.now() - startTime,
    error: sessionResult.error,
  };
}

// ── Agent Configuration ────────────────────────────────────────

export function getMessagingAgents(
  testMessage: string,
  input: MessagingTestInput
): AgentConfig[] {
  return [
    {
      role: "sender",
      actions: [
        {
          type: "navigate",
          value: "{{url}}",
          description: "Navigate to messaging app",
        },
        {
          type: "custom",
          value: "open_conversation",
          selector: input.conversationSelector,
          description: "Open a conversation/chat thread",
        },
        {
          type: "barrier",
          value: "chat_ready",
          description: "Wait for both agents to be in chat",
        },
        {
          type: "custom",
          value: "send_message",
          selector: input.chatInputSelector,
          description: `Send test message: "${testMessage}"`,
        },
        {
          type: "signal",
          value: "message_sent",
          description: "Signal that message was sent",
        },
        {
          type: "custom",
          value: "verify_delivery_receipt",
          selector: input.deliveryReceiptSelector,
          description: "Verify delivery/read receipt appears",
        },
        {
          type: "waitForSignal",
          selector: "sender",
          description: "Wait for receiver confirmation",
        },
        {
          type: "custom",
          value: "verify_typing_indicator",
          selector: input.typingIndicatorSelector,
          description: "Check if typing indicator appears from receiver",
        },
        {
          type: "screenshot",
          description: "Capture sender final state",
        },
      ],
      description: "Agent that sends messages and verifies delivery",
    },
    {
      role: "receiver",
      actions: [
        {
          type: "navigate",
          value: "{{url}}",
          description: "Navigate to messaging app",
        },
        {
          type: "custom",
          value: "open_conversation",
          selector: input.conversationSelector,
          description: "Open the same conversation/chat thread",
        },
        {
          type: "barrier",
          value: "chat_ready",
          description: "Wait for both agents to be in chat",
        },
        {
          type: "custom",
          value: "check_notification_badge",
          selector: input.notificationBadgeSelector,
          description: "Check for notification badge before message",
        },
        {
          type: "waitForSignal",
          selector: "receiver",
          description: "Wait for sender's message signal",
        },
        {
          type: "custom",
          value: "verify_message_received",
          description: `Verify message "${testMessage}" appeared in chat`,
        },
        {
          type: "custom",
          value: "check_push_notification",
          description: "Check for push notification content",
        },
        {
          type: "custom",
          value: "wait_for_notification",
          selector: input.notificationToastSelector,
          description: "Wait for notification toast/popup",
        },
        {
          type: "custom",
          value: "dismiss_notification",
          selector: input.notificationToastSelector,
          description: "Dismiss the notification",
        },
        {
          type: "custom",
          value: "verify_online_status",
          selector: input.onlineStatusSelector,
          description: "Check sender's online status",
        },
        {
          type: "signal",
          value: "message_received",
          description: "Signal that message was received and verified",
        },
        {
          type: "screenshot",
          description: "Capture receiver final state",
        },
      ],
      description: "Agent that receives messages and verifies notifications",
    },
  ];
}

// ── Messaging Action Handlers ──────────────────────────────────
// These are executed by the orchestrator's executeAction() when it
// encounters type="custom" actions. The orchestrator delegates to
// handleMessagingCustomAction() which we export.

export async function handleMessagingCustomAction(
  page: Page,
  action: AgentAction,
  sessionId: string,
  agentRole: string,
  syncTimeoutMs: number
): Promise<{ evidence?: string }> {
  switch (action.value) {
    case "send_message":
      return sendChatMessage(page, action, sessionId, agentRole);
    case "verify_message_received":
      return verifyMessageReceived(page, action);
    case "check_notification_badge":
      return checkNotificationBadge(page, action);
    case "wait_for_notification":
      return waitForNotification(page, action);
    case "dismiss_notification":
      return dismissNotification(page, action);
    case "verify_delivery_receipt":
      return verifyDeliveryReceipt(page, action);
    case "verify_typing_indicator":
      return verifyTypingIndicator(page, action);
    case "open_conversation":
      return openConversation(page, action);
    case "verify_online_status":
      return verifyOnlineStatus(page, action);
    case "check_push_notification":
      return checkPushNotification(page, action);
    default:
      return { evidence: `Unknown messaging action: ${action.value}` };
  }
}

async function sendChatMessage(
  page: Page,
  action: AgentAction,
  sessionId: string,
  agentRole: string
): Promise<{ evidence: string }> {
  const message = action.description?.replace(/^Send test message:\s*/, "") ?? DEFAULT_TEST_MESSAGE;
  const selectors = action.selector
    ? [action.selector]
    : CHAT_INPUT_SELECTORS;

  // Try each selector to find the chat input
  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout: 3000 });
      if (el) {
        await el.click({ clickCount: 3 }); // select all existing text
        await el.type(message, { delay: 30 });
        // Send via Enter key
        await page.keyboard.press("Enter");

        // Record the send time in sync event for latency measurement
        await db.syncEvent.create({
          data: {
            sessionId,
            eventType: "state_update",
            sourceAgent: agentRole,
            targetAgent: null,
            payload: {
              stateKey: "message_sent_at",
              stateValue: Date.now(),
              message,
            },
          },
        });

        return { evidence: `Sent message "${message.substring(0, 50)}" via ${selector}` };
      }
    } catch {
      continue; // try next selector
    }
  }

  // Fallback: try contenteditable div
  try {
    const el = await page.waitForSelector('div[contenteditable="true"]', { timeout: 3000 });
    if (el) {
      await el.click();
      await page.keyboard.type(message, { delay: 30 });
      await page.keyboard.press("Enter");

      await db.syncEvent.create({
        data: {
          sessionId,
          eventType: "state_update",
          sourceAgent: agentRole,
          targetAgent: null,
          payload: {
            stateKey: "message_sent_at",
            stateValue: Date.now(),
            message,
          },
        },
      });

      return { evidence: `Sent message "${message.substring(0, 50)}" via contenteditable div` };
    }
  } catch { /* fall through */ }

  throw new Error("Could not find chat input element to send message");
}

async function verifyMessageReceived(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const expectedText = action.description?.replace(/^Verify message\s*/, "").replace(/ appeared in chat$/, "").replace(/^"/, "").replace(/"$/, "") ?? DEFAULT_TEST_MESSAGE;

  // Wait for the message to appear in the DOM
  const maxWait = action.timeout ?? 15000;
  const deadline = Date.now() + maxWait;

  while (Date.now() < deadline) {
    const found = await page.evaluate((text: string) => {
      const body = document.body.innerText;
      return body.includes(text);
    }, expectedText);

    if (found) {
      return { evidence: `Message "${expectedText.substring(0, 50)}" found in chat` };
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`Message "${expectedText.substring(0, 50)}" not found within ${maxWait}ms`);
}

async function checkNotificationBadge(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : NOTIFICATION_BADGE_SELECTORS;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout: 3000 });
      if (el) {
        const text = await page.evaluate((sel: string) => {
          const badge = document.querySelector(sel);
          return badge?.textContent?.trim() ?? "";
        }, selector);

        return {
          evidence: `Notification badge found: "${text}" via ${selector}`,
        };
      }
    } catch {
      continue;
    }
  }

  // Badge not found is not necessarily a failure — could mean no unread messages
  return { evidence: "No notification badge found (may be expected if no unread messages)" };
}

async function waitForNotification(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : NOTIFICATION_TOAST_SELECTORS;

  const timeout = action.timeout ?? 10000;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout });
      if (el) {
        const text = await page.evaluate((sel: string) => {
          const toast = document.querySelector(sel);
          return toast?.textContent?.trim().substring(0, 200) ?? "";
        }, selector);

        return { evidence: `Notification appeared: "${text}" via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  // Not finding a notification toast may be acceptable
  return { evidence: "No notification toast found within timeout" };
}

async function dismissNotification(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : NOTIFICATION_TOAST_SELECTORS;

  for (const selector of selectors) {
    try {
      // Try clicking dismiss/close button within the notification
      const dismissBtn = await page.$(`${selector} [class*="close"], ${selector} [class*="dismiss"], ${selector} button[aria-label*="close" i], ${selector} [aria-label*="dismiss" i]`);
      if (dismissBtn) {
        await dismissBtn.click();
        return { evidence: `Dismissed notification via close button in ${selector}` };
      }
      // Click the notification itself to dismiss
      const el = await page.$(selector);
      if (el) {
        await el.click();
        return { evidence: `Clicked notification to dismiss via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  return { evidence: "No notification to dismiss (may have auto-dismissed)" };
}

async function verifyDeliveryReceipt(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : DELIVERY_RECEIPT_SELECTORS;

  const timeout = action.timeout ?? 8000;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout });
      if (el) {
        const label = await page.evaluate((sel: string) => {
          const receipt = document.querySelector(sel);
          return (
            receipt?.getAttribute("aria-label") ??
            receipt?.getAttribute("title") ??
            receipt?.className ??
            "delivery-receipt"
          );
        }, selector);

        return { evidence: `Delivery receipt found: "${label}" via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  // Not finding delivery receipt is not critical
  return { evidence: "No delivery receipt indicator found (app may not show ticks)" };
}

async function verifyTypingIndicator(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : TYPING_INDICATOR_SELECTORS;

  const timeout = action.timeout ?? 5000;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout });
      if (el) {
        return { evidence: `Typing indicator found via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  return { evidence: "No typing indicator found (may be expected if other user is not typing)" };
}

async function openConversation(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : CONVERSATION_SELECTORS;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout: 5000 });
      if (el) {
        await el.click();
        // Wait a moment for conversation to load
        await new Promise((r) => setTimeout(r, 1000));
        return { evidence: `Opened conversation via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  // If no conversation selector found, the app might already be in a chat
  return { evidence: "No conversation list found — may already be in a conversation view" };
}

async function verifyOnlineStatus(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  const selectors = action.selector
    ? [action.selector]
    : ONLINE_STATUS_SELECTORS;

  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout: 3000 });
      if (el) {
        const statusClass = await page.evaluate((sel: string) => {
          const indicator = document.querySelector(sel);
          return indicator?.className ?? "unknown";
        }, selector);

        const isOnline = /online|active|connected/i.test(statusClass);
        return {
          evidence: `Online status found: ${isOnline ? "online" : "offline"} via ${selector}`,
        };
      }
    } catch {
      continue;
    }
  }

  return { evidence: "No online status indicator found" };
}

async function checkPushNotification(
  page: Page,
  action: AgentAction
): Promise<{ evidence: string }> {
  // Check for in-app notification elements (we can't access native push notifications)
  const selectors = [
    '[class*="push-notification"]',
    '[class*="notification-banner"]',
    '[role="alert"]',
    ".notification",
  ];

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const text = await page.evaluate((sel: string) => {
          const notif = document.querySelector(sel);
          return notif?.textContent?.trim().substring(0, 200) ?? "";
        }, selector);

        return { evidence: `Push notification content: "${text}" via ${selector}` };
      }
    } catch {
      continue;
    }
  }

  return { evidence: "No push notification element found (native push not testable via browser)" };
}

// ── Analysis Functions ─────────────────────────────────────────

function extractConversationFlow(
  agentResults: Record<string, any>
): ConversationEvent[] {
  const events: ConversationEvent[] = [];

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

function analyzeMessageDelivery(
  agentResults: Record<string, any>,
  testMessage: string
): MessageCheckResult[] {
  const checks: MessageCheckResult[] = [];
  const senderResult = agentResults.sender;
  const receiverResult = agentResults.receiver;

  // Check 1: Sender successfully sent message
  const sendAction = senderResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("Sent message")
  );
  checks.push({
    check: "sender_message_sent",
    status: sendAction?.status === "passed" ? "passed" : "failed",
    details: sendAction?.evidence ?? "Sender did not successfully send message",
    latencyMs: sendAction?.duration,
  });

  // Check 2: Receiver verified message content
  const verifyAction = receiverResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("found in chat")
  );
  checks.push({
    check: "receiver_message_received",
    status: verifyAction?.status === "passed" ? "passed" : "failed",
    details: verifyAction?.evidence ?? "Receiver did not verify message content",
    latencyMs: verifyAction?.duration,
  });

  // Check 3: Signal was exchanged
  const signalAction = senderResult?.actions?.find(
    (a: any) => a.type === "signal" && a.evidence?.includes("message_sent")
  );
  checks.push({
    check: "signal_message_sent",
    status: signalAction?.status === "passed" ? "passed" : "failed",
    details: signalAction?.evidence ?? "Message sent signal not received",
  });

  // Check 4: Cross-agent sync completed
  const waitAction = senderResult?.actions?.find(
    (a: any) => a.type === "waitForSignal"
  );
  checks.push({
    check: "cross_agent_sync",
    status: waitAction?.status === "passed" ? "passed" : "failed",
    details: waitAction?.evidence ?? "Cross-agent sync did not complete",
  });

  return checks;
}

function analyzeNotificationDelivery(
  agentResults: Record<string, any>
): NotificationCheckResult[] {
  const checks: NotificationCheckResult[] = [];
  const receiverResult = agentResults.receiver;

  // Check 1: Notification badge
  const badgeAction = receiverResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("Notification badge")
  );
  checks.push({
    type: "badge",
    status: badgeAction?.status === "passed" ? "passed" : "skipped",
    details: badgeAction?.evidence ?? "Notification badge not checked",
    latencyMs: badgeAction?.duration,
  });

  // Check 2: Notification toast
  const toastAction = receiverResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("notification")
  );
  checks.push({
    type: "toast",
    status: toastAction?.status === "passed" ? "passed" : "skipped",
    details: toastAction?.evidence ?? "Notification toast not checked",
    latencyMs: toastAction?.duration,
  });

  // Check 3: Push notification
  const pushAction = receiverResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("Push notification")
  );
  checks.push({
    type: "push",
    status: pushAction?.status === "passed" ? "passed" : "skipped",
    details: pushAction?.evidence ?? "Push notification not checked",
    latencyMs: pushAction?.duration,
  });

  // Check 4: Notification dismissal
  const dismissAction = receiverResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("Dismiss")
  );
  checks.push({
    type: "in_app",
    status: dismissAction?.status === "passed" ? "passed" : "skipped",
    details: dismissAction?.evidence ?? "Notification dismissal not checked",
    latencyMs: dismissAction?.duration,
  });

  return checks;
}

function analyzeDeliveryReceipts(
  agentResults: Record<string, any>
): DeliveryCheckResult[] {
  const checks: DeliveryCheckResult[] = [];
  const senderResult = agentResults.sender;

  // Check 1: Delivery receipt (sent → delivered)
  const deliveryAction = senderResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("Delivery receipt")
  );
  checks.push({
    type: "delivered",
    status: deliveryAction?.status === "passed" ? "passed" : "skipped",
    details: deliveryAction?.evidence ?? "Delivery receipt not verified",
    latencyMs: deliveryAction?.duration,
  });

  // Check 2: Read receipt
  const readAction = senderResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("read")
  );
  checks.push({
    type: "read",
    status: readAction?.status === "passed" ? "passed" : "skipped",
    details: readAction?.evidence ?? "Read receipt not verified",
    latencyMs: readAction?.duration,
  });

  // Check 3: Typing indicator
  const typingAction = senderResult?.actions?.find(
    (a: any) => a.type === "custom" && a.evidence?.includes("Typing indicator")
  );
  checks.push({
    type: "sent",
    status: typingAction?.status === "passed" ? "passed" : "skipped",
    details: typingAction?.evidence ?? "Typing indicator not verified",
    latencyMs: typingAction?.duration,
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

function extractMessageLatency(checks: MessageCheckResult[]): number {
  const sendCheck = checks.find((c) => c.check === "sender_message_sent");
  const receiveCheck = checks.find((c) => c.check === "receiver_message_received");
  if (sendCheck?.latencyMs && receiveCheck?.latencyMs) {
    return Math.abs(receiveCheck.latencyMs - sendCheck.latencyMs);
  }
  return 0;
}

function extractNotificationLatency(checks: NotificationCheckResult[]): number {
  const toastCheck = checks.find((c) => c.type === "toast");
  return toastCheck?.latencyMs ?? 0;
}

// ── LLM Analysis ──────────────────────────────────────────────

async function callLLMForMessagingAnalysis(
  url: string,
  testMessage: string,
  messageChecks: MessageCheckResult[],
  notificationChecks: NotificationCheckResult[],
  deliveryChecks: DeliveryCheckResult[],
  conversationFlow: ConversationEvent[]
): Promise<{ summary: string; findings: Finding[] }> {
  // Tier 1: z-ai-web-dev-sdk
  try {
    const zai = await ZAI.create();
    const prompt = `Analyze cross-device messaging test results for ${url}.

Test Message: "${testMessage}"

Message Checks: ${JSON.stringify(messageChecks, null, 2)}
Notification Checks: ${JSON.stringify(notificationChecks, null, 2)}
Delivery Checks: ${JSON.stringify(deliveryChecks, null, 2)}
Conversation Flow: ${JSON.stringify(conversationFlow, null, 2)}

Provide a JSON response with:
1. "summary": A 2-3 sentence summary of the messaging test outcome
2. "findings": Array of {type, severity (critical/high/medium/low/info), title, description, agents[], recommendation}

Focus on: message delivery reliability, notification timing, cross-device sync issues, and user experience quality.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a messaging systems testing analyst. Always respond with valid JSON." },
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
            { role: "system", content: "You are a messaging systems testing analyst. Always respond with valid JSON." },
            { role: "user", content: `Analyze messaging test for ${url}: msg=${JSON.stringify(messageChecks)}, notif=${JSON.stringify(notificationChecks)}, delivery=${JSON.stringify(deliveryChecks)}` },
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
    summary: generateMessagingSummary(
      calculateCategoryScore(messageChecks),
      calculateCategoryScore(notificationChecks),
      calculateCategoryScore(deliveryChecks),
      messageChecks
    ),
    findings: [],
  };
}

function generateMessagingSummary(
  messageScore: number,
  notificationScore: number,
  deliveryScore: number,
  messageChecks: MessageCheckResult[]
): string {
  const allPassed = messageChecks.every((c) => c.status === "passed");
  const msgStatus = allPassed
    ? "Message delivery verified successfully."
    : messageScore >= 50
    ? "Message delivery partially verified — some checks failed."
    : "Message delivery verification failed — significant issues detected.";

  return (
    `Cross-device messaging test completed. ${msgStatus} ` +
    `Message score: ${messageScore}/100, Notification score: ${notificationScore}/100, ` +
    `Delivery score: ${deliveryScore}/100. ` +
    `${messageScore >= 80 && notificationScore >= 60 ? "Overall messaging health is good." : "Investigation recommended for failing checks."}`
  );
}

function generateMessagingFindings(
  messageChecks: MessageCheckResult[],
  notificationChecks: NotificationCheckResult[],
  deliveryChecks: DeliveryCheckResult[]
): Finding[] {
  const findings: Finding[] = [];

  // Failed message checks
  for (const check of messageChecks) {
    if (check.status === "failed") {
      findings.push({
        type: "message_failure",
        severity: "high",
        title: `Message check failed: ${check.check}`,
        description: check.details,
        agents: ["sender", "receiver"],
        recommendation: "Verify the messaging application is running and accessible from both agents.",
      });
    }
  }

  // Failed notification checks
  for (const check of notificationChecks) {
    if (check.status === "failed") {
      findings.push({
        type: "notification_failure",
        severity: "medium",
        title: `Notification check failed: ${check.type}`,
        description: check.details,
        agents: ["receiver"],
        recommendation: "Check notification permissions and push notification configuration.",
      });
    }
  }

  // Failed delivery checks
  for (const check of deliveryChecks) {
    if (check.status === "failed") {
      findings.push({
        type: "delivery_failure",
        severity: "medium",
        title: `Delivery check failed: ${check.type}`,
        description: check.details,
        agents: ["sender"],
        recommendation: "Verify that the messaging app supports delivery receipts.",
      });
    }
  }

  return findings;
}

function generateMessagingRecommendations(
  messageChecks: MessageCheckResult[],
  notificationChecks: NotificationCheckResult[],
  deliveryChecks: DeliveryCheckResult[]
): string[] {
  const recs: string[] = [];

  const messageFailures = messageChecks.filter((c) => c.status === "failed").length;
  if (messageFailures > 0) {
    recs.push(`${messageFailures} message check(s) failed — verify chat input selectors and message delivery mechanism.`);
  }

  const notifFailures = notificationChecks.filter((c) => c.status === "failed").length;
  if (notifFailures > 0) {
    recs.push(`${notifFailures} notification check(s) failed — check notification permissions and WebSocket/push configuration.`);
  }

  const deliveryFailures = deliveryChecks.filter((c) => c.status === "failed").length;
  if (deliveryFailures > 0) {
    recs.push(`${deliveryFailures} delivery receipt check(s) failed — the app may not support delivery/read indicators.`);
  }

  const allSkipped = [...notificationChecks, ...deliveryChecks].every((c) => c.status === "skipped");
  if (allSkipped && notificationChecks.length > 0) {
    recs.push("All notification and delivery checks were skipped — consider providing more specific CSS selectors for your messaging app.");
  }

  if (recs.length === 0) {
    recs.push("All messaging checks passed. The messaging flow is functioning correctly across devices.");
  }

  return recs;
}
