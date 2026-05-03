import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { githubApp } from "@/lib/github/app";

export const dynamic = "force-dynamic";

// ── GET /api/installations ─ List all GitHub App installations ─────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeRepos = searchParams.get("includeRepos") === "true";

    // Fetch all active installations
    const installations = await db.installation.findMany({
      where: { status: { not: "deleted" } },
      include: includeRepos
        ? { repositories: { where: { enabled: true } } }
        : undefined,
      orderBy: { installedAt: "desc" },
    });

    // If GitHub App is configured, also sync repositories from GitHub
    let syncedCount = 0;
    if (githubApp.isConfigured()) {
      for (const installation of installations) {
        if (installation.status === "active") {
          try {
            const repos = await githubApp.listInstallationRepos(
              installation.githubInstallationId
            );

            // Update our DB with latest repo data
            for (const repo of repos) {
              await db.repository.upsert({
                where: { githubRepoId: repo.id },
                create: {
                  githubRepoId: repo.id,
                  name: repo.full_name,
                  fullName: repo.name,
                  private: repo.private,
                  defaultBranch: repo.default_branch,
                  htmlUrl: repo.html_url,
                  installationId: installation.id,
                },
                update: {
                  name: repo.full_name,
                  fullName: repo.name,
                  private: repo.private,
                  defaultBranch: repo.default_branch,
                  htmlUrl: repo.html_url,
                },
              });
              syncedCount++;
            }
          } catch (error) {
            console.error(`[Installations] Failed to sync repos for ${installation.accountLogin}:`, error);
          }
        }
      }
    }

    // Re-fetch with updated data if we synced
    const finalInstallations = syncedCount > 0 && includeRepos
      ? await db.installation.findMany({
          where: { status: { not: "deleted" } },
          include: { repositories: { where: { enabled: true } } },
          orderBy: { installedAt: "desc" },
        })
      : installations;

    // Fetch recent webhook events
    const recentEvents = await db.webhookEvent.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        event: true,
        action: true,
        processed: true,
        processingError: true,
        triggeredTestRunId: true,
        createdAt: true,
        processedAt: true,
      },
    });

    return NextResponse.json({
      installations: finalInstallations.map((inst) => ({
        id: inst.id,
        githubInstallationId: inst.githubInstallationId,
        accountLogin: inst.accountLogin,
        accountType: inst.accountType,
        status: inst.status,
        repositorySelection: inst.repositorySelection,
        installedAt: inst.installedAt,
        repositoryCount: includeRepos
          ? (inst.repositories as any[])?.length || 0
          : undefined,
        repositories: includeRepos
          ? (inst.repositories as any[])?.map((r: any) => ({
              id: r.id,
              name: r.name,
              fullName: r.fullName,
              private: r.private,
              defaultBranch: r.defaultBranch,
              htmlUrl: r.htmlUrl,
              enabled: r.enabled,
              projectId: r.projectId,
            }))
          : undefined,
      })),
      recentEvents,
      syncedFromGitHub: syncedCount > 0,
      totalSyncedRepos: syncedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Installations] GET failed:", message);
    return NextResponse.json(
      { error: "Failed to fetch installations", details: message },
      { status: 500 }
    );
  }
}

// ── PATCH /api/installations ─ Update installation/repo settings ───

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { repositoryId, enabled, projectId } = body;

    if (!repositoryId) {
      return NextResponse.json({ error: "repositoryId is required" }, { status: 400 });
    }

    // Update repository settings
    const updateData: Record<string, any> = {};
    if (typeof enabled === "boolean") updateData.enabled = enabled;
    if (projectId) updateData.projectId = projectId;

    const updated = await db.repository.update({
      where: { id: repositoryId },
      data: updateData,
    });

    return NextResponse.json({
      updated: true,
      repository: {
        id: updated.id,
        name: updated.name,
        enabled: updated.enabled,
        projectId: updated.projectId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Installations] PATCH failed:", message);
    return NextResponse.json(
      { error: "Failed to update installation", details: message },
      { status: 500 }
    );
  }
}
