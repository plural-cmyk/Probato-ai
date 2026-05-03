/**
 * Probato GitHub Webhook Event Processor
 *
 * Processes incoming GitHub webhook events and triggers appropriate actions:
 * - installation: Track app installations/uninstallations
 * - push: Trigger test runs on push to watched branches
 * - pull_request: Trigger test runs on PR open/sync, post status checks
 */

import { db } from "@/lib/db";
import {
  githubApp,
  formatTestReport,
} from "./app";
import { executeTestRun } from "@/lib/agent/test-executor";
import { sel, actions, TestAction } from "@/lib/agent/actions";
import {
  dispatchNotification,
  buildTestRunNotificationTitle,
  buildTestRunNotificationMessage,
} from "@/lib/notifications/dispatcher";

// ── Types ──────────────────────────────────────────────────────────

interface GitHubWebhookPayload {
  action?: string;
  installation?: {
    id: number;
    account?: {
      id: number;
      login: string;
      type: string;
    };
    repository_selection?: string;
  };
  repository?: {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    html_url: string;
  };
  ref?: string;
  after?: string;
  before?: string;
  pull_request?: {
    number: number;
    head: {
      sha: string;
      ref: string;
    };
    base: {
      ref: string;
    };
    title: string;
  };
  sender?: {
    login: string;
  };
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
}

// ── Main Processor ─────────────────────────────────────────────────

/**
 * Process a GitHub webhook event.
 * Returns the ID of the created WebhookEvent record.
 */
export async function processWebhookEvent(
  event: string,
  deliveryId: string | null,
  payload: GitHubWebhookPayload
): Promise<{ eventId: string; testRunId?: string }> {
  const installationId = payload.installation?.id;

  // Record the webhook event in the database
  const webhookEvent = await db.webhookEvent.create({
    data: {
      githubDeliveryId: deliveryId,
      event,
      action: payload.action ?? null,
      payload: payload as any,
      installationId: installationId
        ? (await findOrCreateInstallation(installationId, payload))?.id
        : null,
      processed: false,
    },
  });

  try {
    let triggeredTestRunId: string | undefined;

    switch (event) {
      case "installation":
      case "installation_repositories":
        await handleInstallationEvent(webhookEvent.id, payload);
        break;

      case "push":
        triggeredTestRunId = await handlePushEvent(webhookEvent.id, payload);
        break;

      case "pull_request":
        triggeredTestRunId = await handlePullRequestEvent(webhookEvent.id, payload);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event}`);
    }

    // Mark as processed
    await db.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        processed: true,
        processedAt: new Date(),
        triggeredTestRunId,
      },
    });

    return { eventId: webhookEvent.id, testRunId: triggeredTestRunId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Webhook] Failed to process ${event}:`, message);

    await db.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        processed: true,
        processingError: message,
        processedAt: new Date(),
      },
    });

    return { eventId: webhookEvent.id };
  }
}

// ── Installation Events ────────────────────────────────────────────

async function findOrCreateInstallation(
  githubInstallationId: number,
  payload: GitHubWebhookPayload
) {
  const account = payload.installation?.account;

  return db.installation.upsert({
    where: { githubInstallationId },
    create: {
      githubInstallationId,
      accountId: account?.id,
      accountLogin: account?.login,
      accountType: account?.type,
      repositorySelection: payload.installation?.repository_selection,
      status: "active",
    },
    update: {
      accountId: account?.id,
      accountLogin: account?.login,
      accountType: account?.type,
      repositorySelection: payload.installation?.repository_selection,
    },
  });
}

async function handleInstallationEvent(
  eventId: string,
  payload: GitHubWebhookPayload
): Promise<void> {
  const installationId = payload.installation?.id;
  if (!installationId) return;

  const action = payload.action;

  if (action === "created") {
    // New installation — record it and sync repositories
    const installation = await findOrCreateInstallation(installationId, payload);

    // Sync repositories if we have API access
    if (githubApp.isConfigured()) {
      try {
        const repos = await githubApp.listInstallationRepos(installationId);
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
        }
        console.log(`[Installation] Synced ${repos.length} repositories for installation ${installationId}`);
      } catch (error) {
        console.error(`[Installation] Failed to sync repos:`, error);
      }
    }

    console.log(`[Installation] Created: ${payload.installation?.account?.login} (#${installationId})`);
  } else if (action === "deleted") {
    // Installation removed — mark as deleted
    await db.installation.updateMany({
      where: { githubInstallationId: installationId },
      data: { status: "deleted", accessToken: null, tokenExpiresAt: null },
    });

    console.log(`[Installation] Deleted: #${installationId}`);
  } else if (action === "suspend") {
    await db.installation.updateMany({
      where: { githubInstallationId: installationId },
      data: { status: "suspended" },
    });
  } else if (action === "unsuspend") {
    await db.installation.updateMany({
      where: { githubInstallationId: installationId },
      data: { status: "active" },
    });
  }

  // Handle repository addition/removal within an installation
  if (payload.repositories_added || payload.repositories_removed) {
    const installation = await db.installation.findUnique({
      where: { githubInstallationId: installationId },
    });
    if (!installation) return;

    // Add new repositories
    if (payload.repositories_added) {
      for (const repo of payload.repositories_added as Array<{ id: number; name: string; full_name: string; private: boolean }>) {
        await db.repository.upsert({
          where: { githubRepoId: repo.id },
          create: {
            githubRepoId: repo.id,
            name: repo.full_name,
            fullName: repo.name,
            private: repo.private,
            installationId: installation.id,
          },
          update: {
            name: repo.full_name,
            fullName: repo.name,
            private: repo.private,
          },
        });
      }
    }

    // Disable removed repositories
    if (payload.repositories_removed) {
      for (const repo of payload.repositories_removed as Array<{ id: number; name: string; full_name: string; private: boolean }>) {
        await db.repository.updateMany({
          where: { githubRepoId: repo.id },
          data: { enabled: false },
        });
      }
    }
  }
}

// ── Push Events ────────────────────────────────────────────────────

async function handlePushEvent(
  eventId: string,
  payload: GitHubWebhookPayload
): Promise<string | undefined> {
  const installationId = payload.installation?.id;
  const repo = payload.repository;
  const ref = payload.ref;

  if (!installationId || !repo || !ref) return;

  // Only trigger on branch pushes (not tags)
  if (!ref.startsWith("refs/heads/")) return;

  const branch = ref.replace("refs/heads/", "");

  // Check if this repository is enabled for CI/CD
  const repoRecord = await db.repository.findUnique({
    where: { githubRepoId: repo.id },
    include: { installation: true },
  });

  if (!repoRecord || !repoRecord.enabled) {
    console.log(`[Push] Repository ${repo.full_name} not enabled, skipping`);
    return;
  }

  // Find or create a project for this repo
  let project = repoRecord.projectId
    ? await db.project.findUnique({ where: { id: repoRecord.projectId } })
    : null;

  if (!project) {
    // Auto-create project for this repo
    project = await db.project.create({
      data: {
        name: repo.name,
        repoUrl: repo.html_url ?? `https://github.com/${repo.full_name}`,
        repoName: repo.full_name,
        branch,
        status: "ready",
        userId: "github-app", // System user for app-triggered runs
      },
    });

    // Link repo to project
    await db.repository.update({
      where: { id: repoRecord.id },
      data: { projectId: project.id },
    });
  }

  const commitSha = payload.after!;
  const commitUrl = `https://github.com/${repo.full_name}/commit/${commitSha}`;

  console.log(`[Push] ${repo.full_name}:${branch} (${commitSha.substring(0, 7)}) — triggering test run`);

  // Create check run (queued)
  let checkRunId: number | undefined;
  if (githubApp.isConfigured()) {
    try {
      const checkRun = (await githubApp.createCheckRun(installationId, {
        owner: repo.full_name.split("/")[0],
        repo: repo.full_name.split("/")[1],
        headSha: commitSha,
        name: "Probato Test Suite",
        status: "queued",
        title: "Probato Test Suite",
        summary: "Test run queued...",
        detailsUrl: `${process.env.NEXTAUTH_URL || "https://probato-ai.vercel.app"}/dashboard/projects/${project.id}`,
      })) as any;

      checkRunId = checkRun?.id;
    } catch (error) {
      console.error("[Push] Failed to create check run:", error);
    }
  }

  // Build test actions (smoke test by default for push events)
  const testUrl = project.sandboxUrl || project.repoUrl;
  const testActions: TestAction[] = buildPushTestActions(testUrl, branch);

  // Execute the test run
  try {
    // Update check run to in_progress
    if (checkRunId && githubApp.isConfigured()) {
      await githubApp.updateCheckRun(installationId, {
        owner: repo.full_name.split("/")[0],
        repo: repo.full_name.split("/")[1],
        headSha: commitSha,
        name: "Probato Test Suite",
        status: "in_progress",
        title: "Probato Test Suite",
        summary: "Tests are running...",
      } as any).catch(() => {});
    }

    const result = await executeTestRun({
      url: testUrl,
      actions: testActions,
      screenshotEveryStep: true,
      maxSteps: 30,
      timeout: 15000,
    });

    // Persist test run
    const testRun = await db.testRun.create({
      data: {
        projectId: project.id,
        status: result.status,
        triggeredBy: `push:${payload.sender?.login || "unknown"}`,
        logs: JSON.stringify(result.summary),
        startedAt: new Date(result.startedAt),
        endedAt: new Date(result.endedAt),
      },
    });

    // Persist step results
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      await db.testResult.create({
        data: {
          testRunId: testRun.id,
          testName: `step-${i}`,
          featureName: step.action.type,
          status: step.status,
          duration: step.duration,
          error: step.error ?? null,
          screenshot: step.screenshot ?? null,
        },
      });
    }

    // Update check run with result
    if (checkRunId && githubApp.isConfigured()) {
      const conclusion = result.status === "passed" ? "success" :
        result.status === "failed" ? "failure" : "neutral";

      const summaryText = result.summary.failed > 0
        ? `${result.summary.failed} of ${result.summary.total} tests failed`
        : `All ${result.summary.total} tests passed in ${(result.duration / 1000).toFixed(1)}s`;

      await githubApp.updateCheckRun(installationId, {
        owner: repo.full_name.split("/")[0],
        repo: repo.full_name.split("/")[1],
        headSha: commitSha,
        name: "Probato Test Suite",
        status: "completed",
        conclusion,
        title: "Probato Test Suite",
        summary: summaryText,
        detailsUrl: `${process.env.NEXTAUTH_URL || "https://probato-ai.vercel.app"}/dashboard/projects/${project.id}`,
      } as any).catch(() => {});
    }

    // Dispatch notification to project owner
    try {
      const notifType = result.status === "passed" ? "test_pass" as const
        : result.status === "failed" ? "test_fail" as const
        : "test_error" as const;
      await dispatchNotification({
        type: notifType,
        title: buildTestRunNotificationTitle(result.status, project.name, `push:${payload.sender?.login || "unknown"}`),
        message: buildTestRunNotificationMessage(project.name, result.status, result.summary, result.duration),
        userId: project.userId,
        projectId: project.id,
        testRunId: testRun.id,
        actionUrl: `${process.env.NEXTAUTH_URL || "https://probato-ai.vercel.app"}/dashboard/projects/${project.id}`,
        priority: result.status === "failed" ? "high" : result.status === "error" ? "critical" : "low",
        metadata: {
          commitSha,
          branch,
          repoName: repo.full_name,
          triggeredBy: "push",
        },
      });
    } catch (notifError) {
      console.error("[Push] Failed to dispatch notification:", notifError);
    }

    return testRun.id;
  } catch (error) {
    // Mark check run as failed
    if (checkRunId && githubApp.isConfigured()) {
      await githubApp.updateCheckRun(installationId, {
        owner: repo.full_name.split("/")[0],
        repo: repo.full_name.split("/")[1],
        headSha: commitSha,
        name: "Probato Test Suite",
        status: "completed",
        conclusion: "failure",
        title: "Probato Test Suite",
        summary: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
      } as any).catch(() => {});
    }
    throw error;
  }
}

// ── Pull Request Events ────────────────────────────────────────────

async function handlePullRequestEvent(
  eventId: string,
  payload: GitHubWebhookPayload
): Promise<string | undefined> {
  const installationId = payload.installation?.id;
  const repo = payload.repository;
  const pr = payload.pull_request;
  const action = payload.action;

  if (!installationId || !repo || !pr) return;

  // Only trigger on open, synchronize (new commits), and reopen
  if (!["opened", "synchronize", "reopened"].includes(action || "")) {
    console.log(`[PR] Ignoring action: ${action} for PR #${pr.number}`);
    return;
  }

  // Check if this repository is enabled for CI/CD
  const repoRecord = await db.repository.findUnique({
    where: { githubRepoId: repo.id },
    include: { installation: true },
  });

  if (!repoRecord || !repoRecord.enabled) {
    console.log(`[PR] Repository ${repo.full_name} not enabled, skipping`);
    return;
  }

  // Find or create a project
  let project = repoRecord.projectId
    ? await db.project.findUnique({ where: { id: repoRecord.projectId } })
    : null;

  if (!project) {
    project = await db.project.create({
      data: {
        name: repo.name,
        repoUrl: repo.html_url ?? `https://github.com/${repo.full_name}`,
        repoName: repo.full_name,
        branch: pr.base.ref,
        status: "ready",
        userId: "github-app",
      },
    });

    await db.repository.update({
      where: { id: repoRecord.id },
      data: { projectId: project.id },
    });
  }

  const headSha = pr.head.sha;
  const owner = repo.full_name.split("/")[0];
  const repoName = repo.full_name.split("/")[1];

  console.log(`[PR] #${pr.number} (${action}) on ${repo.full_name} — triggering test run`);

  // Create check run (queued)
  let checkRunId: number | undefined;
  if (githubApp.isConfigured()) {
    try {
      const checkRun = (await githubApp.createCheckRun(installationId, {
        owner,
        repo: repoName,
        headSha,
        name: "Probato Test Suite",
        status: "queued",
        title: "Probato Test Suite",
        summary: "Test run queued for this pull request...",
        detailsUrl: `${process.env.NEXTAUTH_URL || "https://probato-ai.vercel.app"}/dashboard/projects/${project.id}`,
      })) as any;

      checkRunId = checkRun?.id;
    } catch (error) {
      console.error("[PR] Failed to create check run:", error);
    }
  }

  // Build test actions
  const testUrl = project.sandboxUrl || project.repoUrl;
  const testActions: TestAction[] = buildPRTestActions(testUrl, pr.number);

  // Execute test run
  try {
    // Update check run to in_progress
    if (checkRunId && githubApp.isConfigured()) {
      await githubApp.updateCheckRun(installationId, {
        owner,
        repo: repoName,
        headSha,
        name: "Probato Test Suite",
        status: "in_progress",
        title: "Probato Test Suite",
        summary: `Running tests for PR #${pr.number}: "${pr.title}"`,
      } as any).catch(() => {});
    }

    const result = await executeTestRun({
      url: testUrl,
      actions: testActions,
      screenshotEveryStep: true,
      maxSteps: 30,
      timeout: 15000,
    });

    // Persist test run
    const testRun = await db.testRun.create({
      data: {
        projectId: project.id,
        status: result.status,
        triggeredBy: `pr:${pr.number}:${action}`,
        logs: JSON.stringify(result.summary),
        startedAt: new Date(result.startedAt),
        endedAt: new Date(result.endedAt),
      },
    });

    // Persist step results
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      await db.testResult.create({
        data: {
          testRunId: testRun.id,
          testName: `step-${i}`,
          featureName: step.action.type,
          status: step.status,
          duration: step.duration,
          error: step.error ?? null,
          screenshot: step.screenshot ?? null,
        },
      });
    }

    // Update check run with results
    if (checkRunId && githubApp.isConfigured()) {
      const conclusion = result.status === "passed" ? "success" :
        result.status === "failed" ? "failure" : "neutral";

      await githubApp.updateCheckRun(installationId, {
        owner,
        repo: repoName,
        headSha,
        name: "Probato Test Suite",
        status: "completed",
        conclusion,
        title: "Probato Test Suite",
        summary: formatTestReport({
          projectName: project.name,
          url: testUrl,
          status: result.status,
          summary: result.summary,
          duration: result.duration,
          steps: result.steps as any,
          triggeredBy: `PR #${pr.number} (${action})`,
        }),
        detailsUrl: `${process.env.NEXTAUTH_URL || "https://probato-ai.vercel.app"}/dashboard/projects/${project.id}`,
      } as any).catch(() => {});
    }

    // Post PR comment with test results
    if (githubApp.isConfigured()) {
      try {
        const commentBody = formatTestReport({
          projectName: project.name,
          url: testUrl,
          status: result.status,
          summary: result.summary,
          duration: result.duration,
          steps: result.steps as any,
          triggeredBy: `PR #${pr.number} (${action})`,
        });

        // Check for existing comment to update instead of creating a new one
        const existing = await githubApp.findExistingProbatoComment(
          installationId, owner, repoName, pr.number
        );

        if (existing) {
          await githubApp.updatePRComment(
            installationId, owner, repoName, existing.id, commentBody
          );
        } else {
          await githubApp.postPRComment(installationId, {
            owner,
            repo: repoName,
            pullNumber: pr.number,
            body: commentBody,
          });
        }
      } catch (error) {
        console.error("[PR] Failed to post comment:", error);
      }
    }

    // Dispatch notification to project owner
    try {
      const notifType = result.status === "passed" ? "test_pass" as const
        : result.status === "failed" ? "test_fail" as const
        : "test_error" as const;
      await dispatchNotification({
        type: notifType,
        title: buildTestRunNotificationTitle(result.status, project.name, `pr:${pr.number}:${action}`),
        message: buildTestRunNotificationMessage(project.name, result.status, result.summary, result.duration),
        userId: project.userId,
        projectId: project.id,
        testRunId: testRun.id,
        actionUrl: `${process.env.NEXTAUTH_URL || "https://probato-ai.vercel.app"}/dashboard/projects/${project.id}`,
        priority: result.status === "failed" ? "high" : result.status === "error" ? "critical" : "low",
        metadata: {
          prNumber: pr.number,
          prTitle: pr.title,
          headSha,
          repoName: repo.full_name,
          triggeredBy: "pull_request",
        },
      });
    } catch (notifError) {
      console.error("[PR] Failed to dispatch notification:", notifError);
    }

    return testRun.id;
  } catch (error) {
    // Mark check run as failed
    if (checkRunId && githubApp.isConfigured()) {
      await githubApp.updateCheckRun(installationId, {
        owner,
        repo: repoName,
        headSha,
        name: "Probato Test Suite",
        status: "completed",
        conclusion: "failure",
        title: "Probato Test Suite",
        summary: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
      } as any).catch(() => {});
    }
    throw error;
  }
}

// ── Test Action Builders ───────────────────────────────────────────

function buildPushTestActions(url: string, branch: string): TestAction[] {
  return [
    actions.navigate(url, `Navigate to ${url} (branch: ${branch})`),
    actions.waitForSelector(sel.css("body"), 10000, "Wait for page body"),
    actions.screenshot(false, "Page loaded on push"),
    actions.assertVisible(sel.css("body"), "Verify page body is visible"),
    actions.scroll("down", 300, "Scroll down to check content"),
    actions.screenshot(false, "After scroll"),
  ];
}

function buildPRTestActions(url: string, prNumber: number): TestAction[] {
  return [
    actions.navigate(url, `Navigate to ${url} (PR #${prNumber})`),
    actions.waitForSelector(sel.css("body"), 10000, "Wait for page body"),
    actions.screenshot(false, `PR #${prNumber} - Page loaded`),
    actions.assertVisible(sel.css("body"), "Verify page body is visible"),
    // Check for common elements
    actions.waitForSelector(sel.css("nav, header, [role=navigation]"), 5000, "Check for navigation"),
    actions.screenshot(false, `PR #${prNumber} - Navigation check`),
    actions.scroll("down", 300, "Scroll down"),
    actions.screenshot(false, `PR #${prNumber} - After scroll`),
  ];
}
