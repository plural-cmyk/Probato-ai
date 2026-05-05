import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/teams/invitations/[token] — Get invitation details (public preview)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const invitation = await db.teamInvitation.findUnique({
      where: { token },
      include: {
        team: {
          select: { id: true, name: true },
        },
        invitedBy: {
          select: { id: true, name: true },
        },
      },
    });

    if (
      !invitation ||
      invitation.status !== "pending" ||
      invitation.expiresAt <= new Date()
    ) {
      return NextResponse.json(
        { error: "Invitation not found or has expired" },
        { status: 404 }
      );
    }

    // Return only non-sensitive data for preview
    return NextResponse.json({
      invitation: {
        teamName: invitation.team.name,
        role: invitation.role,
        invitedBy: invitation.invitedBy.name,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    console.error("Failed to fetch invitation:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitation" },
      { status: 500 }
    );
  }
}

// POST /api/teams/invitations/[token] — Accept or decline invitation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await params;

    const body = await request.json();
    const { action } = body as { action?: string };

    if (!action || (action !== "accept" && action !== "decline")) {
      return NextResponse.json(
        { error: 'Action must be "accept" or "decline"' },
        { status: 400 }
      );
    }

    const invitation = await db.teamInvitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: `Invitation has already been ${invitation.status}` },
        { status: 400 }
      );
    }

    if (invitation.expiresAt <= new Date()) {
      // Mark as expired
      await db.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: "expired" },
      });
      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 400 }
      );
    }

    if (action === "accept") {
      // Check if user is already a member
      const existingMember = await db.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId: invitation.teamId,
            userId: session.user.id,
          },
        },
      });

      if (existingMember && existingMember.status === "active") {
        return NextResponse.json(
          { error: "You are already a member of this team" },
          { status: 400 }
        );
      }

      // Create TeamMember and update invitation status in a transaction
      await db.$transaction(async (tx) => {
        if (existingMember) {
          // Reactivate previously removed member
          await tx.teamMember.update({
            where: { id: existingMember.id },
            data: { status: "active", role: invitation.role },
          });
        } else {
          await tx.teamMember.create({
            data: {
              teamId: invitation.teamId,
              userId: session.user.id,
              role: invitation.role,
              status: "active",
            },
          });
        }

        await tx.teamInvitation.update({
          where: { id: invitation.id },
          data: {
            status: "accepted",
            acceptedAt: new Date(),
            invitedUserId: session.user.id,
          },
        });
      });

      return NextResponse.json({
        success: true,
        teamId: invitation.teamId,
      });
    }

    // action === "decline"
    await db.teamInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "declined",
        declinedAt: new Date(),
        invitedUserId: session.user.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to process invitation:", error);
    return NextResponse.json(
      { error: "Failed to process invitation" },
      { status: 500 }
    );
  }
}
