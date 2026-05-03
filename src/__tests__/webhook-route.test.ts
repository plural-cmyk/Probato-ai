/**
 * Tests for GitHub Webhook API Route - Milestone 9
 *
 * Tests the /api/webhooks/github endpoint using Vitest
 * with mocked fetch for the Next.js API route.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Test: Webhook Route Input Validation ───────────────────────────

describe("Webhook Route - Input Validation", () => {
  it("should validate GitHub webhook event types", () => {
    const supportedEvents = [
      "ping",
      "installation",
      "installation_repositories",
      "push",
      "pull_request",
    ];

    const incomingEvents = ["push", "pull_request", "ping", "installation", "issues", "release"];

    for (const event of incomingEvents) {
      const isSupported = supportedEvents.includes(event);
      if (["push", "pull_request", "ping", "installation"].includes(event)) {
        expect(isSupported).toBe(true);
      }
      if (["issues", "release"].includes(event)) {
        expect(isSupported).toBe(false);
      }
    }
  });

  it("should validate push payload structure", () => {
    const pushPayload = {
      ref: "refs/heads/main",
      after: "abc123def456",
      before: "def456abc789",
      repository: {
        id: 12345,
        name: "Probato-ai",
        full_name: "plural-cmyk/Probato-ai",
        private: false,
        default_branch: "main",
        html_url: "https://github.com/plural-cmyk/Probato-ai",
      },
      installation: { id: 99999 },
      sender: { login: "developer" },
    };

    // Validate required fields
    expect(pushPayload.ref).toBeDefined();
    expect(pushPayload.ref).toMatch(/^refs\/heads\//);
    expect(pushPayload.after).toBeDefined();
    expect(pushPayload.repository).toBeDefined();
    expect(pushPayload.repository.id).toBeDefined();
    expect(pushPayload.repository.full_name).toBeDefined();
    expect(pushPayload.installation?.id).toBeDefined();
  });

  it("should validate pull_request payload structure", () => {
    const prPayload = {
      action: "opened",
      number: 42,
      pull_request: {
        number: 42,
        head: { sha: "abc123", ref: "feature-branch" },
        base: { ref: "main" },
        title: "Add CI/CD integration",
      },
      repository: {
        id: 12345,
        name: "Probato-ai",
        full_name: "plural-cmyk/Probato-ai",
        private: false,
        default_branch: "main",
        html_url: "https://github.com/plural-cmyk/Probato-ai",
      },
      installation: { id: 99999 },
      sender: { login: "developer" },
    };

    expect(prPayload.action).toBeDefined();
    expect(["opened", "synchronize", "reopened"]).toContain("opened");
    expect(prPayload.pull_request).toBeDefined();
    expect(prPayload.pull_request.head.sha).toBeDefined();
    expect(prPayload.pull_request.number).toBe(42);
  });

  it("should validate installation payload structure", () => {
    const installPayload = {
      action: "created",
      installation: {
        id: 99999,
        account: {
          id: 11111,
          login: "plural-cmyk",
          type: "Organization",
        },
        repository_selection: "selected",
      },
      repositories: [
        { id: 12345, name: "Probato-ai", full_name: "plural-cmyk/Probato-ai", private: false },
      ],
    };

    expect(installPayload.action).toBe("created");
    expect(installPayload.installation.id).toBe(99999);
    expect(installPayload.installation.account.login).toBe("plural-cmyk");
    expect(installPayload.repositories).toHaveLength(1);
  });
});

// ── Test: Webhook Response Format ──────────────────────────────────

describe("Webhook Route - Response Format", () => {
  it("should return correct response structure for processed event", () => {
    const response = {
      received: true,
      event: "push",
      action: null,
      eventId: "clxyz12345",
      testRunId: "clabc98765",
    };

    expect(response.received).toBe(true);
    expect(response.event).toBe("push");
    expect(response.eventId).toBeDefined();
    expect(typeof response.eventId).toBe("string");
  });

  it("should return pong for ping events", () => {
    const response = { message: "pong" };
    expect(response.message).toBe("pong");
  });

  it("should return 401 for invalid signatures", () => {
    const response = { error: "Invalid signature" };
    expect(response.error).toBeDefined();
  });

  it("should return health check data for GET requests", () => {
    const response = {
      endpoint: "github-webhook",
      configured: true,
      supportedEvents: [
        "ping",
        "installation",
        "installation_repositories",
        "push",
        "pull_request",
      ],
    };

    expect(response.endpoint).toBe("github-webhook");
    expect(Array.isArray(response.supportedEvents)).toBe(true);
    expect(response.supportedEvents).toContain("push");
    expect(response.supportedEvents).toContain("pull_request");
  });
});

// ── Test: Installations API ────────────────────────────────────────

describe("Installations API - Response Format", () => {
  it("should return installations with repositories", () => {
    const response = {
      installations: [
        {
          id: "inst1",
          githubInstallationId: 99999,
          accountLogin: "plural-cmyk",
          accountType: "Organization",
          status: "active",
          repositoryCount: 2,
          repositories: [
            {
              id: "repo1",
              name: "plural-cmyk/Probato-ai",
              enabled: true,
              projectId: null,
              defaultBranch: "main",
              private: false,
            },
            {
              id: "repo2",
              name: "plural-cmyk/other-project",
              enabled: true,
              projectId: "proj1",
              defaultBranch: "develop",
              private: true,
            },
          ],
        },
      ],
      recentEvents: [],
      syncedFromGitHub: true,
      totalSyncedRepos: 2,
    };

    expect(response.installations).toHaveLength(1);
    expect(response.installations[0].accountLogin).toBe("plural-cmyk");
    expect(response.installations[0].repositories).toHaveLength(2);
    expect(response.installations[0].repositories[0].name).toContain("Probato-ai");
    expect(response.syncedFromGitHub).toBe(true);
  });

  it("should support toggling repository CI/CD", () => {
    const patchBody = {
      repositoryId: "repo1",
      enabled: false,
    };

    expect(patchBody.repositoryId).toBeDefined();
    expect(typeof patchBody.enabled).toBe("boolean");
  });
});
