import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/comments — List comments for a project/test run
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const testRunId = searchParams.get("testRunId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    // Verify user has access to the project (owner or shared with)
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

    const hasAccess =
      project.userId === session.user.id ||
      (await db.sharedProject.findUnique({
        where: {
          projectId_sharedWithUserId: {
            projectId,
            sharedWithUserId: session.user.id,
          },
        },
      })) !== null ||
      (await db.teamMember.findFirst({
        where: {
          userId: session.user.id,
          team: { projects: { some: { id: projectId } } },
          status: "active",
        },
      })) !== null;

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You do not have access to this project" },
        { status: 403 }
      );
    }

    // Build where clause
    const where: Record<string, unknown> = {
      projectId,
      parentId: null, // Only top-level comments; replies are included via include
    };

    if (testRunId) {
      where.testRunId = testRunId;
    }

    const comments = await db.comment.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
        replies: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Failed to fetch comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

// POST /api/comments — Add a comment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, content, testRunId, parentId } = body as {
      projectId?: string;
      content?: string;
      testRunId?: string;
      parentId?: string;
    };

    if (!projectId || !content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "projectId and content are required" },
        { status: 400 }
      );
    }

    // Verify user has access to the project
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

    const hasAccess =
      project.userId === session.user.id ||
      (await db.sharedProject.findUnique({
        where: {
          projectId_sharedWithUserId: {
            projectId,
            sharedWithUserId: session.user.id,
          },
        },
      })) !== null ||
      (await db.teamMember.findFirst({
        where: {
          userId: session.user.id,
          team: { projects: { some: { id: projectId } } },
          status: "active",
        },
      })) !== null;

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You do not have access to this project" },
        { status: 403 }
      );
    }

    // If parentId is provided, verify the parent comment exists in the same project
    if (parentId) {
      const parentComment = await db.comment.findUnique({
        where: { id: parentId },
      });

      if (!parentComment || parentComment.projectId !== projectId) {
        return NextResponse.json(
          { error: "Parent comment not found in this project" },
          { status: 404 }
        );
      }

      // Don't allow replies to replies (only one level of nesting)
      if (parentComment.parentId) {
        return NextResponse.json(
          { error: "Cannot reply to a reply. Only one level of nesting is supported." },
          { status: 400 }
        );
      }
    }

    const comment = await db.comment.create({
      data: {
        projectId,
        userId: session.user.id,
        content: content.trim(),
        testRunId: testRunId ?? null,
        parentId: parentId ?? null,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("Failed to create comment:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
