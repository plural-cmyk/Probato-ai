/**
 * Probato Notification Dispatcher
 *
 * Central notification engine that handles multi-channel dispatch:
 * - In-app: Always stored in DB for the notification center
 * - Email: Via Resend API (optional — requires RESEND_API_KEY)
 * - Slack: Via incoming webhook URLs (user-configured)
 * - Discord: Via webhook URLs (user-configured)
 * - Custom webhooks: Generic HTTP POST
 *
 * The dispatcher checks user preferences before sending to each channel,
 * ensuring users only receive notifications they've opted into.
 */

import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────

export type NotificationType =
  | "test_pass"
  | "test_fail"
  | "test_error"
  | "visual_diff"
  | "schedule_complete"
  | "auto_heal"
  | "webhook_received";

export type NotificationPriority = "low" | "normal" | "high" | "critical";

export interface DispatchNotificationParams {
  /** The type of notification event */
  type: NotificationType;
  /** Short human-readable title */
  title: string;
  /** Detailed message body */
  message: string;
  /** Target user ID */
  userId: string;
  /** Optional: Project this notification relates to */
  projectId?: string;
  /** Optional: Test run this notification relates to */
  testRunId?: string;
  /** Optional: URL to navigate when clicking the notification */
  actionUrl?: string;
  /** Optional: Priority level (default: normal) */
  priority?: NotificationPriority;
  /** Optional: Structured metadata */
  metadata?: Record<string, unknown>;
}

export interface DispatchResult {
  /** ID of the created notification record */
  notificationId: string;
  /** Which channels were dispatched to */
  channels: {
    inApp: boolean;
    email: boolean;
    slack: boolean;
    discord: boolean;
    webhook: boolean;
  };
  /** Any errors encountered */
  errors: string[];
}

// ── Default Preference Map ─────────────────────────────────────────

const DEFAULT_PREFERENCES: Record<NotificationType, { inApp: boolean; email: boolean; slack: boolean; webhook: boolean }> = {
  test_pass:           { inApp: true,  email: false, slack: false, webhook: false },
  test_fail:           { inApp: true,  email: true,  slack: true,  webhook: false },
  test_error:          { inApp: true,  email: true,  slack: true,  webhook: false },
  visual_diff:         { inApp: true,  email: false, slack: true,  webhook: false },
  schedule_complete:   { inApp: true,  email: false, slack: false, webhook: false },
  auto_heal:           { inApp: true,  email: false, slack: false, webhook: false },
  webhook_received:    { inApp: true,  email: false, slack: false, webhook: false },
};

// ── Main Dispatcher ────────────────────────────────────────────────

/**
 * Dispatch a notification across all configured channels.
 * Always creates an in-app notification record, then checks user
 * preferences and channels for email/slack/discord/webhook delivery.
 */
export async function dispatchNotification(
  params: DispatchNotificationParams
): Promise<DispatchResult> {
  const {
    type,
    title,
    message,
    userId,
    projectId,
    testRunId,
    actionUrl,
    priority = "normal",
    metadata,
  } = params;

  const errors: string[] = [];
  const channelResults = {
    inApp: false,
    email: false,
    slack: false,
    discord: false,
    webhook: false,
  };

  // 1. Get user preferences for this event type
  const prefs = await getUserPreferences(userId, type);

  // 2. Always create in-app notification (if preference allows)
  let notificationId: string;

  if (prefs.inApp) {
    try {
      const notification = await db.notification.create({
        data: {
          type,
          title,
          message,
          status: "unread",
          priority,
          actionUrl,
          metadata: metadata ?? undefined,
          userId,
          projectId: projectId ?? null,
          testRunId: testRunId ?? null,
        },
      });
      notificationId = notification.id;
      channelResults.inApp = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`In-app: ${msg}`);
      // Create a fallback ID
      notificationId = `fallback-${Date.now()}`;
    }
  } else {
    notificationId = `skipped-${Date.now()}`;
  }

  // 3. Get user's notification channels
  const channels = await db.notificationChannel.findMany({
    where: { userId, enabled: true },
  });

  // 4. Dispatch to each channel based on preferences
  const dispatchPromises: Promise<void>[] = [];

  // Email channel
  if (prefs.email) {
    const emailChannels = channels.filter((c) => c.type === "email");
    for (const channel of emailChannels) {
      dispatchPromises.push(
        sendEmailNotification(channel, title, message, actionUrl)
          .then(() => { channelResults.email = true; })
          .catch((err) => { errors.push(`Email: ${err.message}`); })
      );
    }
  }

  // Slack channel
  if (prefs.slack) {
    const slackChannels = channels.filter((c) => c.type === "slack");
    for (const channel of slackChannels) {
      dispatchPromises.push(
        sendSlackNotification(channel, title, message, type, priority, actionUrl)
          .then(() => { channelResults.slack = true; })
          .catch((err) => { errors.push(`Slack: ${err.message}`); })
      );
    }
  }

  // Discord channel
  const discordChannels = channels.filter((c) => c.type === "discord");
  for (const channel of discordChannels) {
    dispatchPromises.push(
      sendDiscordNotification(channel, title, message, type, priority)
        .then(() => { channelResults.discord = true; })
        .catch((err) => { errors.push(`Discord: ${err.message}`); })
    );
  }

  // Generic webhooks
  if (prefs.webhook) {
    const webhookChannels = channels.filter((c) => c.type === "webhook");
    for (const channel of webhookChannels) {
      dispatchPromises.push(
        sendWebhookNotification(channel, { type, title, message, priority, actionUrl, metadata })
          .then(() => { channelResults.webhook = true; })
          .catch((err) => { errors.push(`Webhook: ${err.message}`); })
      );
    }
  }

  // Wait for all dispatches (but don't fail on individual errors)
  await Promise.allSettled(dispatchPromises);

  return {
    notificationId,
    channels: channelResults,
    errors,
  };
}

// ── Batch Dispatcher ───────────────────────────────────────────────

/**
 * Dispatch notifications to multiple users (e.g., all project members).
 * Useful for project-level events that should notify all stakeholders.
 */
export async function dispatchToUsers(
  userIds: string[],
  params: Omit<DispatchNotificationParams, "userId">
): Promise<DispatchResult[]> {
  const results = await Promise.allSettled(
    userIds.map((userId) =>
      dispatchNotification({ ...params, userId })
    )
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      notificationId: `error-${i}`,
      channels: { inApp: false, email: false, slack: false, discord: false, webhook: false },
      errors: [r.reason?.message ?? "Unknown error"],
    };
  });
}

// ── Preference Helper ──────────────────────────────────────────────

async function getUserPreferences(
  userId: string,
  eventType: NotificationType
): Promise<{ inApp: boolean; email: boolean; slack: boolean; webhook: boolean }> {
  try {
    const pref = await db.notificationPreference.findUnique({
      where: { userId_eventType: { userId, eventType } },
    });

    if (pref) {
      return {
        inApp: pref.inApp,
        email: pref.email,
        slack: pref.slack,
        webhook: pref.webhook,
      };
    }

    // No preference set — use defaults
    return DEFAULT_PREFERENCES[eventType] ?? DEFAULT_PREFERENCES.test_pass;
  } catch (error) {
    // DB not available — use defaults
    console.warn(`[Notifications] Could not fetch preferences for ${userId}:`, error);
    return DEFAULT_PREFERENCES[eventType] ?? DEFAULT_PREFERENCES.test_pass;
  }
}

/**
 * Get or create default preferences for a user.
 * Returns all preferences, creating missing ones with defaults.
 */
export async function ensureUserPreferences(userId: string): Promise<{
  eventType: string;
  inApp: boolean;
  email: boolean;
  slack: boolean;
  webhook: boolean;
}[]> {
  const eventTypes: NotificationType[] = [
    "test_pass", "test_fail", "test_error", "visual_diff",
    "schedule_complete", "auto_heal", "webhook_received",
  ];

  const prefs = [];

  for (const eventType of eventTypes) {
    const pref = await db.notificationPreference.upsert({
      where: { userId_eventType: { userId, eventType } },
      create: {
        userId,
        eventType,
        inApp: DEFAULT_PREFERENCES[eventType].inApp,
        email: DEFAULT_PREFERENCES[eventType].email,
        slack: DEFAULT_PREFERENCES[eventType].slack,
        webhook: DEFAULT_PREFERENCES[eventType].webhook,
      },
      update: {},
    });

    prefs.push({
      eventType: pref.eventType,
      inApp: pref.inApp,
      email: pref.email,
      slack: pref.slack,
      webhook: pref.webhook,
    });
  }

  return prefs;
}

// ── Email Channel (Resend) ────────────────────────────────────────

async function sendEmailNotification(
  channel: { id: string; config: any; lastSentAt: Date | null },
  title: string,
  message: string,
  actionUrl?: string | null
): Promise<void> {
  const config = channel.config as { email?: string };
  const emailAddress = config.email;

  if (!emailAddress) {
    throw new Error("No email address configured");
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn("[Notifications] RESEND_API_KEY not set — skipping email dispatch");
    return;
  }

  // Use Resend API directly via fetch (no extra dependency needed)
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.NOTIFICATION_EMAIL_FROM ?? "Probato <notifications@probato.ai>",
      to: emailAddress,
      subject: title,
      html: buildEmailHtml(title, message, actionUrl),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }

  // Update channel lastSentAt
  await db.notificationChannel.update({
    where: { id: channel.id },
    data: { lastSentAt: new Date(), lastError: null },
  }).catch(() => {});
}

function buildEmailHtml(title: string, message: string, actionUrl?: string | null): string {
  const actionButton = actionUrl
    ? `<a href="${actionUrl}" style="display:inline-block;padding:12px 24px;background-color:#6C3CE1;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;margin-top:16px;">View Details</a>`
    : "";

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;margin:0;padding:0;">
      <div style="max-width:560px;margin:24px auto;padding:32px;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
          <div style="width:32px;height:32px;background:#6C3CE1;border-radius:8px;display:flex;align-items:center;justify-content:center;">
            <span style="color:#ffffff;font-weight:bold;font-size:14px;">P</span>
          </div>
          <span style="font-weight:700;font-size:16px;color:#6C3CE1;">Probato</span>
        </div>
        <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;">${title}</h2>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a4a4a;">${message}</p>
        ${actionButton}
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;font-size:12px;color:#999;">You received this because you enabled email notifications in Probato.
          <a href="${process.env.NEXTAUTH_URL || 'https://probato-ai.vercel.app'}/dashboard" style="color:#6C3CE1;">Manage preferences</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ── Slack Channel ─────────────────────────────────────────────────

async function sendSlackNotification(
  channel: { id: string; config: any },
  title: string,
  message: string,
  type: NotificationType,
  priority: NotificationPriority,
  actionUrl?: string | null
): Promise<void> {
  const config = channel.config as { webhookUrl?: string };
  const webhookUrl = config.webhookUrl;

  if (!webhookUrl) {
    throw new Error("No Slack webhook URL configured");
  }

  const emoji = getNotificationEmoji(type);
  const priorityLabel = priority !== "normal" ? ` [${priority.toUpperCase()}]` : "";
  const color = getNotificationColor(type);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `${emoji} *${title}*${priorityLabel}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: `${emoji} ${title}${priorityLabel}`, emoji: true },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: message },
        },
        ...(actionUrl
          ? [
              {
                type: "actions" as const,
                elements: [
                  {
                    type: "button" as const,
                    text: { type: "plain_text" as const, text: "View Details" },
                    url: actionUrl,
                  },
                ],
              },
            ]
          : []),
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Sent by _Probato_ at ${new Date().toISOString()}`,
            },
          ],
        },
      ],
      attachments: [
        {
          color,
          fields: [
            { title: "Type", value: type, short: true },
            { title: "Priority", value: priority, short: true },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Slack webhook error: ${error}`);
  }

  // Update channel lastSentAt
  await db.notificationChannel.update({
    where: { id: channel.id },
    data: { lastSentAt: new Date(), lastError: null },
  }).catch(() => {});
}

// ── Discord Channel ───────────────────────────────────────────────

async function sendDiscordNotification(
  channel: { id: string; config: any },
  title: string,
  message: string,
  type: NotificationType,
  priority: NotificationPriority
): Promise<void> {
  const config = channel.config as { webhookUrl?: string };
  const webhookUrl = config.webhookUrl;

  if (!webhookUrl) {
    throw new Error("No Discord webhook URL configured");
  }

  const color = getNotificationColor(type);
  // Discord uses decimal color values
  const discordColor = color === "#10b981" ? 0x10b981
    : color === "#ef4444" ? 0xef4444
    : color === "#f59e0b" ? 0xf59e0b
    : color === "#6c3ce1" ? 0x6c3ce1
    : 0x6c3ce1;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Probato",
      embeds: [
        {
          title,
          description: message,
          color: discordColor,
          fields: [
            { name: "Type", value: type, inline: true },
            { name: "Priority", value: priority, inline: true },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Discord webhook error: ${error}`);
  }

  // Update channel lastSentAt
  await db.notificationChannel.update({
    where: { id: channel.id },
    data: { lastSentAt: new Date(), lastError: null },
  }).catch(() => {});
}

// ── Generic Webhook ────────────────────────────────────────────────

async function sendWebhookNotification(
  channel: { id: string; config: any },
  payload: {
    type: NotificationType;
    title: string;
    message: string;
    priority: NotificationPriority;
    actionUrl?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const config = channel.config as { url?: string; secret?: string; headers?: Record<string, string> };
  const webhookUrl = config.url;

  if (!webhookUrl) {
    throw new Error("No webhook URL configured");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.headers,
  };

  // Add signature if secret is configured
  if (config.secret) {
    const crypto = await import("crypto");
    const signature = crypto
      .createHmac("sha256", config.secret)
      .update(JSON.stringify(payload))
      .digest("hex");
    headers["X-Probato-Signature"] = `sha256=${signature}`;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: "probato",
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Webhook error (${response.status}): ${error}`);
  }

  // Update channel lastSentAt
  await db.notificationChannel.update({
    where: { id: channel.id },
    data: { lastSentAt: new Date(), lastError: null },
  }).catch(() => {});
}

// ── Helpers ────────────────────────────────────────────────────────

function getNotificationEmoji(type: NotificationType): string {
  const emojiMap: Record<NotificationType, string> = {
    test_pass: "✅",
    test_fail: "❌",
    test_error: "⚠️",
    visual_diff: "👁️",
    schedule_complete: "📅",
    auto_heal: "🩹",
    webhook_received: "🔗",
  };
  return emojiMap[type] ?? "🔔";
}

function getNotificationColor(type: NotificationType): string {
  const colorMap: Record<NotificationType, string> = {
    test_pass: "#10b981",
    test_fail: "#ef4444",
    test_error: "#f59e0b",
    visual_diff: "#6c3ce1",
    schedule_complete: "#3b82f6",
    auto_heal: "#8b5cf6",
    webhook_received: "#6b7280",
  };
  return colorMap[type] ?? "#6c3ce1";
}

/**
 * Generate a human-readable description for a notification type
 */
export function getNotificationTypeDescription(type: NotificationType): string {
  const descriptions: Record<NotificationType, string> = {
    test_pass: "When a test run passes successfully",
    test_fail: "When a test run fails",
    test_error: "When a test run encounters an error",
    visual_diff: "When a visual regression diff is detected",
    schedule_complete: "When a scheduled test run completes",
    auto_heal: "When auto-heal fixes a broken test",
    webhook_received: "When a GitHub webhook event is received",
  };
  return descriptions[type] ?? type;
}

/**
 * Build a standard notification title for test run events
 */
export function buildTestRunNotificationTitle(
  status: string,
  projectName: string,
  triggeredBy: string
): string {
  const statusEmoji = status === "passed" ? "✅" : status === "failed" ? "❌" : "⚠️";
  const triggerLabel = triggeredBy === "manual" ? "Manual run"
    : triggeredBy === "auto" ? "Auto run"
    : triggeredBy === "auto-heal" ? "Auto-heal run"
    : triggeredBy.startsWith("push:") ? `Push by ${triggeredBy.split(":")[1]}`
    : triggeredBy.startsWith("pr:") ? `PR #${triggeredBy.split(":")[1]}`
    : triggeredBy === "schedule" ? "Scheduled run"
    : triggeredBy;

  return `${statusEmoji} ${projectName}: Test ${status} — ${triggerLabel}`;
}

/**
 * Build a standard notification message for test run events
 */
export function buildTestRunNotificationMessage(
  projectName: string,
  status: string,
  summary: { total: number; passed: number; failed: number; errors: number },
  duration: number
): string {
  const durationSec = (duration / 1000).toFixed(1);
  return `Project *${projectName}*: ${summary.passed}/${summary.total} steps passed in ${durationSec}s.` +
    (summary.failed > 0 ? ` ${summary.failed} failed, ${summary.errors} errors.` : "");
}
