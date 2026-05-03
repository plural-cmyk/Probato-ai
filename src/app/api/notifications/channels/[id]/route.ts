/**
 * PATCH /api/notifications/channels/[id]
 * Update a notification channel (enable/disable, update config).
 *
 * DELETE /api/notifications/channels/[id]
 * Remove a notification channel.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify ownership
    const channel = await db.notificationChannel.findUnique({ where: { id } });
    if (!channel || channel.userId !== session.user.id) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const body = await req.json();
    const { label, enabled, config } = body;

    const updated = await db.notificationChannel.update({
      where: { id },
      data: {
        ...(label !== undefined ? { label: label.trim() } : {}),
        ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
        ...(config !== undefined ? { config } : {}),
      },
    });

    // If config was updated, re-test the connection
    if (config) {
      testChannelUpdate(updated).catch(() => {});
    }

    return NextResponse.json({ channel: updated });
  } catch (error) {
    console.error("[Notifications/Channels] PATCH [id] error:", error);
    return NextResponse.json(
      { error: "Failed to update channel" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify ownership
    const channel = await db.notificationChannel.findUnique({ where: { id } });
    if (!channel || channel.userId !== session.user.id) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    await db.notificationChannel.delete({ where: { id } });

    return NextResponse.json({ message: "Channel deleted" });
  } catch (error) {
    console.error("[Notifications/Channels] DELETE [id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete channel" },
      { status: 500 }
    );
  }
}

async function testChannelUpdate(channel: {
  id: string;
  type: string;
  config: any;
}): Promise<void> {
  try {
    const config = channel.config as Record<string, string>;

    switch (channel.type) {
      case "slack": {
        if (!config.webhookUrl) return;
        const response = await fetch(config.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "🔔 Probato channel updated & re-verified!" }),
        });
        if (!response.ok) {
          await db.notificationChannel.update({
            where: { id: channel.id },
            data: { verified: false, lastError: `Re-test failed: ${response.status}` },
          });
          return;
        }
        break;
      }
      case "discord": {
        if (!config.webhookUrl) return;
        const response = await fetch(config.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "Probato", content: "🔔 Channel updated & re-verified!" }),
        });
        if (!response.ok) {
          await db.notificationChannel.update({
            where: { id: channel.id },
            data: { verified: false, lastError: `Re-test failed: ${response.status}` },
          });
          return;
        }
        break;
      }
      default:
        return; // Skip testing for email/webhook on update
    }

    await db.notificationChannel.update({
      where: { id: channel.id },
      data: { verified: true, lastError: null },
    });
  } catch (error) {
    await db.notificationChannel.update({
      where: { id: channel.id },
      data: {
        verified: false,
        lastError: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => {});
  }
}
