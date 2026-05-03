/**
 * PATCH /api/notifications/[id]
 * Update a single notification (mark as read, dismiss).
 *
 * Body:
 * - status: "read" | "dismissed"
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
    const body = await req.json();
    const { status } = body;

    if (!status || !["read", "dismissed"].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Use "read" or "dismissed"' },
        { status: 400 }
      );
    }

    // Verify ownership
    const notification = await db.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== session.user.id) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    const updated = await db.notification.update({
      where: { id },
      data: {
        status,
        readAt: status === "read" ? new Date() : notification.readAt,
      },
    });

    return NextResponse.json({ notification: updated });
  } catch (error) {
    console.error("[Notifications] PATCH [id] error:", error);
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications/[id]
 * Delete a single notification.
 */
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
    const notification = await db.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== session.user.id) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    await db.notification.delete({ where: { id } });

    return NextResponse.json({ message: "Notification deleted" });
  } catch (error) {
    console.error("[Notifications] DELETE [id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete notification" },
      { status: 500 }
    );
  }
}
