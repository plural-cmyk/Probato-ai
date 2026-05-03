/**
 * GET /api/notifications
 * List notifications for the current user with pagination and filters.
 *
 * Query params:
 * - status: filter by status (unread, read, dismissed) — default: all
 * - type: filter by notification type
 * - limit: page size (default: 20, max: 50)
 * - cursor: pagination cursor
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const type = searchParams.get("type") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const cursor = searchParams.get("cursor") || undefined;

  try {
    const where: any = { userId: session.user.id };
    if (status) where.status = status;
    if (type) where.type = type;

    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1, // Take one extra for cursor pagination
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        project: { select: { id: true, name: true } },
        testRun: { select: { id: true, status: true, triggeredBy: true } },
      },
    });

    // Check if there's a next page
    let nextCursor: string | undefined;
    if (notifications.length > limit) {
      const nextItem = notifications.pop();
      nextCursor = nextItem?.id;
    }

    // Get unread count
    const unreadCount = await db.notification.count({
      where: { userId: session.user.id, status: "unread" },
    });

    return NextResponse.json({
      notifications,
      nextCursor,
      unreadCount,
    });
  } catch (error) {
    console.error("[Notifications] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications
 * Bulk update notifications (e.g., mark all as read).
 *
 * Body:
 * - action: "mark_all_read" | "dismiss_all"
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "mark_all_read") {
      const result = await db.notification.updateMany({
        where: {
          userId: session.user.id,
          status: "unread",
        },
        data: {
          status: "read",
          readAt: new Date(),
        },
      });

      return NextResponse.json({
        message: `Marked ${result.count} notifications as read`,
        count: result.count,
      });
    }

    if (action === "dismiss_all") {
      const result = await db.notification.updateMany({
        where: {
          userId: session.user.id,
          status: { in: ["unread", "read"] },
        },
        data: {
          status: "dismissed",
          readAt: new Date(),
        },
      });

      return NextResponse.json({
        message: `Dismissed ${result.count} notifications`,
        count: result.count,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "mark_all_read" or "dismiss_all"' },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Notifications] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}
