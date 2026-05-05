import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const VALID_ROLES = ["admin", "member", "viewer"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

// GET /api/teams/[id]/members — List team members
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

    const members = await db.teamMember.findMany({
      where: { teamId, status: "active" },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Failed to fetch team members:", error);
    return NextResponse.json(
      { error: "Failed to fetch team members" },
      { status: 500 }
    );
  }
}

// PATCH /api/teams/[id]/members — Update member role
export async function PATCH(
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
        { error: "Only team owners or admins can update member roles" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, role } = body as { userId?: string; role?: string };

    if (!userId || !role) {
      return NextResponse.json(
        { error: "userId and role are required" },
        { status: 400 }
      );
    }

    if (!VALID_ROLES.includes(role as ValidRole)) {
      return NextResponse.json(
        { error: `Invalid role. Valid roles are: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    // Find the target member
    const targetMember = await db.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    if (!targetMember || targetMember.status !== "active") {
      return NextResponse.json(
        { error: "Member not found in this team" },
        { status: 404 }
      );
    }

    // Can't change the owner's role
    if (targetMember.role === "owner") {
      return NextResponse.json(
        { error: "Cannot change the owner's role" },
        { status: 400 }
      );
    }

    const member = await db.teamMember.update({
      where: { id: targetMember.id },
      data: { role },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return NextResponse.json({ member });
  } catch (error) {
    console.error("Failed to update member role:", error);
    return NextResponse.json(
      { error: "Failed to update member role" },
      { status: 500 }
    );
  }
}

// DELETE /api/teams/[id]/members — Remove member
export async function DELETE(
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
        { error: "Only team owners or admins can remove members" },
        { status: 403 }
      );
    }

    // Get userId from query params or body
    let userId: string | undefined;

    const url = new URL(request.url);
    userId = url.searchParams.get("userId") ?? undefined;

    if (!userId) {
      try {
        const body = await request.json();
        userId = body.userId;
      } catch {
        // No body or invalid JSON
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Find the target member
    const targetMember = await db.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    if (!targetMember || targetMember.status !== "active") {
      return NextResponse.json(
        { error: "Member not found in this team" },
        { status: 404 }
      );
    }

    // Can't remove the owner
    if (targetMember.role === "owner") {
      return NextResponse.json(
        { error: "Cannot remove the team owner" },
        { status: 400 }
      );
    }

    await db.teamMember.delete({
      where: { id: targetMember.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
