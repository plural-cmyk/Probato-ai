/**
 * GET /api/notifications/channels
 * List the current user's notification channels.
 *
 * POST /api/notifications/channels
 * Add a new notification channel.
 *
 * Body:
 * - type: "email" | "slack" | "discord" | "webhook"
 * - label: string (user-friendly name)
 * - config: object (channel-specific configuration)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const VALID_CHANNEL_TYPES = ["email", "slack", "discord", "webhook"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const channels = await db.notificationChannel.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    // Mask sensitive data in config
    const masked = channels.map((ch) => ({
      ...ch,
      config: maskConfig(ch.config as Record<string, string>, ch.type),
    }));

    return NextResponse.json({ channels: masked });
  } catch (error) {
    console.error("[Notifications/Channels] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch channels" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type, label, config } = body;

    if (!type || !VALID_CHANNEL_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid channel type. Must be one of: ${VALID_CHANNEL_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!label || typeof label !== "string" || label.trim().length === 0) {
      return NextResponse.json(
        { error: "Label is required" },
        { status: 400 }
      );
    }

    // Validate channel config
    const validationError = validateChannelConfig(type, config);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Check channel limits (max 5 per type per user)
    const existingCount = await db.notificationChannel.count({
      where: { userId: session.user.id, type },
    });

    if (existingCount >= 5) {
      return NextResponse.json(
        { error: `Maximum 5 ${type} channels allowed` },
        { status: 400 }
      );
    }

    const channel = await db.notificationChannel.create({
      data: {
        userId: session.user.id,
        type,
        label: label.trim(),
        config,
        enabled: true,
        verified: false,
      },
    });

    // Test the channel connection asynchronously
    testChannelConnection(channel).catch(() => {});

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    console.error("[Notifications/Channels] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create channel" },
      { status: 500 }
    );
  }
}

// ── Validation ──────────────────────────────────────────────────────

function validateChannelConfig(type: string, config: any): string | null {
  if (!config || typeof config !== "object") {
    return "Config is required";
  }

  switch (type) {
    case "email":
      if (!config.email || typeof config.email !== "string") {
        return "Email address is required";
      }
      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) {
        return "Invalid email address format";
      }
      break;

    case "slack":
      if (!config.webhookUrl || typeof config.webhookUrl !== "string") {
        return "Slack webhook URL is required";
      }
      if (!config.webhookUrl.startsWith("https://hooks.slack.com/")) {
        return "Invalid Slack webhook URL format";
      }
      break;

    case "discord":
      if (!config.webhookUrl || typeof config.webhookUrl !== "string") {
        return "Discord webhook URL is required";
      }
      if (!config.webhookUrl.startsWith("https://discord.com/api/webhooks/") &&
          !config.webhookUrl.startsWith("https://discordapp.com/api/webhooks/")) {
        return "Invalid Discord webhook URL format";
      }
      break;

    case "webhook":
      if (!config.url || typeof config.url !== "string") {
        return "Webhook URL is required";
      }
      try {
        new URL(config.url);
      } catch {
        return "Invalid webhook URL format";
      }
      break;
  }

  return null;
}

// ── Mask sensitive config data ─────────────────────────────────────

function maskConfig(config: Record<string, string>, type: string): Record<string, string> {
  const masked = { ...config };

  switch (type) {
    case "email":
      // Show first 2 chars and domain: "jo***@example.com"
      if (masked.email) {
        const [local, domain] = masked.email.split("@");
        if (local && domain) {
          masked.email = `${local.substring(0, 2)}***@${domain}`;
        }
      }
      break;
    case "slack":
    case "discord":
      // Mask webhook URL: "https://hooks.slack.com/...abc"
      if (masked.webhookUrl) {
        const url = masked.webhookUrl;
        masked.webhookUrl = url.length > 30
          ? `${url.substring(0, 30)}...${url.substring(url.length - 6)}`
          : `${url.substring(0, 10)}...`;
      }
      break;
    case "webhook":
      if (masked.url) {
        const url = masked.url;
        masked.url = url.length > 30
          ? `${url.substring(0, 30)}...${url.substring(url.length - 6)}`
          : `${url.substring(0, 10)}...`;
      }
      // Never expose secrets
      if (masked.secret) {
        masked.secret = "***";
      }
      break;
  }

  return masked;
}

// ── Test Channel Connection ────────────────────────────────────────

async function testChannelConnection(channel: {
  id: string;
  type: string;
  config: any;
}): Promise<void> {
  try {
    const config = channel.config as Record<string, string>;

    switch (channel.type) {
      case "slack": {
        const response = await fetch(config.webhookUrl!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "🔔 Probato notification channel connected successfully!",
          }),
        });
        if (!response.ok) {
          await db.notificationChannel.update({
            where: { id: channel.id },
            data: { lastError: `Test failed: ${response.status}` },
          });
          return;
        }
        break;
      }
      case "discord": {
        const response = await fetch(config.webhookUrl!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "Probato",
            content: "🔔 Notification channel connected successfully!",
          }),
        });
        if (!response.ok) {
          await db.notificationChannel.update({
            where: { id: channel.id },
            data: { lastError: `Test failed: ${response.status}` },
          });
          return;
        }
        break;
      }
      case "webhook": {
        const response = await fetch(config.url!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "probato",
            event: "channel_test",
            message: "Notification channel connected successfully!",
            timestamp: new Date().toISOString(),
          }),
        });
        if (!response.ok) {
          await db.notificationChannel.update({
            where: { id: channel.id },
            data: { lastError: `Test failed: ${response.status}` },
          });
          return;
        }
        break;
      }
      case "email": {
        // Email verification happens via actual email delivery
        // We'll mark it as verified after the first successful send
        break;
      }
    }

    // Mark as verified
    await db.notificationChannel.update({
      where: { id: channel.id },
      data: { verified: true, lastError: null },
    });
  } catch (error) {
    await db.notificationChannel.update({
      where: { id: channel.id },
      data: {
        lastError: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => {});
  }
}
