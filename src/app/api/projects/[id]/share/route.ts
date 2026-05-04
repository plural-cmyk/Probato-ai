import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const VALID_PERMISSIONS = ["view", "edit", "admin"] as const;
type ValidPermission = (typeof VALID_PERMISSIONS)[number];

// GET /api/projects/[id]/share — List who a project is shared with
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Verify user owns the project
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (project.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Only the project owner can view sharing details" },
        { status: 403 }
      );
    }

    const shares = await db.sharedProject.findMany({
      where: { projectId },
      include: {
        sharedWithUser: {
          select: { id: true, name: true, email: true, image: true },
        },
        sharedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ shares });
  } catch (error) {
    console.error("Failed to fetch project shares:", error);
    return NextResponse.json(
      { error: "Failed to fetch project shares" },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/share — Share project with a user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Verify user owns the project
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (project.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Only the project owner can share the project" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, permission } = body as {
      email?: string;
      permission?: string;
    };

    if (!email || typeof email !== "string" || email.trim().length === 0) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (
      !permission ||
      !VALID_PERMISSIONS.includes(permission as ValidPermission)
    ) {
      return NextResponse.json(
        {
          error: `Invalid permission. Valid permissions are: ${VALID_PERMISSIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Find user by email
    const targetUser = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "No user found with this email address" },
        { status: 404 }
      );
    }

    // Can't share with yourself
    if (targetUser.id === session.user.id) {
      return NextResponse.json(
        { error: "You cannot share a project with yourself" },
        { status: 400 }
      );
    }

    // Create or update SharedProject record
    const share = await db.sharedProject.upsert({
      where: {
        projectId_sharedWithUserId: {
          projectId,
          sharedWithUserId: targetUser.id,
        },
      },
      update: {
        permission,
      },
      create: {
        projectId,
        sharedByUserId: session.user.id,
        sharedWithUserId: targetUser.id,
        permission,
      },
      include: {
        sharedWithUser: {
          select: { id: true, name: true, email: true, image: true },
        },
        sharedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({ share }, { status: 201 });
  } catch (error) {
    console.error("Failed to share project:", error);
    return NextResponse.json(
      { error: "Failed to share project" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/share — Revoke sharing
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Verify user owns the project
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (project.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Only the project owner can revoke sharing" },
        { status: 403 }
      );
    }

    // Get userId from body
    let userId: string | undefined;
    try {
      const body = await request.json();
      userId = body.userId;
    } catch {
      // No body or invalid JSON
    }

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Find and delete the SharedProject record
    const sharedProject = await db.sharedProject.findUnique({
      where: {
        projectId_sharedWithUserId: {
          projectId,
          sharedWithUserId: userId,
        },
      },
    });

    if (!sharedProject) {
      return NextResponse.json(
        { error: "Share record not found" },
        { status: 404 }
      );
    }

    await db.sharedProject.delete({
      where: { id: sharedProject.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to revoke sharing:", error);
    return NextResponse.json(
      { error: "Failed to revoke sharing" },
      { status: 500 }
    );
  }
}
