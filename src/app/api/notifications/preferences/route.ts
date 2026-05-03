/**
 * GET /api/notifications/preferences
 * Get the current user's notification preferences.
 *
 * PATCH /api/notifications/preferences
 * Update notification preferences.
 *
 * Body:
 * - eventType: the notification event type
 * - inApp, email, slack, webhook: booleans
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureUserPreferences } from "@/lib/notifications/dispatcher";

const VALID_EVENT_TYPES = [
  "test_pass", "test_fail", "test_error", "visual_diff",
  "schedule_complete", "auto_heal", "webhook_received",
];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const preferences = await ensureUserPreferences(session.user.id);

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("[Notifications/Prefs] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { eventType, inApp, email, slack, webhook } = body;

    if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
      return NextResponse.json(
        { error: `Invalid eventType. Must be one of: ${VALID_EVENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const updated = await db.notificationPreference.upsert({
      where: { userId_eventType: { userId: session.user.id, eventType } },
      create: {
        userId: session.user.id,
        eventType,
        inApp: inApp ?? true,
        email: email ?? false,
        slack: slack ?? false,
        webhook: webhook ?? false,
      },
      update: {
        ...(inApp !== undefined ? { inApp } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(slack !== undefined ? { slack } : {}),
        ...(webhook !== undefined ? { webhook } : {}),
      },
    });

    return NextResponse.json({ preference: updated });
  } catch (error) {
    console.error("[Notifications/Prefs] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
