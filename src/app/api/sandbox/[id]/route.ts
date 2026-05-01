import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  isDockerAvailable,
  getSandboxStatus,
  destroySandbox,
  getSandboxLogs,
} from "@/lib/sandbox/docker";

// GET /api/sandbox/[id] — Get sandbox status + logs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify the project belongs to this user
    const project = await db.project.findUnique({
      where: { id, userId: session.user.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.sandboxId) {
      return NextResponse.json({
        status: "no_sandbox",
        project: { id: project.id, name: project.repoName, status: project.status },
      });
    }

    // Check Docker
    const dockerReady = await isDockerAvailable();
    if (!dockerReady) {
      return NextResponse.json({
        status: "docker_unavailable",
        project: { id: project.id, name: project.repoName, status: project.status },
        message: "Docker daemon is not reachable",
      });
    }

    // Get container status
    const sandboxInfo = await getSandboxStatus(project.sandboxId);
    const logs = await getSandboxLogs(project.sandboxId, 50);

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.repoName,
        status: project.status,
        sandboxUrl: project.sandboxUrl,
      },
      sandbox: sandboxInfo,
      logs,
    });
  } catch (error) {
    console.error("Failed to get sandbox status:", error);
    return NextResponse.json(
      { error: "Failed to get sandbox status" },
      { status: 500 }
    );
  }
}

// DELETE /api/sandbox/[id] — Stop and destroy a sandbox
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

    // Verify the project belongs to this user
    const project = await db.project.findUnique({
      where: { id, userId: session.user.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.sandboxId) {
      return NextResponse.json({ error: "No sandbox to destroy" }, { status: 400 });
    }

    // Destroy the container
    const destroyed = await destroySandbox(project.sandboxId);

    // Update the project
    await db.project.update({
      where: { id },
      data: {
        sandboxId: null,
        sandboxUrl: null,
        status: destroyed ? "pending" : "error",
      },
    });

    return NextResponse.json({ destroyed });
  } catch (error) {
    console.error("Failed to destroy sandbox:", error);
    return NextResponse.json(
      { error: "Failed to destroy sandbox" },
      { status: 500 }
    );
  }
}
