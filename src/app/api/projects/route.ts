import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/projects — List all projects for the authenticated user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projects = await db.project.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// POST /api/projects — Create a new project (repo-based or URL-based)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { repoUrl, repoName, branch, liveUrl, source } = body;

    // Two creation paths:
    // 1. URL-based: source="url", liveUrl required → instant "running" status
    // 2. Repo-based: source="repo" (default), repoUrl + repoName required → "pending" status

    if (source === "url" || liveUrl) {
      // URL-based project: user provides a live URL, no Docker needed
      if (!liveUrl || !liveUrl.trim()) {
        return NextResponse.json(
          { error: "liveUrl is required for URL-based projects" },
          { status: 400 }
        );
      }

      const projectName =
        repoName?.trim() ||
        new URL(liveUrl.startsWith("http") ? liveUrl : `https://${liveUrl}`).hostname.replace(/^www\./, "");

      const project = await db.project.create({
        data: {
          name: projectName,
          repoUrl: "",
          repoName: "",
          liveUrl: liveUrl.trim(),
          source: "url",
          status: "running", // URL-based projects are immediately ready
          branch: "main",
          userId: session.user.id,
        },
      });

      return NextResponse.json({ project }, { status: 201 });
    }

    // Repo-based project: user provides a GitHub repo URL
    if (!repoUrl || !repoName) {
      return NextResponse.json(
        { error: "repoUrl and repoName are required for repo-based projects" },
        { status: 400 }
      );
    }

    const project = await db.project.create({
      data: {
        name: repoName,
        repoUrl,
        repoName,
        source: "repo",
        status: "pending",
        branch: branch ?? "main",
        userId: session.user.id,
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
