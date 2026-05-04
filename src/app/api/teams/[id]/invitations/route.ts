import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import crypto from "crypto";

const VALID_INVITE_ROLES = ["admin", "member", "viewer"] as const;
type ValidInviteRole = (typeof VALID_INVITE_ROLES)[number];

// POST /api/teams/[id]/invitations — Invite a user to the team
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: teamId } = await params;

    // Verify caller is owner or admin
    const callerMembership = await db.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId: session.user.id },
      },
    });

    if (!callerMembership || callerMembership.status !== "active") {
      return NextResponse.json(
        { error: "You are not a member of this team" },
        { status: 403 }
      );
    }

    if (callerMembership.role !== "owner" && callerMembership.role !== "admin") {
      return NextResponse.json(
        { error: "Only team owners or admins can send invitations" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, role, message } = body as {
      email?: string;
      role?: string;
      message?: string;
    };

    if (!email || typeof email !== "string" || email.trim().length === 0) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const inviteRole = role && VALID_INVITE_ROLES.includes(role as ValidInviteRole)
      ? role
      : "member";

    // Check team member limit
    const team = await db.team.findUnique({
      where: { id: teamId },
      include: {
        _count: { select: { members: true } },
      },
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (team._count.members >= team.maxMembers) {
      return NextResponse.json(
        { error: "Team has reached the maximum number of members" },
        { status: 400 }
      );
    }

    // Check if user with that email exists
    const invitedUser = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // Check if the user is already a member
    if (invitedUser) {
      const existingMember = await db.teamMember.findUnique({
        where: {
          teamId_userId: { teamId, userId: invitedUser.id },
        },
      });

      if (existingMember && existingMember.status === "active") {
        return NextResponse.json(
          { error: "This user is already a member of the team" },
          { status: 400 }
        );
      }
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await db.teamInvitation.findFirst({
      where: {
        teamId,
        email: email.trim().toLowerCase(),
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: "A pending invitation already exists for this email" },
        { status: 400 }
      );
    }

    // Generate a secure token and set expiration to 7 days from now
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await db.teamInvitation.create({
      data: {
        teamId,
        email: email.trim().toLowerCase(),
        role: inviteRole,
        token,
        message: message ?? null,
        expiresAt,
        invitedByUserId: session.user.id,
        invitedUserId: invitedUser?.id ?? null,
      },
      include: {
        team: {
          select: { id: true, name: true, slug: true },
        },
        invitedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    console.error("Failed to create invitation:", error);
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 }
    );
  }
}

// GET /api/teams/[id]/invitations — List pending invitations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: teamId } = await params;

    // Verify user is a member of the team
    const membership = await db.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId: session.user.id },
      },
    });

    if (!membership || membership.status !== "active") {
      return NextResponse.json(
        { error: "You are not a member of this team" },
        { status: 403 }
      );
    }

    const invitations = await db.teamInvitation.findMany({
      where: {
        teamId,
        status: "pending",
      },
      include: {
        invitedBy: {
          select: { id: true, name: true, email: true },
        },
        invitedUser: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ invitations });
  } catch (error) {
    console.error("Failed to fetch invitations:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}
