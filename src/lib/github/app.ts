/**
 * Probato GitHub App Integration
 *
 * Handles GitHub App authentication, API calls, status checks, and PR comments.
 * Uses GitHub App installation tokens for API access (not personal tokens).
 *
 * Environment variables required:
 * - GITHUB_APP_ID: GitHub App ID
 * - GITHUB_APP_PRIVATE_KEY: GitHub App private key (PEM format)
 * - GITHUB_APP_WEBHOOK_SECRET: Webhook secret for signature verification
 */

import jwt from "jsonwebtoken";
import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  webhookSecret: string;
}

export interface InstallationTokenResponse {
  token: string;
  expires_at: string;
  permissions: Record<string, string>;
  repository_selection: "all" | "selected";
}

export interface CheckRunOptions {
  owner: string;
  repo: string;
  headSha: string;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required";
  title?: string;
  summary?: string;
  detailsUrl?: string;
}

export interface PRCommentOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
}

// ── Configuration ──────────────────────────────────────────────────

function getConfig(): GitHubAppConfig {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;

  if (!appId || !privateKey || !webhookSecret) {
    throw new Error(
      "GitHub App not configured. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_WEBHOOK_SECRET."
    );
  }

  return { appId, privateKey, webhookSecret };
}

function isConfigured(): boolean {
  return !!(
    process.env.GITHUB_APP_ID &&
    process.env.GITHUB_APP_PRIVATE_KEY &&
    process.env.GITHUB_APP_WEBHOOK_SECRET
  );
}

// ── JWT Generation ─────────────────────────────────────────────────

/**
 * Generate a JWT for GitHub App authentication.
 * The JWT is used to obtain installation access tokens.
 * Valid for 10 minutes max (GitHub requirement).
 */
function generateAppJWT(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 60 seconds in the past to account for clock drift
    exp: now + (10 * 60), // Expires in 10 minutes
    iss: appId,
  };

  return jwt.sign(payload, privateKey, { algorithm: "RS256" });
}

// ── Installation Access Token ──────────────────────────────────────

/**
 * Get an installation access token from GitHub.
 * First checks the database for a cached token that hasn't expired.
 * Falls back to requesting a new token from the GitHub API.
 */
export async function getInstallationToken(installationId: number): Promise<string> {
  // Check DB for cached token
  const installation = await db.installation.findUnique({
    where: { githubInstallationId: installationId },
  });

  if (installation?.accessToken && installation.tokenExpiresAt) {
    // Use token if it has more than 5 minutes until expiry
    const expiresAt = new Date(installation.tokenExpiresAt);
    const bufferMs = 5 * 60 * 1000; // 5 minute buffer
    if (expiresAt.getTime() - Date.now() > bufferMs) {
      return installation.accessToken;
    }
  }

  // Request new token from GitHub
  const config = getConfig();
  const appJWT = generateAppJWT(config.appId, config.privateKey);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJWT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get installation token: ${response.status} ${error}`);
  }

  const data: InstallationTokenResponse = await response.json();

  // Cache the token in the database
  await db.installation.upsert({
    where: { githubInstallationId: installationId },
    update: {
      accessToken: data.token,
      tokenExpiresAt: new Date(data.expires_at),
      repositorySelection: data.repository_selection,
    },
    create: {
      githubInstallationId: installationId,
      accessToken: data.token,
      tokenExpiresAt: new Date(data.expires_at),
      repositorySelection: data.repository_selection,
    },
  });

  return data.token;
}

// ── GitHub API Client ──────────────────────────────────────────────

/**
 * Make an authenticated API call on behalf of a GitHub App installation.
 */
async function githubApi(
  installationId: number,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const token = await getInstallationToken(installationId);

  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GitHub API] ${method} ${path} failed: ${response.status}`, errorText);
    throw new Error(`GitHub API error: ${response.status} ${errorText}`);
  }

  // Some responses have no body (e.g., 204 No Content)
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }
  return null;
}

// ── Check Runs (Commit Status) ─────────────────────────────────────

/**
 * Create a GitHub Check Run for a commit.
 * This shows up as a status check on PRs and commits.
 */
export async function createCheckRun(
  installationId: number,
  options: CheckRunOptions
): Promise<unknown> {
  const { owner, repo, headSha, name, status, conclusion, title, summary, detailsUrl } = options;

  const body: Record<string, unknown> = {
    name,
    head_sha: headSha,
    status,
  };

  if (status === "completed" && conclusion) {
    body.conclusion = conclusion;
  }

  if (title || summary) {
    body.output = {
      title: title || name,
      summary: summary || "",
    };
  }

  if (detailsUrl) {
    body.details_url = detailsUrl;
  }

  return githubApi(
    installationId,
    "POST",
    `/repos/${owner}/${repo}/check-runs`,
    body
  );
}

/**
 * Update an existing GitHub Check Run.
 */
export async function updateCheckRun(
  installationId: number,
  owner: string,
  repo: string,
  checkRunId: number,
  options: Partial<CheckRunOptions>
): Promise<unknown> {
  const body: Record<string, unknown> = {};

  if (options.status) body.status = options.status;
  if (options.conclusion) body.conclusion = options.conclusion;
  if (options.title || options.summary) {
    body.output = {
      title: options.title || "Probato Test Run",
      summary: options.summary || "",
    };
  }
  if (options.detailsUrl) body.details_url = options.detailsUrl;

  return githubApi(
    installationId,
    "PATCH",
    `/repos/${owner}/${repo}/check-runs/${checkRunId}`,
    body
  );
}

// ── PR Comments ────────────────────────────────────────────────────

/**
 * Post a comment on a pull request with test results.
 */
export async function postPRComment(
  installationId: number,
  options: PRCommentOptions
): Promise<unknown> {
  const { owner, repo, pullNumber, body } = options;

  return githubApi(
    installationId,
    "POST",
    `/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
    { body }
  );
}

/**
 * Find existing Probato comment on a PR (to update instead of creating new).
 */
export async function findExistingProbatoComment(
  installationId: number,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<{ id: number } | null> {
  const comments = (await githubApi(
    installationId,
    "GET",
    `/repos/${owner}/${repo}/issues/${pullNumber}/comments?per_page=100`
  )) as Array<{ id: number; body: string; user: { login: string } }>;

  // Find a comment posted by the GitHub App (bot)
  const probatoComment = comments.find(
    (c) => c.body?.includes("<!-- probato-test-report -->")
  );

  return probatoComment ? { id: probatoComment.id } : null;
}

/**
 * Update an existing PR comment.
 */
export async function updatePRComment(
  installationId: number,
  owner: string,
  repo: string,
  commentId: number,
  body: string
): Promise<unknown> {
  return githubApi(
    installationId,
    "PATCH",
    `/repos/${owner}/${repo}/issues/comments/${commentId}`,
    { body }
  );
}

// ── Repository Access ──────────────────────────────────────────────

/**
 * List repositories accessible to a GitHub App installation.
 */
export async function listInstallationRepos(
  installationId: number
): Promise<Array<{ id: number; full_name: string; name: string; private: boolean; default_branch: string; html_url: string }>> {
  const data = (await githubApi(
    installationId,
    "GET",
    "/installation/repositories?per_page=100"
  )) as { repositories: Array<{ id: number; full_name: string; name: string; private: boolean; default_branch: string; html_url: string }> };

  return data.repositories || [];
}

// ── Test Report Formatter ──────────────────────────────────────────

/**
 * Format a test result into a GitHub-flavored Markdown PR comment.
 */
export function formatTestReport(data: {
  projectName: string;
  url: string;
  status: "passed" | "failed" | "error";
  summary: { total: number; passed: number; failed: number; skipped: number; errors: number };
  duration: number;
  steps?: Array<{ action: { type: string; label: string }; status: string; error?: string; duration: number }>;
  triggeredBy: string;
  checkRunId?: number;
}): string {
  const { projectName, url, status, summary, duration, steps, triggeredBy } = data;

  const statusIcon = status === "passed" ? "✅" : status === "failed" ? "❌" : "⚠️";
  const durationSec = (duration / 1000).toFixed(1);

  let report = `<!-- probato-test-report -->\n`;
  report += `## ${statusIcon} Probato Test Report\n\n`;
  report += `**Project:** ${projectName}  \n`;
  report += `**URL:** ${url}  \n`;
  report += `**Status:** ${status.toUpperCase()}  \n`;
  report += `**Triggered by:** ${triggeredBy}  \n`;
  report += `**Duration:** ${durationSec}s  \n\n`;

  // Summary table
  report += `| Total | Passed | Failed | Skipped | Errors |\n`;
  report += `|-------|--------|--------|---------|--------|\n`;
  report += `| ${summary.total} | ${summary.passed} | ${summary.failed} | ${summary.skipped} | ${summary.errors} |\n\n`;

  // Failed steps detail
  if (steps && steps.length > 0) {
    const failedSteps = steps.filter(
      (s) => s.status === "failed" || s.status === "error"
    );
    if (failedSteps.length > 0) {
      report += `### Failed Steps\n\n`;
      for (const step of failedSteps) {
        report += `- **${step.action.type}**: ${step.action.label}`;
        if (step.error) {
          report += ` — \`${step.error}\``;
        }
        report += `\n`;
      }
      report += `\n`;
    }
  }

  report += `---\n*Powered by [Probato](https://probato-ai.vercel.app) - AI-Powered Autonomous Testing*\n`;

  return report;
}

// ── Webhook Signature Verification ─────────────────────────────────

/**
 * Verify that a webhook payload was sent by GitHub using the signature.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  if (!isConfigured()) {
    console.warn("[GitHub] Webhook secret not configured, skipping verification");
    return true; // Allow in development
  }

  const config = getConfig();
  const crypto = require("crypto");
  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", config.webhookSecret)
    .update(payload)
    .digest("hex")}`;

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ── Export ─────────────────────────────────────────────────────────

export const githubApp = {
  isConfigured,
  getConfig,
  getInstallationToken,
  createCheckRun,
  updateCheckRun,
  postPRComment,
  updatePRComment,
  findExistingProbatoComment,
  listInstallationRepos,
  formatTestReport,
  verifyWebhookSignature,
};
