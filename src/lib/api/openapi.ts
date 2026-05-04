/**
 * Probato OpenAPI 3.0 Specification Generator
 *
 * Generates a complete OpenAPI spec for the v1 API.
 * Served at /api/v1/docs for SDK generation and interactive docs.
 */

export interface OpenAPISpec {
  openapi: string;
  info: object;
  servers: object[];
  security: object[];
  components: object;
  paths: object;
  tags: object[];
}

export function generateOpenAPISpec(baseUrl: string = "https://probato.ai"): OpenAPISpec {
  return {
    openapi: "3.0.3",
    info: {
      title: "Probato API",
      version: "1.0.0",
      description:
        "The Probato API allows you to programmatically manage projects, trigger test runs, discover features, generate tests, manage schedules, and access visual regression data. Authentication is via API keys (Bearer token) or session cookies.",
      contact: {
        name: "Probato Support",
        email: "support@probato.ai",
        url: "https://probato.ai",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: `${baseUrl}/api/v1`,
        description: "Production",
      },
      {
        url: "http://localhost:3000/api/v1",
        description: "Development",
      },
    ],
    security: [
      { BearerAuth: [] },
      { CookieAuth: [] },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key (pb_live_xxx or pb_test_xxx)",
          description:
            'Pass your API key as a Bearer token: `Authorization: Bearer pb_live_xxx`',
        },
        CookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "next-auth.session-token",
          description: "Session cookie from NextAuth (browser dashboard)",
        },
      },
      schemas: {
        // ── Common ──
        Error: {
          type: "object",
          required: ["error", "status"],
          properties: {
            error: { type: "string", description: "Human-readable error message" },
            status: { type: "integer", description: "HTTP status code" },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            total: { type: "integer", description: "Total number of items" },
            limit: { type: "integer", description: "Items per page" },
            offset: { type: "integer", description: "Current offset" },
            hasMore: { type: "boolean", description: "Whether more items exist" },
          },
        },

        // ── Projects ──
        Project: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique project ID" },
            name: { type: "string", description: "Project name" },
            repoUrl: { type: "string", description: "Repository URL" },
            repoName: { type: "string", description: "Repository name" },
            branch: { type: "string", description: "Default branch" },
            status: {
              type: "string",
              enum: ["pending", "cloning", "ready", "error"],
              description: "Project status",
            },
            lastRunAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        CreateProject: {
          type: "object",
          required: ["name", "repoUrl"],
          properties: {
            name: { type: "string", description: "Project name" },
            repoUrl: { type: "string", description: "Repository URL" },
            repoName: { type: "string", description: "Repository name (defaults to name)" },
            branch: { type: "string", description: "Default branch (defaults to main)" },
          },
        },

        // ── Features ──
        Feature: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: {
              type: "string",
              enum: ["route", "component", "form", "api-endpoint", "page"],
            },
            path: { type: "string", nullable: true },
            route: { type: "string", nullable: true },
            selector: { type: "string", nullable: true },
            description: { type: "string", nullable: true },
            priority: { type: "integer" },
            dependencies: { type: "array", items: { type: "string" } },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        // ── Test Runs ──
        TestRun: {
          type: "object",
          properties: {
            id: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "running", "passed", "failed", "error"],
            },
            triggeredBy: {
              type: "string",
              enum: ["manual", "auto", "auto-heal", "push", "pr", "schedule", "api"],
            },
            startedAt: { type: "string", format: "date-time", nullable: true },
            endedAt: { type: "string", format: "date-time", nullable: true },
            logs: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        TestResult: {
          type: "object",
          properties: {
            id: { type: "string" },
            testName: { type: "string" },
            featureName: { type: "string", nullable: true },
            status: { type: "string", enum: ["passed", "failed", "skipped", "error"] },
            duration: { type: "integer", nullable: true, description: "Duration in ms" },
            error: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        // ── Schedules ──
        Schedule: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            url: { type: "string" },
            preset: { type: "string", enum: ["smoke", "navigation", "login", "form", "full-page-screenshot"] },
            cronExpression: { type: "string" },
            enabled: { type: "boolean" },
            lastRunAt: { type: "string", format: "date-time", nullable: true },
            lastRunStatus: { type: "string", nullable: true },
            nextRunAt: { type: "string", format: "date-time", nullable: true },
            runCount: { type: "integer" },
            failCount: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        CreateSchedule: {
          type: "object",
          required: ["name", "url", "cronExpression"],
          properties: {
            name: { type: "string" },
            url: { type: "string" },
            preset: { type: "string" },
            cronExpression: { type: "string", description: 'Cron expression, e.g. "0 9 * * 1-5"' },
            projectId: { type: "string", nullable: true },
            enabled: { type: "boolean", default: true },
          },
        },

        // ── Visual ──
        VisualBaseline: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            url: { type: "string" },
            selector: { type: "string", nullable: true },
            viewportWidth: { type: "integer" },
            viewportHeight: { type: "integer" },
            approvedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        VisualDiff: {
          type: "object",
          properties: {
            id: { type: "string" },
            status: { type: "string", enum: ["pending", "approved", "rejected"] },
            mismatchPercent: { type: "number" },
            mismatchPixels: { type: "integer" },
            totalPixels: { type: "integer" },
            threshold: { type: "number" },
            reviewNote: { type: "string", nullable: true },
            reviewedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        // ── Billing ──
        CreditBalance: {
          type: "object",
          properties: {
            balance: { type: "integer" },
            monthlyAllowance: { type: "integer" },
            rolloverBalance: { type: "integer" },
            purchasedBalance: { type: "integer" },
            totalUsed: { type: "integer" },
            totalReceived: { type: "integer" },
          },
        },
        SubscriptionInfo: {
          type: "object",
          properties: {
            plan: { type: "string", enum: ["free", "pro", "team", "enterprise"] },
            status: { type: "string", enum: ["active", "past_due", "canceling", "canceled", "trialing"] },
            currentPeriodStart: { type: "string", format: "date-time" },
            currentPeriodEnd: { type: "string", format: "date-time" },
            cancelAtPeriodEnd: { type: "boolean" },
          },
        },

        // ── API Keys ──
        ApiKey: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            prefix: { type: "string", description: "First 8 chars of the key" },
            scopes: {
              type: "array",
              items: { type: "string", enum: ["read", "write", "admin", "billing"] },
            },
            enabled: { type: "boolean" },
            lastUsedAt: { type: "string", format: "date-time", nullable: true },
            expiresAt: { type: "string", format: "date-time", nullable: true },
            rateLimitOverride: { type: "integer", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            usageCount: { type: "integer", description: "Requests in last 30 days" },
          },
        },
        CreateApiKey: {
          type: "object",
          required: ["name", "scopes"],
          properties: {
            name: { type: "string", description: "Human-readable label" },
            scopes: {
              type: "array",
              items: { type: "string", enum: ["read", "write", "admin", "billing"] },
            },
            expiresInDays: { type: "integer", nullable: true, description: "Days until expiration (null = never)" },
            rateLimitOverride: { type: "integer", nullable: true, description: "Custom rate limit (requests/min)" },
          },
        },
        ApiKeyCreated: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            key: { type: "string", description: "Full API key — shown only once!" },
            prefix: { type: "string" },
            scopes: { type: "array", items: { type: "string" } },
            expiresAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            warning: { type: "string" },
          },
        },
      },
    },
    paths: {
      // ── Health ──
      "/health": {
        get: {
          summary: "Health check",
          description: "Returns API status and available endpoints",
          security: [],
          responses: {
            "200": {
              description: "API is healthy",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },

      // ── Projects ──
      "/projects": {
        get: {
          tags: ["Projects"],
          summary: "List projects",
          description: "List all projects for the authenticated user",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "Items per page (max 100)" },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 }, description: "Pagination offset" },
            { name: "status", in: "query", schema: { type: "string", enum: ["pending", "cloning", "ready", "error"] }, description: "Filter by status" },
          ],
          responses: {
            "200": { description: "List of projects" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          tags: ["Projects"],
          summary: "Create project",
          description: "Create a new project. Requires write scope.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateProject" } } },
          },
          responses: {
            "201": { description: "Project created" },
            "400": { description: "Validation error" },
            "403": { description: "Project limit reached" },
          },
        },
      },
      "/projects/{id}": {
        get: {
          tags: ["Projects"],
          summary: "Get project",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Project details" }, "404": { description: "Not found" } },
        },
        patch: {
          tags: ["Projects"],
          summary: "Update project",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Updated" }, "404": { description: "Not found" } },
        },
        delete: {
          tags: ["Projects"],
          summary: "Delete project",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Deleted" }, "404": { description: "Not found" } },
        },
      },

      // ── Features ──
      "/projects/{id}/features": {
        get: {
          tags: ["Features"],
          summary: "List project features",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: { "200": { description: "Feature list" }, "404": { description: "Project not found" } },
        },
        post: {
          tags: ["Features"],
          summary: "Add feature to project",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["name", "type"], properties: { name: { type: "string" }, type: { type: "string", enum: ["route", "component", "form", "api-endpoint", "page"] }, path: { type: "string" }, route: { type: "string" }, selector: { type: "string" }, description: { type: "string" }, priority: { type: "integer" } } } } },
          },
          responses: { "201": { description: "Feature created" }, "400": { description: "Validation error" } },
        },
      },

      // ── Test Runs ──
      "/projects/{id}/test-runs": {
        get: {
          tags: ["Test Runs"],
          summary: "List test runs",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: { "200": { description: "Test run list" } },
        },
        post: {
          tags: ["Test Runs"],
          summary: "Trigger test run",
          description: "Create a new test run. Costs 2 credits (1 minute minimum).",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "201": { description: "Test run created" },
            "402": { description: "Insufficient credits" },
          },
        },
      },
      "/projects/{id}/test-runs/{runId}": {
        get: {
          tags: ["Test Runs"],
          summary: "Get test run details",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "runId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Test run with results" }, "404": { description: "Not found" } },
        },
      },

      // ── Discovery & Generation ──
      "/discover": {
        post: {
          tags: ["Discovery"],
          summary: "Discover features",
          description: "AI-powered feature discovery from a URL. Costs 6 credits.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["url"], properties: { url: { type: "string" }, projectId: { type: "string" } } } } },
          },
          responses: { "202": { description: "Discovery initiated" }, "402": { description: "Insufficient credits" } },
        },
      },
      "/generate": {
        post: {
          tags: ["Generation"],
          summary: "Generate tests",
          description: "AI-powered Playwright test generation. Costs 5 credits.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", properties: { projectId: { type: "string" }, featureIds: { type: "array", items: { type: "string" } }, url: { type: "string" } } } } },
          },
          responses: { "202": { description: "Generation initiated" }, "402": { description: "Insufficient credits" } },
        },
      },

      // ── Schedules ──
      "/schedules": {
        get: {
          tags: ["Schedules"],
          summary: "List schedules",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: { "200": { description: "Schedule list" } },
        },
        post: {
          tags: ["Schedules"],
          summary: "Create schedule",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateSchedule" } } },
          },
          responses: { "201": { description: "Schedule created" }, "403": { description: "Schedule limit reached" } },
        },
      },
      "/schedules/{id}": {
        get: {
          tags: ["Schedules"],
          summary: "Get schedule",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Schedule details" }, "404": { description: "Not found" } },
        },
        patch: {
          tags: ["Schedules"],
          summary: "Update schedule",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Updated" }, "404": { description: "Not found" } },
        },
        delete: {
          tags: ["Schedules"],
          summary: "Delete schedule",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Deleted" }, "404": { description: "Not found" } },
        },
      },

      // ── Visual Regression ──
      "/visual/baselines": {
        get: {
          tags: ["Visual Regression"],
          summary: "List baselines",
          description: "Requires Pro plan or higher",
          parameters: [
            { name: "projectId", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: { "200": { description: "Baseline list" }, "403": { description: "Feature not available" } },
        },
      },
      "/visual/compare": {
        post: {
          tags: ["Visual Regression"],
          summary: "Compare screenshots",
          description: "Compare current screenshot against baseline. Costs 3 credits. Requires Pro plan.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", properties: { baselineId: { type: "string" }, url: { type: "string" }, selector: { type: "string" }, projectId: { type: "string" } } } } },
          },
          responses: { "202": { description: "Comparison initiated" }, "402": { description: "Insufficient credits" }, "403": { description: "Pro plan required" } },
        },
      },
      "/visual/diffs": {
        get: {
          tags: ["Visual Regression"],
          summary: "List diffs",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["pending", "approved", "rejected"] } },
            { name: "projectId", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: { "200": { description: "Diff list" } },
        },
      },
      "/visual/diffs/{id}": {
        get: {
          tags: ["Visual Regression"],
          summary: "Get diff details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Diff details" }, "404": { description: "Not found" } },
        },
      },

      // ── Billing ──
      "/billing": {
        get: {
          tags: ["Billing"],
          summary: "Get billing overview",
          description: "Requires billing scope",
          responses: { "200": { description: "Billing summary" } },
        },
      },
      "/billing/credits": {
        get: {
          tags: ["Billing"],
          summary: "Get credit balance",
          description: "Requires billing scope",
          responses: { "200": { description: "Credit balance and history" } },
        },
      },
      "/billing/subscription": {
        get: {
          tags: ["Billing"],
          summary: "Get subscription details",
          description: "Requires billing scope",
          responses: { "200": { description: "Subscription info" } },
        },
      },

      // ── Usage ──
      "/usage": {
        get: {
          tags: ["Usage"],
          summary: "Get API usage stats",
          parameters: [
            { name: "days", in: "query", schema: { type: "integer", default: 30 }, description: "Days to look back (max 90)" },
            { name: "apiKeyId", in: "query", schema: { type: "string" }, description: "Filter by specific API key" },
          ],
          responses: { "200": { description: "Usage statistics" } },
        },
      },
    },
    tags: [
      { name: "Projects", description: "Manage testing projects" },
      { name: "Features", description: "Project feature management" },
      { name: "Test Runs", description: "Trigger and monitor test executions" },
      { name: "Discovery", description: "AI-powered feature discovery" },
      { name: "Generation", description: "AI-powered test generation" },
      { name: "Schedules", description: "Scheduled and recurring tests" },
      { name: "Visual Regression", description: "Visual baseline and diff management" },
      { name: "Billing", description: "Subscription and credit management" },
      { name: "Usage", description: "API usage analytics" },
    ],
  };
}
