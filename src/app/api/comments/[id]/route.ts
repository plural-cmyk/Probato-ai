import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// PATCH /api/comments/[id] — Update comment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const comment = await db.comment.findUnique({
      where: { id },
      include: {
        project: {
          select: { userId: true },
        },
      },
    });

    if (!comment) {
      return NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { content, resolved } = body as {
      content?: string;
      resolved?: boolean;
    };

    const updateData: Record<string, unknown> = {};

    // Only the comment author can update the content
    if (content !== undefined) {
      if (comment.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Only the comment author can update the content" },
          { status: 403 }
        );
      }

      if (typeof content !== "string" || content.trim().length === 0) {
        return NextResponse.json(
          { error: "Content cannot be empty" },
          { status: 400 }
        );
      }

      updateData.content = content.trim();
    }

    // Only the comment author or the project owner can resolve/unresolve
    if (resolved !== undefined) {
      if (
        comment.userId !== session.user.id &&
        comment.project.userId !== session.user.id
      ) {
        return NextResponse.json(
          { error: "Only the comment author or project owner can resolve comments" },
          { status: 403 }
        );
      }

      updateData.resolved = resolved;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updatedComment = await db.comment.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return NextResponse.json({ comment: updatedComment });
  } catch (error) {
    console.error("Failed to update comment:", error);
    return NextResponse.json(
      { error: "Failed to update comment" },
      { status: 500 }
    );
  }
}

// DELETE /api/comments/[id] — Delete comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const comment = await db.comment.findUnique({
      where: { id },
      include: {
        project: {
          select: { userId: true },
        },
      },
    });

    if (!comment) {
      return NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      );
    }

    // Verify user is the comment author or project owner
    if (
      comment.userId !== session.user.id &&
      comment.project.userId !== session.user.id
    ) {
      return NextResponse.json(
        { error: "Only the comment author or project owner can delete comments" },
        { status: 403 }
      );
    }

    await db.comment.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete comment:", error);
    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 }
    );
  }
}
