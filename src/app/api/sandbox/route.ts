import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  isDockerAvailable,
  createSandbox,
} from "@/lib/sandbox/docker";

// POST /api/sandbox — Create a sandbox for a project
// URL-based projects (source="url") skip Docker entirely — they're already running
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    // Verify the project belongs to this user
    const project = await db.project.findUnique({
      where: { id: projectId, userId: session.user.id },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // URL-based projects: already running, no Docker needed
    if (project.source === "url" && project.liveUrl) {
      return NextResponse.json({
        sandbox: {
          containerId: null,
          name: project.name,
          status: "running",
          url: project.liveUrl,
          type: "url-based",
        },
      });
    }

    // Repo-based projects: need Docker sandbox
    const dockerReady = await isDockerAvailable();
    if (!dockerReady) {
      return NextResponse.json(
        {
          error: "Docker is not available",
          message:
            "The Docker daemon is not reachable. For URL-based testing (no Docker needed), create a project with a live URL instead.",
          hint: "For local dev: install Docker Desktop. For production: set DOCKER_HOST env var. Or use URL-based testing by providing a live URL.",
        },
        { status: 503 }
      );
    }

    // Update project status
    await db.project.update({
      where: { id: projectId },
      data: { status: "cloning" },
    });

    // Create the sandbox
    const sandbox = await createSandbox({
      repoUrl: project.repoUrl,
      repoName: project.repoName,
      branch: project.branch,
      sandboxId: project.id,
    });

    // Update project with sandbox info
    await db.project.update({
      where: { id: projectId },
      data: {
        sandboxId: sandbox.containerId,
        sandboxUrl: sandbox.url,
        status: "running",
      },
    });

    return NextResponse.json({ sandbox });
  } catch (error) {
    console.error("Failed to create sandbox:", error);

    // Try to update project status to error
    try {
      const body = await request.json();
      if (body.projectId) {
        await db.project.update({
          where: { id: body.projectId },
          data: { status: "error" },
        });
      }
    } catch {
      // Ignore
    }

    return NextResponse.json(
      { error: "Failed to create sandbox", details: String(error) },
      { status: 500 }
    );
  }
}
