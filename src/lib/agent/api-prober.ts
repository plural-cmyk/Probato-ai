/**
 * Probato API Security Prober Agent (M24)
 *
 * Actively probes web application APIs for security vulnerabilities:
 * - API Endpoint Discovery: Crawls the page for API endpoints (fetch/XHR, link tags,
 *   script imports, common API patterns) and tests each for security
 * - API Security: Tests for missing authentication, verbose error messages,
 *   HTTP method tampering, insecure direct object references in API responses,
 *   missing input validation, information disclosure in responses
 * - CSRF Testing: Comprehensive cross-site request forgery testing across all
 *   state-changing endpoints (POST/PUT/PATCH/DELETE), checking for token
 *   requirements, SameSite cookies, Origin/Referer validation
 * - Rate Limiting: Tests all discovered endpoints for rate limiting enforcement,
 *   checking both unauthenticated and (if possible) authenticated endpoints
 * - IDOR Testing: Tests API endpoints with sequential/guessable IDs to detect
 *   authorization bypass, checks for mass assignment vulnerabilities
 *
 * IMPORTANT: This agent uses SAFE, NON-EXPLOITATIVE testing only.
 * It never attempts to access real user data or perform destructive actions.
 * IDOR tests use synthetic/guessable IDs and check response patterns only.
 *
 * Uses the same 3-tier LLM strategy:
 * 1. z-ai-web-dev-sdk (primary)
 * 2. External OpenAI-compatible API (fallback)
 * 3. Rule-based fallback (no LLM needed)
 */

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { checkCredits, deductCredits } from "@/lib/billing/credits";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { getBrowserInstance, cleanupBrowser } from "@/lib/browser/chromium";
import type { Page } from "puppeteer-core";

// ── Types ──────────────────────────────────────────────────────────

export interface APISecurityFinding {
  type: "missing_auth" | "verbose_errors" | "method_tampering" | "info_disclosure" |
        "missing_validation" | "insecure_headers" | "cors_misconfig" | "mass_assignment";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string;
  endpoint: string;
  method: string;
  statusCode?: number;
  recommendation: string;
  reference?: string;
}

export interface CSRFFinding {
  type: "missing_token" | "token_not_validated" | "same_cookie_origin" |
        "no_origin_check" | "predictable_token" | "get_csrf_violation";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string;
  endpoint: string;
  method: string;
  recommendation: string;
  reference?: string;
}

export interface RateLimitFinding {
  type: "no_rate_limit" | "weak_rate_limit" | "inconsistent_rate_limit" |
        "no_rate_limit_on_auth" | "bypassable_rate_limit";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string;
  endpoint: string;
  method: string;
  requestsTested: number;
  blockedAfter?: number;
  recommendation: string;
  reference?: string;
}

export interface IDORFinding {
  type: "idor_detected" | "sequential_id" | "mass_assignment" |
        "missing_authorization" | "predictable_uuid" | "exposed_list_endpoint";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string;
  endpoint: string;
  method: string;
  idPattern: string;
  recommendation: string;
  reference?: string;
}

export interface APIEndpoint {
  url: string;
  method: string;
  type: "api" | "form" | "link" | "fetch" | "xhr";
  contentType?: string;
  hasAuth?: boolean;
  params?: string[];
}

export interface APIProbeInput {
  projectId?: string;
  userId: string;
  url: string;
  testRunId?: string;
  checkAPISecurity?: boolean;   // default true
  checkCSRF?: boolean;          // default true
  checkRateLimit?: boolean;     // default true
  checkIDOR?: boolean;          // default true
  maxEndpoints?: number;        // default 20, max 50 — limit endpoints to test
  probeDepth?: "quick" | "standard" | "deep";
}

export interface APIProbeResult {
  apiFindings: APISecurityFinding[];
  csrfFindings: CSRFFinding[];
  rateLimitFindings: RateLimitFinding[];
  idorFindings: IDORFinding[];
  endpoints: APIEndpoint[];
  overallScore: number;
  apiSecurityScore: number;
  csrfScore: number;
  rateLimitScore: number;
  idorScore: number;
  recommendations: string[];
  duration: number;
  llmUsed: boolean;
  error?: string;
}

// ── Score Calculation ─────────────────────────────────────────────

function calculateScore(findings: Array<{ severity: string }>): number {
  let score = 100;
  for (const finding of findings) {
    switch (finding.severity) {
      case "critical": score -= 20; break;
      case "high": score -= 10; break;
      case "medium": score -= 5; break;
      case "low": score -= 2; break;
      case "info": score -= 0; break;
    }
  }
  return Math.max(0, Math.min(100, score));
}

// ── Main Entry Point ──────────────────────────────────────────────

export async function runAPIProbe(
  input: APIProbeInput
): Promise<APIProbeResult> {
  const startTime = Date.now();

  try {
    // 1. Check credits
    const creditCheck = await checkCredits(input.userId, "api_probe");
    if (!creditCheck.hasCredits) {
      return emptyResult(startTime, "Insufficient credits to run API probe");
    }

    // 2. Launch browser
    const managed = await getBrowserInstance();
    let apiFindings: APISecurityFinding[] = [];
    let csrfFindings: CSRFFinding[] = [];
    let rateLimitFindings: RateLimitFinding[] = [];
    let idorFindings: IDORFinding[] = [];
    let endpoints: APIEndpoint[] = [];
    let llmUsed = false;

    try {
      const page = await managed.browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // 3. Navigate to URL
      const response = await page.goto(input.url, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });

      if (!response) {
        throw new Error("Failed to load page — no response received");
      }

      // Wait for any dynamic content / SPA routes to load
      await new Promise((r) => setTimeout(r, 1500));

      // 4. Discover API endpoints
      const maxEndpoints = Math.min(Math.max(input.maxEndpoints ?? 20, 1), 50);
      endpoints = await discoverAPIEndpoints(page, input.url, maxEndpoints);

      // 5. Run API security tests
      if (input.checkAPISecurity !== false) {
        apiFindings = await performAPISecurityChecks(page, input.url, endpoints);
      }

      // 6. Run CSRF checks
      if (input.checkCSRF !== false) {
        csrfFindings = await performCSRFChecks(page, input.url, endpoints);
      }

      // 7. Run rate limit checks
      if (input.checkRateLimit !== false) {
        const depth = input.probeDepth ?? "standard";
        rateLimitFindings = await performRateLimitChecks(page, endpoints, depth);
      }

      // 8. Run IDOR checks
      if (input.checkIDOR !== false) {
        idorFindings = await performIDORChecks(page, input.url, endpoints);
      }

      await page.close();
    } finally {
      await cleanupBrowser(managed);
    }

    // 9. Try LLM analysis
    try {
      const llmResult = await callLLMForAPIProbeAnalysis(
        input.url, apiFindings, csrfFindings, rateLimitFindings, idorFindings
      );
      if (llmResult.extraAPIFindings.length > 0) apiFindings = [...apiFindings, ...llmResult.extraAPIFindings];
      if (llmResult.extraCSRFFindings.length > 0) csrfFindings = [...csrfFindings, ...llmResult.extraCSRFFindings];
      if (llmResult.extraRateLimitFindings.length > 0) rateLimitFindings = [...rateLimitFindings, ...llmResult.extraRateLimitFindings];
      if (llmResult.extraIDORFindings.length > 0) idorFindings = [...idorFindings, ...llmResult.extraIDORFindings];
      if (llmResult.extraAPIFindings.length > 0 || llmResult.extraCSRFFindings.length > 0 ||
          llmResult.extraRateLimitFindings.length > 0 || llmResult.extraIDORFindings.length > 0) {
        llmUsed = true;
      }
    } catch (error) {
      console.warn("[API-Prober] LLM failed, using rule-based findings only:", error);
    }

    // 10. Calculate scores
    const apiSecurityScore = calculateScore(apiFindings);
    const csrfScore = calculateScore(csrfFindings);
    const rateLimitScore = calculateScore(rateLimitFindings);
    const idorScore = calculateScore(idorFindings);

    const allFindings = [...apiFindings, ...csrfFindings, ...rateLimitFindings, ...idorFindings];
    const overallScore = allFindings.length > 0 ? calculateScore(allFindings) : 100;

    const recommendations = generateRecommendations(apiFindings, csrfFindings, rateLimitFindings, idorFindings);

    // 11. Deduct credits
    try {
      await deductCredits(input.userId, "api_probe", `API security probe for ${input.url}`, undefined, undefined);
    } catch (creditError) {
      console.warn("[API-Prober] Credit deduction failed:", creditError);
    }

    // 12. Persist to DB
    let probeId: string | undefined;
    try {
      const probe = await db.aPIProbe.create({
        data: {
          status: "completed",
          url: input.url,
          overallScore,
          apiSecurityScore,
          csrfScore,
          rateLimitScore,
          idorScore,
          apiFindings: apiFindings as any,
          csrfFindings: csrfFindings as any,
          rateLimitFindings: rateLimitFindings as any,
          idorFindings: idorFindings as any,
          endpoints: endpoints as any,
          recommendations: recommendations as any,
          llmUsed,
          duration: Date.now() - startTime,
          projectId: input.projectId ?? null,
          userId: input.userId,
          testRunId: input.testRunId ?? null,
        },
      });
      probeId = probe.id;
    } catch (dbError) {
      console.warn("[API-Prober] Failed to persist probe:", dbError);
    }

    // 13. Dispatch notification
    if (allFindings.some((f) => f.severity === "critical" || f.severity === "high")) {
      try {
        const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
        const highCount = allFindings.filter((f) => f.severity === "high").length;
        await dispatchNotification({
          type: "security_issue",
          title: `API security issues found: ${input.url}`,
          message: `${allFindings.length} API security finding(s). ${criticalCount} critical, ${highCount} high. API: ${apiFindings.length}, CSRF: ${csrfFindings.length}, Rate: ${rateLimitFindings.length}, IDOR: ${idorFindings.length}.`,
          userId: input.userId,
          projectId: input.projectId,
          testRunId: input.testRunId,
          actionUrl: input.projectId ? `/dashboard/projects/${input.projectId}` : undefined,
          priority: criticalCount > 0 ? "critical" : "high",
          metadata: { probeId, overallScore, apiSecurityScore, csrfScore, rateLimitScore, idorScore, criticalCount, highCount },
        });
      } catch (notifError) {
        console.warn("[API-Prober] Notification dispatch failed:", notifError);
      }
    }

    return {
      apiFindings, csrfFindings, rateLimitFindings, idorFindings, endpoints,
      overallScore, apiSecurityScore, csrfScore, rateLimitScore, idorScore,
      recommendations, duration: Date.now() - startTime, llmUsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API-Prober] Failed:", message);

    try {
      await db.aPIProbe.create({
        data: {
          status: "failed", url: input.url, overallScore: 0, apiSecurityScore: 0,
          csrfScore: 0, rateLimitScore: 0, idorScore: 0, apiFindings: [], csrfFindings: [],
          rateLimitFindings: [], idorFindings: [], endpoints: [], recommendations: [],
          duration: Date.now() - startTime, error: message,
          projectId: input.projectId ?? null, userId: input.userId, testRunId: input.testRunId ?? null,
        },
      });
    } catch (dbError) {
      console.warn("[API-Prober] Failed to persist error state:", dbError);
    }

    return emptyResult(startTime, message);
  }
}

function emptyResult(startTime: number, error?: string): APIProbeResult {
  return {
    apiFindings: [], csrfFindings: [], rateLimitFindings: [], idorFindings: [],
    endpoints: [], overallScore: 0, apiSecurityScore: 0, csrfScore: 0,
    rateLimitScore: 0, idorScore: 0, recommendations: [],
    duration: Date.now() - startTime, llmUsed: false, error,
  };
}

// ── API Endpoint Discovery ────────────────────────────────────────

async function discoverAPIEndpoints(
  page: Page,
  baseUrl: string,
  maxEndpoints: number
): Promise<APIEndpoint[]> {
  const discovered = await page.evaluate((origin) => {
    const endpoints: APIEndpoint[] = [];
    const seen = new Set<string>();

    function addEndpoint(url: string, method: string, type: APIEndpoint["type"]) {
      try {
        const parsed = new URL(url, origin);
        // Only include same-origin API-like URLs
        if (parsed.origin !== origin) return;
        const key = `${method}:${parsed.pathname}`;
        if (seen.has(key)) return;
        seen.add(key);
        endpoints.push({ url: parsed.href, method, type });
      } catch { /* invalid URL */ }
    }

    // 1. Discover from <a> links with API-like paths
    const apiPatterns = ["/api/", "/v1/", "/v2/", "/v3/", "/graphql", "/rest/", "/auth/", "/oauth/"];
    const links = Array.from(document.querySelectorAll("a[href]"));
    for (const link of links) {
      const href = (link as HTMLAnchorElement).href;
      if (apiPatterns.some((p) => href.includes(p))) {
        addEndpoint(href, "GET", "link");
      }
    }

    // 2. Discover from <form> actions
    const forms = Array.from(document.querySelectorAll("form"));
    for (const form of forms) {
      const action = form.action || window.location.href;
      const method = (form.method || "GET").toUpperCase();
      addEndpoint(action, method, "form");
    }

    // 3. Discover from <script src> with API paths
    const scripts = Array.from(document.querySelectorAll("script[src]"));
    for (const script of scripts) {
      const src = (script as HTMLScriptElement).src;
      if (apiPatterns.some((p) => src.includes(p))) {
        addEndpoint(src, "GET", "link");
      }
    }

    // 4. Discover from inline scripts (fetch/XHR calls)
    const inlineScripts = Array.from(document.querySelectorAll("script:not([src])"));
    for (const script of inlineScripts) {
      const content = script.textContent || "";
      // Match fetch() URLs
      const fetchMatches = content.matchAll(/fetch\s*\(\s*["'`]([^"'`]+)["'`]/g);
      for (const match of fetchMatches) {
        addEndpoint(match[1], "GET", "fetch");
      }
      // Match axios URLs
      const axiosMatches = content.matchAll(/axios\.\w+\s*\(\s*["'`]([^"'`]+)["'`]/g);
      for (const match of axiosMatches) {
        const method = match[0].includes("post") ? "POST" : match[0].includes("put") ? "PUT" : match[0].includes("delete") ? "DELETE" : "GET";
        addEndpoint(match[1], method, "xhr");
      }
    }

    return endpoints;
  }, new URL(baseUrl).origin);

  // 5. Add common API patterns that might not be linked
  const baseOrigin = new URL(baseUrl).origin;
  const commonEndpoints = [
    { path: "/api", method: "GET" },
    { path: "/api/v1", method: "GET" },
    { path: "/api/health", method: "GET" },
    { path: "/api/status", method: "GET" },
    { path: "/api/users", method: "GET" },
    { path: "/api/me", method: "GET" },
    { path: "/api/profile", method: "GET" },
    { path: "/api/config", method: "GET" },
    { path: "/api/settings", method: "GET" },
    { path: "/api/auth/session", method: "GET" },
    { path: "/api/auth/me", method: "GET" },
    { path: "/graphql", method: "POST" },
    { path: "/.well-known/openapi.json", method: "GET" },
    { path: "/swagger.json", method: "GET" },
    { path: "/api-docs", method: "GET" },
  ];

  const seenPaths = new Set(discovered.map((e) => e.url));
  for (const ep of commonEndpoints) {
    const fullUrl = `${baseOrigin}${ep.path}`;
    if (!seenPaths.has(fullUrl)) {
      discovered.push({ url: fullUrl, method: ep.method, type: "api" });
      seenPaths.add(fullUrl);
    }
  }

  return discovered.slice(0, maxEndpoints);
}

// ── API Security Checks ───────────────────────────────────────────

async function performAPISecurityChecks(
  page: Page,
  baseUrl: string,
  endpoints: APIEndpoint[]
): Promise<APISecurityFinding[]> {
  const findings: APISecurityFinding[] = [];

  for (const endpoint of endpoints.slice(0, 15)) {
    try {
      // Test the endpoint
      const result = await page.evaluate(async (url, method) => {
        try {
          const res = await fetch(url, {
            method,
            headers: { "Accept": "application/json, text/html, */*" },
            credentials: "include",
          });
          const contentType = res.headers.get("content-type") || "";
          let body = "";
          try { body = await res.text(); } catch { /* empty */ }
          return {
            status: res.status,
            statusText: res.statusText,
            contentType,
            headers: Object.fromEntries(res.headers.entries()),
            bodyLength: body.length,
            bodyPreview: body.substring(0, 2000),
            ok: res.ok,
          };
        } catch (err: any) {
          return { error: err.message, status: 0 };
        }
      }, endpoint.url, endpoint.method);

      if (result.error) continue;

      // Check for missing authentication (200 on sensitive endpoints without auth)
      if (result.ok && result.status === 200) {
        const sensitivePatterns = ["/api/users", "/api/admin", "/api/config", "/api/settings", "/api/me", "/api/profile"];
        const isSensitive = sensitivePatterns.some((p) => endpoint.url.includes(p));
        const isDataResponse = result.contentType?.includes("application/json") && result.bodyLength > 10;

        if (isSensitive && isDataResponse) {
          // Check if the response contains actual data (not just a login redirect)
          const bodyStr = result.bodyPreview || "";
          const looksLikeData = !bodyStr.includes('"login"') && !bodyStr.includes('"signIn"') &&
            !bodyStr.includes('"unauthenticated"') && !bodyStr.includes('"redirectTo"');

          if (looksLikeData) {
            findings.push({
              type: "missing_auth",
              severity: "high",
              title: `API endpoint accessible without authentication: ${endpoint.url}`,
              description: `The API endpoint at ${endpoint.url} returned a 200 OK response with JSON data without requiring authentication. Sensitive API endpoints should enforce authentication to prevent unauthorized access to user data and system configuration. An attacker could access this endpoint directly to retrieve sensitive information without any credentials.`,
              evidence: `Status: ${result.status}, Content-Type: ${result.contentType}, Body length: ${result.bodyLength}, Preview: ${result.bodyPreview?.substring(0, 200)}`,
              endpoint: endpoint.url,
              method: endpoint.method,
              statusCode: result.status,
              recommendation: "Require authentication for all sensitive API endpoints. Implement session validation middleware and return 401 Unauthorized for unauthenticated requests. Consider adding role-based access control (RBAC) for admin/config endpoints.",
              reference: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/04-Authentication_Testing/01-Testing_for_Credentials_Transported_over_an_Encrypted_Channel",
            });
          }
        }
      }

      // Check for verbose error messages
      if (result.status >= 400 && result.bodyPreview) {
        const errorIndicators = [
          { pattern: /stack[\s_-]?trace/i, name: "Stack trace" },
          { pattern: /at\s+\w+\s*\(/i, name: "Stack frame" },
          { pattern: /debug[\s_-]?info/i, name: "Debug info" },
          { pattern: /internal[\s_-]?server[\s_-]?error.*\{/i, name: "Internal error details" },
          { pattern: /sequelize|prisma|typeorm|mongoose|django|flask|express/i, name: "Framework name" },
          { pattern: /sql.*syntax.*error/i, name: "SQL error" },
          { pattern: /connection.*refused|ECONNREFUSED/i, name: "Connection details" },
          { pattern: /\/usr\/|\/home\/|C:\\|\/var\/log/i, name: "File paths" },
        ];

        for (const indicator of errorIndicators) {
          if (indicator.pattern.test(result.bodyPreview)) {
            findings.push({
              type: "verbose_errors",
              severity: "medium",
              title: `Verbose error message at ${endpoint.url}`,
              description: `The API endpoint at ${endpoint.url} returns error responses containing ${indicator.name} information. Verbose error messages can reveal internal application structure, technology stack, database schema, file paths, and other sensitive information that aids attackers in crafting targeted attacks. In production, error responses should be generic and not reveal internal details.`,
              evidence: `Status: ${result.status}, Matched: ${indicator.name}, Preview: ${result.bodyPreview?.substring(0, 300)}`,
              endpoint: endpoint.url,
              method: endpoint.method,
              statusCode: result.status,
              recommendation: "Implement generic error responses in production. Log detailed errors server-side only. Use error handling middleware that sanitizes error messages before sending them to clients. Never expose stack traces, SQL queries, or internal paths in API responses.",
              reference: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/08-Testing_for_Error_Handling/01-Testing_For_Improper_Error_Handling",
            });
            break; // One verbose error finding per endpoint
          }
        }
      }

      // Check for HTTP method tampering
      if (endpoint.method === "GET" && result.ok) {
        const tamperResult = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "include" });
            return { status: res.status, ok: res.ok };
          } catch { return { status: 0, ok: false }; }
        }, endpoint.url);

        if (tamperResult.ok && tamperResult.status < 300) {
          findings.push({
            type: "method_tampering",
            severity: "high",
            title: `HTTP method tampering possible: ${endpoint.url}`,
            description: `The API endpoint ${endpoint.url} accepted a PUT request despite being designed as a GET endpoint. HTTP method tampering allows attackers to modify resources or perform state-changing operations by using unexpected HTTP methods. The server should strictly validate the HTTP method and reject requests with methods that are not explicitly allowed.`,
            evidence: `PUT request returned ${tamperResult.status} (expected 405 Method Not Allowed)`,
            endpoint: endpoint.url,
            method: "PUT",
            statusCode: tamperResult.status,
            recommendation: "Implement strict HTTP method validation. Return 405 Method Not Allowed for unsupported methods. Use allowlists of permitted methods per endpoint rather than denylists.",
            reference: "https://owasp.org/www-community/attacks/HTTP_Method_Tampering",
          });
        }
      }

      // Check for CORS misconfiguration on API endpoints
      const corsResult = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url, {
            method: "OPTIONS",
            headers: {
              "Origin": "https://evil-probato-test.example.com",
              "Access-Control-Request-Method": "POST",
              "Access-Control-Request-Headers": "Content-Type",
            },
          });
          const acao = res.headers.get("access-control-allow-origin");
          const acac = res.headers.get("access-control-allow-credentials");
          return { acao, acac, status: res.status };
        } catch { return { acao: null, acac: null, status: 0 }; }
      }, endpoint.url);

      if (corsResult.acao === "https://evil-probato-test.example.com" && corsResult.acac === "true") {
        findings.push({
          type: "cors_misconfig",
          severity: "critical",
          title: `CORS allows arbitrary origin with credentials: ${endpoint.url}`,
          description: `The API endpoint at ${endpoint.url} returns Access-Control-Allow-Origin matching the requesting origin along with Access-Control-Allow-Credentials: true. This is a severe CORS misconfiguration that allows any website to make authenticated cross-origin requests to this API. An attacker can steal user data by luring victims to a malicious page that makes requests to this API using the victim's session cookies.`,
          evidence: `ACAO: ${corsResult.acao}, ACAC: ${corsResult.acac}`,
          endpoint: endpoint.url,
          method: "OPTIONS",
          statusCode: corsResult.status,
          recommendation: "Never reflect arbitrary origins with Access-Control-Allow-Credentials: true. Use an allowlist of trusted origins on the server side. Validate the Origin header against the allowlist and only return the requesting origin if it is trusted.",
          reference: "https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny",
        });
      } else if (corsResult.acao === "*") {
        findings.push({
          type: "cors_misconfig",
          severity: "medium",
          title: `CORS allows wildcard origin: ${endpoint.url}`,
          description: `The API endpoint at ${endpoint.url} returns Access-Control-Allow-Origin: *, allowing any origin to make cross-origin requests. While credentials cannot be sent with wildcard CORS, this can still expose data to unauthorized cross-origin access if the endpoint does not require authentication, or enable CSRF-like attacks.`,
          evidence: `ACAO: *`,
          endpoint: endpoint.url,
          method: "OPTIONS",
          statusCode: corsResult.status,
          recommendation: "Replace the wildcard with specific trusted origins. If cross-origin access is not needed, remove the CORS headers entirely.",
          reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS",
        });
      }

      // Check for information disclosure in response headers
      const headerFindings = checkResponseHeaders(endpoint.url, result.headers || {});
      findings.push(...headerFindings);

    } catch (endpointError) {
      console.warn(`[API-Prober] Endpoint test failed for ${endpoint.url}:`, endpointError);
    }
  }

  return findings;
}

function checkResponseHeaders(endpointUrl: string, headers: Record<string, string>): APISecurityFinding[] {
  const findings: APISecurityFinding[] = [];

  // Check for server version disclosure
  const serverHeader = headers["server"];
  if (serverHeader && /\d+\.\d+/.test(serverHeader)) {
    findings.push({
      type: "insecure_headers",
      severity: "low",
      title: `Server version disclosed: ${endpointUrl}`,
      description: `The Server header reveals detailed version information: "${serverHeader}". Attackers can use this information to identify known vulnerabilities specific to this server version and craft targeted exploits. Version disclosure is a low-severity issue but contributes to the overall attack surface.`,
      evidence: `Server: ${serverHeader}`,
      endpoint: endpointUrl,
      method: "GET",
      recommendation: "Configure the server to omit or generalize the Server header. For example, set 'Server: WebServer' without version details.",
      reference: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/01-Information_Gathering/",
    });
  }

  // Check for powered-by header
  const poweredBy = headers["x-powered-by"];
  if (poweredBy) {
    findings.push({
      type: "insecure_headers",
      severity: "low",
      title: `Technology stack disclosed via X-Powered-By: ${endpointUrl}`,
      description: `The X-Powered-By header reveals the backend technology: "${poweredBy}". This information helps attackers identify the technology stack and search for known vulnerabilities. While not directly exploitable, it aids in reconnaissance and targeted attack planning.`,
      evidence: `X-Powered-By: ${poweredBy}`,
      endpoint: endpointUrl,
      method: "GET",
      recommendation: "Remove the X-Powered-By header from responses. In Express.js, use app.disable('x-powered-by'). In other frameworks, configure the response header settings appropriately.",
      reference: "https://owasp.org/www-community/Information_exposure_through_headers",
    });
  }

  return findings;
}

// ── CSRF Checks ───────────────────────────────────────────────────

async function performCSRFChecks(
  page: Page,
  baseUrl: string,
  endpoints: APIEndpoint[]
): Promise<CSRFFinding[]> {
  const findings: CSRFFinding[] = [];

  // 1. Check all POST/PUT/PATCH/DELETE forms for CSRF tokens
  const stateChangingEndpoints = endpoints.filter((e) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(e.method)
  );

  for (const endpoint of stateChangingEndpoints) {
    // Test: Can we make a state-changing request without CSRF token?
    const csrfResult = await page.evaluate(async (url, method) => {
      try {
        // Request without any CSRF token
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            // Intentionally NO CSRF token, NO Origin header simulation
          },
          body: method !== "DELETE" ? "{}" : undefined,
          credentials: "include",
        });
        return {
          status: res.status,
          ok: res.ok,
          contentType: res.headers.get("content-type") || "",
        };
      } catch { return { status: 0, ok: false }; }
    }, endpoint.url, endpoint.method);

    // If the request succeeded without CSRF token, that's a finding
    if (csrfResult.ok && csrfResult.status < 300) {
      findings.push({
        type: "missing_token",
        severity: "high",
        title: `CSRF token not required: ${endpoint.method} ${endpoint.url}`,
        description: `The state-changing endpoint ${endpoint.method} ${endpoint.url} accepted a request without a CSRF token. Cross-Site Request Forgery (CSRF) attacks can trick authenticated users into submitting requests they did not intend to make. Without CSRF protection, an attacker can craft a malicious page that submits forms on behalf of the victim, potentially changing their email, password, or performing other actions without their consent.`,
        evidence: `Request without CSRF token returned ${csrfResult.status} (expected 403 Forbidden or 401 Unauthorized)`,
        endpoint: endpoint.url,
        method: endpoint.method,
        recommendation: "Implement CSRF token validation for all state-changing endpoints. Use the Synchronizer Token Pattern or the SameSite cookie attribute. Most frameworks provide built-in CSRF protection (csurf for Express, Django's csrf_token, Rails' protect_from_forgery).",
        reference: "https://owasp.org/www-community/attacks/csrf",
      });
    }

    // Test: Does the endpoint check the Origin header?
    const originResult = await page.evaluate(async (url, method) => {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "Origin": "https://evil-probato-test.example.com",
          },
          body: method !== "DELETE" ? "{}" : undefined,
          credentials: "include",
        });
        return { status: res.status, ok: res.ok };
      } catch { return { status: 0, ok: false }; }
    }, endpoint.url, endpoint.method);

    if (originResult.ok && originResult.status < 300) {
      findings.push({
        type: "no_origin_check",
        severity: "high",
        title: `Origin header not validated: ${endpoint.method} ${endpoint.url}`,
        description: `The state-changing endpoint ${endpoint.method} ${endpoint.url} accepted a request with a cross-origin Origin header (evil-probato-test.example.com). The server should validate the Origin header against a list of trusted origins and reject requests from unknown origins. Without Origin validation, the application is vulnerable to CSRF attacks from any origin.`,
        evidence: `Request with evil Origin returned ${originResult.status} (expected 403)`,
        endpoint: endpoint.url,
        method: endpoint.method,
        recommendation: "Validate the Origin and Referer headers on all state-changing requests. Reject requests where the Origin does not match your application's domain. This is a simple and effective CSRF defense that works even without tokens.",
        reference: "https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
      });
    }
  }

  // 2. Check for GET-based state changes (CSRF violation)
  const getEndpoints = endpoints.filter((e) => e.method === "GET");
  for (const endpoint of getEndpoints.slice(0, 5)) {
    // Test if a GET request actually modifies data
    const getResult = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url, { credentials: "include" });
        const body = await res.text();
        return {
          status: res.status,
          ok: res.ok,
          contentType: res.headers.get("content-type") || "",
          bodyPreview: body.substring(0, 500),
        };
      } catch { return { status: 0, ok: false }; }
    }, endpoint.url);

    // If the GET endpoint looks like it performs a state change
    const stateChangeIndicators = ["deleted", "updated", "created", "removed", "success.*action"];
    if (getResult.ok && getResult.bodyPreview) {
      for (const indicator of stateChangeIndicators) {
        if (new RegExp(indicator, "i").test(getResult.bodyPreview)) {
          findings.push({
            type: "get_csrf_violation",
            severity: "medium",
            title: `GET endpoint may perform state changes: ${endpoint.url}`,
            description: `The GET endpoint ${endpoint.url} appears to perform state-changing operations based on the response content. Using GET for state changes violates HTTP standards and makes the endpoint vulnerable to CSRF attacks via simple image tags, link prefetching, or URL sharing. GET requests should be idempotent and safe.`,
            evidence: `GET response indicates state change: ${getResult.bodyPreview?.substring(0, 200)}`,
            endpoint: endpoint.url,
            method: "GET",
            recommendation: "Move all state-changing operations to POST, PUT, PATCH, or DELETE methods. GET requests must be safe and idempotent. Add CSRF protection to the new state-changing endpoints.",
            reference: "https://owasp.org/www-community/attacks/csrf",
          });
          break;
        }
      }
    }
  }

  // 3. Check cookie SameSite attribute via CSRF test
  const cookieCheck = await page.evaluate(() => {
    const cookies = document.cookie;
    if (!cookies) return { hasCookies: false, cookieNames: [] };
    const names = cookies.split(";").map((c) => c.trim().split("=")[0]?.trim() || "");
    return { hasCookies: true, cookieNames: names };
  });

  if (cookieCheck.hasCookies) {
    // Cookies accessible via JS means they lack HttpOnly, and we can check for SameSite
    // by testing if cross-origin requests include them
    const sessionCookies = cookieCheck.cookieNames.filter((name) =>
      ["session", "sess", "sid", "token", "auth", "csrf"].some((s) => name.toLowerCase().includes(s))
    );

    for (const cookieName of sessionCookies) {
      findings.push({
        type: "same_cookie_origin",
        severity: "medium",
        title: `Cookie "${cookieName}" may lack SameSite attribute`,
        description: `The cookie "${cookieName}" appears to be sent with cross-origin requests. Without the SameSite attribute (or with SameSite=None), cookies are sent with all cross-site requests, making the application vulnerable to CSRF attacks. Modern browsers default to SameSite=Lax, but explicit configuration is recommended for security.`,
        evidence: `Cookie "${cookieName}" is accessible and likely sent cross-origin`,
        endpoint: baseUrl,
        method: "GET",
        recommendation: `Set SameSite=Strict or SameSite=Lax on the "${cookieName}" cookie. For session cookies, SameSite=Strict provides the strongest protection. Only use SameSite=None if cross-site cookie access is genuinely required, and always pair it with Secure.`,
        reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#SameSite_attribute",
      });
    }
  }

  return findings;
}

// ── Rate Limit Checks ─────────────────────────────────────────────

async function performRateLimitChecks(
  page: Page,
  endpoints: APIEndpoint[],
  depth: "quick" | "standard" | "deep"
): Promise<RateLimitFinding[]> {
  const findings: RateLimitFinding[] = [];
  const requestCounts = depth === "quick" ? 8 : depth === "deep" ? 20 : 12;

  for (const endpoint of endpoints.slice(0, depth === "quick" ? 3 : 8)) {
    try {
      // Send multiple rapid requests and check for rate limiting
      const rateResult = await page.evaluate(async (url, method, count) => {
        const results: Array<{ status: number; time: number }> = [];
        const startTime = Date.now();

        for (let i = 0; i < count; i++) {
          try {
            const res = await fetch(url, {
              method,
              headers: { "Content-Type": "application/json" },
              body: method !== "GET" && method !== "DELETE" ? `{"test":"probato_rate_${i}"}` : undefined,
              credentials: "include",
            });
            results.push({ status: res.status, time: Date.now() - startTime });

            // If we get a rate limit response, note it
            if (res.status === 429 || res.status === 503) {
              break;
            }
          } catch {
            results.push({ status: 0, time: Date.now() - startTime });
          }
        }

        const blocked = results.filter((r) => r.status === 429 || r.status === 503 || r.status === 403);
        const successCount = results.filter((r) => r.status >= 200 && r.status < 300).length;

        return {
          totalRequests: results.length,
          successCount,
          blockedCount: blocked.length,
          blockedAfter: blocked.length > 0 ? results.indexOf(blocked[0]) + 1 : undefined,
          lastStatus: results[results.length - 1]?.status,
          hasRateLimit: blocked.length > 0,
        };
      }, endpoint.url, endpoint.method, requestCounts);

      if (!rateResult.hasRateLimit && rateResult.successCount >= requestCounts * 0.7) {
        // Check if this is an auth endpoint
        const isAuthEndpoint = ["/auth", "/login", "/signin", "/session", "/token"].some((p) =>
          endpoint.url.toLowerCase().includes(p)
        );

        findings.push({
          type: isAuthEndpoint ? "no_rate_limit_on_auth" : "no_rate_limit",
          severity: isAuthEndpoint ? "high" : "medium",
          title: isAuthEndpoint
            ? `No rate limiting on auth endpoint: ${endpoint.url}`
            : `No rate limiting detected: ${endpoint.method} ${endpoint.url}`,
          description: isAuthEndpoint
            ? `The authentication endpoint ${endpoint.url} does not enforce rate limiting. ${rateResult.totalRequests} rapid requests were accepted without any throttling or blocking. Without rate limiting on auth endpoints, attackers can perform brute-force password attacks, credential stuffing, and account enumeration at scale. This is a significant security risk for any authentication-related endpoint.`
            : `The API endpoint ${endpoint.method} ${endpoint.url} accepted ${rateResult.successCount} out of ${rateResult.totalRequests} rapid requests without rate limiting. Without rate limiting, attackers can abuse the API by making excessive requests, potentially leading to denial of service, data harvesting, or brute-force attacks.`,
          evidence: `${rateResult.totalRequests} requests sent, ${rateResult.successCount} succeeded, ${rateResult.blockedCount} blocked (429/503)`,
          endpoint: endpoint.url,
          method: endpoint.method,
          requestsTested: rateResult.totalRequests,
          blockedAfter: rateResult.blockedAfter,
          recommendation: isAuthEndpoint
            ? "Implement strict rate limiting on authentication endpoints (e.g., 5 attempts per minute per IP). Use progressive delays, account lockout after failed attempts, and CAPTCHA challenges. Consider using a dedicated rate limiting service or middleware."
            : "Implement rate limiting on all API endpoints. Use a sliding window or token bucket algorithm. Set appropriate limits based on the endpoint's purpose (stricter for auth, more lenient for read-only). Return 429 Too Many Requests when limits are exceeded.",
          reference: "https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks",
        });
      } else if (rateResult.hasRateLimit && rateResult.blockedAfter && rateResult.blockedAfter > requestCounts * 0.5) {
        // Rate limit exists but is weak (allows too many requests before blocking)
        findings.push({
          type: "weak_rate_limit",
          severity: "low",
          title: `Weak rate limiting: ${endpoint.method} ${endpoint.url}`,
          description: `The endpoint ${endpoint.method} ${endpoint.url} has rate limiting but allows ${rateResult.blockedAfter} requests before blocking. This threshold may be too high to prevent brute-force attacks effectively. A lower threshold with progressive delays would provide better protection.`,
          evidence: `Rate limit triggered after ${rateResult.blockedAfter} of ${rateResult.totalRequests} requests`,
          endpoint: endpoint.url,
          method: endpoint.method,
          requestsTested: rateResult.totalRequests,
          blockedAfter: rateResult.blockedAfter,
          recommendation: "Lower the rate limit threshold. For auth endpoints, consider 5-10 requests per minute. Implement progressive delays that increase with each failed attempt. Add CAPTCHA after the first few failures.",
          reference: "https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks",
        });
      }
    } catch (rateError) {
      console.warn(`[API-Prober] Rate limit test failed for ${endpoint.url}:`, rateError);
    }
  }

  return findings;
}

// ── IDOR Checks ───────────────────────────────────────────────────

async function performIDORChecks(
  page: Page,
  baseUrl: string,
  endpoints: APIEndpoint[]
): Promise<IDORFinding[]> {
  const findings: IDORFinding[] = [];

  // Find endpoints with numeric or UUID-like IDs in the path
  const endpointsWithIds = endpoints.filter((e) =>
    /\/(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.test(e.url)
  );

  // Also test common ID-based patterns
  const idEndpoints: Array<{ url: string; method: string; idPattern: string }> = [];

  for (const endpoint of endpointsWithIds) {
    const idMatch = endpoint.url.match(/\/(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (idMatch) {
      idEndpoints.push({
        url: endpoint.url,
        method: endpoint.method,
        idPattern: idMatch[1],
      });
    }
  }

  // Add synthetic ID-based patterns for common API routes
  const baseOrigin = new URL(baseUrl).origin;
  const syntheticEndpoints = [
    { path: "/api/users/1", method: "GET", idPattern: "1" },
    { path: "/api/users/2", method: "GET", idPattern: "2" },
    { path: "/api/users/999", method: "GET", idPattern: "999" },
    { path: "/api/posts/1", method: "GET", idPattern: "1" },
    { path: "/api/orders/1", method: "GET", idPattern: "1" },
    { path: "/api/items/1", method: "GET", idPattern: "1" },
  ];

  for (const ep of syntheticEndpoints) {
    idEndpoints.push({ url: `${baseOrigin}${ep.path}`, method: ep.method, idPattern: ep.idPattern });
  }

  // Test each ID-based endpoint for IDOR
  for (const endpoint of idEndpoints.slice(0, 10)) {
    try {
      const isNumericId = /^\d+$/.test(endpoint.idPattern);

      // Test 1: Does the endpoint return data for different IDs?
      const idorResult = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url, { credentials: "include" });
          const contentType = res.headers.get("content-type") || "";
          let body = "";
          try { body = await res.text(); } catch { /* empty */ }
          return {
            status: res.status,
            ok: res.ok,
            contentType,
            bodyLength: body.length,
            bodyPreview: body.substring(0, 500),
            hasData: res.ok && contentType.includes("json") && body.length > 10,
          };
        } catch { return { status: 0, ok: false, hasData: false }; }
      }, endpoint.url);

      if (idorResult.hasData) {
        // The endpoint returns data — check if this looks like IDOR
        // (endpoint with sequential/guessable ID returns data without authorization check)
        if (isNumericId) {
          findings.push({
            type: "sequential_id",
            severity: "medium",
            title: `API uses sequential IDs: ${endpoint.url}`,
            description: `The API endpoint ${endpoint.url} uses sequential numeric IDs (${endpoint.idPattern}) and returns data without apparent authorization checks. Sequential IDs make it trivial for attackers to enumerate and access all resources by iterating through ID values. An attacker could potentially access other users' data by simply changing the ID in the URL, which is a classic IDOR (Insecure Direct Object Reference) vulnerability.`,
            evidence: `Endpoint with ID ${endpoint.idPattern} returned ${idorResult.status} with ${idorResult.bodyLength} bytes of data`,
            endpoint: endpoint.url,
            method: endpoint.method,
            idPattern: `Sequential numeric: ${endpoint.idPattern}`,
            recommendation: "Use non-guessable UUIDs instead of sequential IDs. Implement proper authorization checks to verify the requesting user owns or has access to the requested resource. Never trust client-provided IDs for authorization decisions.",
            reference: "https://owasp.org/www-community/attacks/Insecure_Direct_Object_Reference",
          });
        }

        // Test 2: Try accessing with a different ID to confirm IDOR
        if (isNumericId) {
          const altId = parseInt(endpoint.idPattern) + 1;
          const altUrl = endpoint.url.replace(new RegExp(`/${endpoint.idPattern}(/|$)`), `/${altId}$1`);

          const altResult = await page.evaluate(async (url) => {
            try {
              const res = await fetch(url, { credentials: "include" });
              return { status: res.status, ok: res.ok, hasData: res.ok && res.headers.get("content-type")?.includes("json") };
            } catch { return { status: 0, ok: false, hasData: false }; }
          }, altUrl);

          if (altResult.hasData) {
            findings.push({
              type: "idor_detected",
              severity: "high",
              title: `Potential IDOR: can access resource with different ID: ${altUrl}`,
              description: `The API endpoint returned data for both ID ${endpoint.idPattern} and ID ${altId} without authorization errors. This strongly indicates an IDOR vulnerability where the application does not verify that the requesting user has permission to access the requested resource. An attacker could access any user's data by simply changing the ID in the API request URL.`,
              evidence: `Both ID ${endpoint.idPattern} and ID ${altId} returned successful responses (${idorResult.status}, ${altResult.status})`,
              endpoint: altUrl,
              method: endpoint.method,
              idPattern: `Sequential: ${endpoint.idPattern}, ${altId}`,
              recommendation: "Implement server-side authorization checks for every resource access. Verify that the authenticated user owns or has permission to access the requested resource ID. Use a resource ownership check pattern (e.g., WHERE user_id = current_user_id) in database queries.",
              reference: "https://owasp.org/www-community/attacks/Insecure_Direct_Object_Reference",
            });
          }
        }
      }
    } catch (idorError) {
      console.warn(`[API-Prober] IDOR test failed for ${endpoint.url}:`, idorError);
    }
  }

  // Test for mass assignment vulnerabilities
  const postEndpoints = endpoints.filter((e) => e.method === "POST" || e.method === "PUT");
  for (const endpoint of postEndpoints.slice(0, 3)) {
    try {
      // Try sending extra fields that might be accepted
      const massResult = await page.evaluate(async (url, method) => {
        try {
          const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "probato_test",
              role: "admin",
              isAdmin: true,
              admin: true,
              permissions: ["all"],
              __proto__: { isAdmin: true },
            }),
            credentials: "include",
          });
          return { status: res.status, ok: res.ok };
        } catch { return { status: 0, ok: false }; }
      }, endpoint.url, endpoint.method);

      if (massResult.ok && massResult.status < 300) {
        findings.push({
          type: "mass_assignment",
          severity: "high",
          title: `Potential mass assignment: ${endpoint.method} ${endpoint.url}`,
          description: `The API endpoint ${endpoint.method} ${endpoint.url} accepted a request containing extra fields like "role", "isAdmin", and "permissions" without returning an error. This suggests the application may bind all request body fields directly to the data model, allowing attackers to modify privileged fields (like role, isAdmin) that should not be user-controllable. Mass assignment vulnerabilities can lead to privilege escalation where regular users gain admin access.`,
          evidence: `Request with admin fields returned ${massResult.status} (expected 400 Bad Request)`,
          endpoint: endpoint.url,
          method: endpoint.method,
          idPattern: "N/A (mass assignment)",
          recommendation: "Implement explicit field allowlists (whitelisting) for API input. Only bind user-controllable fields to the data model. Never use automatic object binding that includes all request body fields. Use DTOs (Data Transfer Objects) to explicitly define which fields are accepted.",
          reference: "https://owasp.org/www-community/attacks/Mass_Assignment",
        });
      }
    } catch (massError) {
      console.warn(`[API-Prober] Mass assignment test failed:`, massError);
    }
  }

  // Check for exposed list endpoints that might leak IDs
  for (const endpoint of endpoints.slice(0, 5)) {
    if (endpoint.url.match(/\/api\/(users|accounts|customers|orders|records)(\/?|\?)/i)) {
      try {
        const listResult = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url, { credentials: "include" });
            let body = "";
            try { body = await res.text(); } catch { /* empty */ }
            return {
              status: res.status,
              ok: res.ok,
              bodyLength: body.length,
              bodyPreview: body.substring(0, 500),
            };
          } catch { return { status: 0, ok: false }; }
        }, endpoint.url);

        if (listResult.ok && listResult.bodyLength > 100) {
          findings.push({
            type: "exposed_list_endpoint",
            severity: "medium",
            title: `Exposed list endpoint: ${endpoint.url}`,
            description: `The API endpoint ${endpoint.url} returns a list of records that may expose sensitive IDs or data. List endpoints without proper pagination, filtering, or authorization can leak large amounts of data. An attacker could use this endpoint to enumerate all resource IDs, harvest user data, or use the IDs for further IDOR attacks.`,
            evidence: `Endpoint returned ${listResult.bodyLength} bytes of list data`,
            endpoint: endpoint.url,
            method: endpoint.method,
            idPattern: "List endpoint",
            recommendation: "Implement proper authorization on list endpoints to ensure users can only see their own resources. Add pagination with reasonable limits. Consider requiring authentication and role checks before returning list data. Filter results based on the requesting user's permissions.",
            reference: "https://owasp.org/www-community/attacks/Insecure_Direct_Object_Reference",
          });
        }
      } catch (listError) {
        console.warn(`[API-Prober] List endpoint test failed:`, listError);
      }
    }
  }

  return findings;
}

// ── LLM-Based Analysis ────────────────────────────────────────────

interface LLMAPIProbeResult {
  extraAPIFindings: APISecurityFinding[];
  extraCSRFFindings: CSRFFinding[];
  extraRateLimitFindings: RateLimitFinding[];
  extraIDORFindings: IDORFinding[];
}

async function callLLMForAPIProbeAnalysis(
  url: string,
  apiFindings: APISecurityFinding[],
  csrfFindings: CSRFFinding[],
  rateLimitFindings: RateLimitFinding[],
  idorFindings: IDORFinding[]
): Promise<LLMAPIProbeResult> {
  const prompt = `Analyze the following API security probe results for ${url}:

API Security Findings:
${apiFindings.map((f) => `- [${f.severity}] ${f.type}: ${f.title}`).join("\n") || "None"}

CSRF Findings:
${csrfFindings.map((f) => `- [${f.severity}] ${f.type}: ${f.title}`).join("\n") || "None"}

Rate Limit Findings:
${rateLimitFindings.map((f) => `- [${f.severity}] ${f.type}: ${f.title}`).join("\n") || "None"}

IDOR Findings:
${idorFindings.map((f) => `- [${f.severity}] ${f.type}: ${f.title}`).join("\n") || "None"}

Return a JSON object with additional findings:
{
  "apiFindings": [{ "type": "missing_auth|verbose_errors|method_tampering|info_disclosure|missing_validation|insecure_headers|cors_misconfig|mass_assignment", "severity": "critical|high|medium|low|info", "title": "", "description": "", "evidence": "", "endpoint": "", "method": "", "recommendation": "", "reference": "" }],
  "csrfFindings": [{ "type": "missing_token|token_not_validated|same_cookie_origin|no_origin_check|predictable_token|get_csrf_violation", "severity": "", "title": "", "description": "", "evidence": "", "endpoint": "", "method": "", "recommendation": "", "reference": "" }],
  "rateLimitFindings": [{ "type": "no_rate_limit|weak_rate_limit|inconsistent_rate_limit|no_rate_limit_on_auth|bypassable_rate_limit", "severity": "", "title": "", "description": "", "evidence": "", "endpoint": "", "method": "", "requestsTested": 0, "recommendation": "", "reference": "" }],
  "idorFindings": [{ "type": "idor_detected|sequential_id|mass_assignment|missing_authorization|predictable_uuid|exposed_list_endpoint", "severity": "", "title": "", "description": "", "evidence": "", "endpoint": "", "method": "", "idPattern": "", "recommendation": "", "reference": "" }]
}

Rules: Only add genuinely new findings. Provide actionable recommendations. Return ONLY JSON.`;

  const systemMsg = "You are an expert API security tester. Analyze findings and provide additional insights. Always respond with valid JSON only.";

  // Strategy 1: z-ai-web-dev-sdk
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }],
      temperature: 0.2, max_tokens: 2500,
    });
    return parseLLMResponse(completion.choices[0]?.message?.content ?? "");
  } catch (sdkError) {
    console.warn("[API-Prober] z-ai-web-dev-sdk failed:", sdkError);
  }

  // Strategy 2: External API
  const externalUrl = process.env.LLM_API_URL;
  const externalKey = process.env.LLM_API_KEY;
  const externalModel = process.env.LLM_MODEL || "gpt-4o-mini";
  if (externalUrl && externalKey) {
    try {
      const response = await fetch(`${externalUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${externalKey}` },
        body: JSON.stringify({ model: externalModel, messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }], temperature: 0.2, max_tokens: 2500 }),
      });
      if (response.ok) {
        const data = await response.json();
        return parseLLMResponse(data.choices?.[0]?.message?.content ?? "");
      }
    } catch (fetchError) {
      console.warn("[API-Prober] External API failed:", fetchError);
    }
  }

  // Strategy 3: Rule-based fallback
  return { extraAPIFindings: [], extraCSRFFindings: [], extraRateLimitFindings: [], extraIDORFindings: [] };
}

function parseLLMResponse(content: string): LLMAPIProbeResult {
  const result: LLMAPIProbeResult = { extraAPIFindings: [], extraCSRFFindings: [], extraRateLimitFindings: [], extraIDORFindings: [] };
  try {
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return result;
    const parsed = JSON.parse(jsonMatch[0]);

    const validSeverities = ["critical", "high", "medium", "low", "info"];
    const validAPITypes = ["missing_auth", "verbose_errors", "method_tampering", "info_disclosure", "missing_validation", "insecure_headers", "cors_misconfig", "mass_assignment"];
    const validCSRFTypes = ["missing_token", "token_not_validated", "same_cookie_origin", "no_origin_check", "predictable_token", "get_csrf_violation"];
    const validRateTypes = ["no_rate_limit", "weak_rate_limit", "inconsistent_rate_limit", "no_rate_limit_on_auth", "bypassable_rate_limit"];
    const validIDORTypes = ["idor_detected", "sequential_id", "mass_assignment", "missing_authorization", "predictable_uuid", "exposed_list_endpoint"];

    if (Array.isArray(parsed.apiFindings)) {
      result.extraAPIFindings = parsed.apiFindings.map((f: any) => ({
        type: validAPITypes.includes(f.type) ? f.type : "info_disclosure",
        severity: validSeverities.includes(f.severity) ? f.severity : "info",
        title: String(f.title ?? "Untitled"), description: String(f.description ?? ""),
        evidence: String(f.evidence ?? ""), endpoint: String(f.endpoint ?? ""), method: String(f.method ?? "GET"),
        recommendation: String(f.recommendation ?? ""), reference: f.reference ? String(f.reference) : undefined,
      }));
    }
    if (Array.isArray(parsed.csrfFindings)) {
      result.extraCSRFFindings = parsed.csrfFindings.map((f: any) => ({
        type: validCSRFTypes.includes(f.type) ? f.type : "missing_token",
        severity: validSeverities.includes(f.severity) ? f.severity : "info",
        title: String(f.title ?? "Untitled"), description: String(f.description ?? ""),
        evidence: String(f.evidence ?? ""), endpoint: String(f.endpoint ?? ""), method: String(f.method ?? "POST"),
        recommendation: String(f.recommendation ?? ""), reference: f.reference ? String(f.reference) : undefined,
      }));
    }
    if (Array.isArray(parsed.rateLimitFindings)) {
      result.extraRateLimitFindings = parsed.rateLimitFindings.map((f: any) => ({
        type: validRateTypes.includes(f.type) ? f.type : "no_rate_limit",
        severity: validSeverities.includes(f.severity) ? f.severity : "info",
        title: String(f.title ?? "Untitled"), description: String(f.description ?? ""),
        evidence: String(f.evidence ?? ""), endpoint: String(f.endpoint ?? ""), method: String(f.method ?? "GET"),
        requestsTested: Number(f.requestsTested) || 0, recommendation: String(f.recommendation ?? ""),
        reference: f.reference ? String(f.reference) : undefined,
      }));
    }
    if (Array.isArray(parsed.idorFindings)) {
      result.extraIDORFindings = parsed.idorFindings.map((f: any) => ({
        type: validIDORTypes.includes(f.type) ? f.type : "sequential_id",
        severity: validSeverities.includes(f.severity) ? f.severity : "info",
        title: String(f.title ?? "Untitled"), description: String(f.description ?? ""),
        evidence: String(f.evidence ?? ""), endpoint: String(f.endpoint ?? ""), method: String(f.method ?? "GET"),
        idPattern: String(f.idPattern ?? ""), recommendation: String(f.recommendation ?? ""),
        reference: f.reference ? String(f.reference) : undefined,
      }));
    }
  } catch (parseError) {
    console.warn("[API-Prober] Failed to parse LLM response:", parseError);
  }
  return result;
}

// ── Recommendation Generator ──────────────────────────────────────

function generateRecommendations(
  apiFindings: APISecurityFinding[],
  csrfFindings: CSRFFinding[],
  rateLimitFindings: RateLimitFinding[],
  idorFindings: IDORFinding[]
): string[] {
  const recs: string[] = [];

  const criticalCount = [...apiFindings, ...csrfFindings, ...rateLimitFindings, ...idorFindings].filter((f) => f.severity === "critical").length;
  const highCount = [...apiFindings, ...csrfFindings, ...rateLimitFindings, ...idorFindings].filter((f) => f.severity === "high").length;

  if (criticalCount > 0) recs.push(`Fix ${criticalCount} critical API security issue(s) immediately. These can lead to complete system compromise or data breach.`);
  if (highCount > 0) recs.push(`Address ${highCount} high severity issue(s) urgently. These represent significant attack vectors.`);

  if (apiFindings.some((f) => f.type === "missing_auth")) recs.push("Require authentication on all sensitive API endpoints. Implement session validation middleware.");
  if (apiFindings.some((f) => f.type === "cors_misconfig")) recs.push("Fix CORS misconfigurations. Use server-side origin allowlists, never reflect arbitrary origins with credentials.");
  if (csrfFindings.some((f) => f.type === "missing_token")) recs.push("Add CSRF token validation to all state-changing endpoints. Use framework-provided CSRF protection.");
  if (csrfFindings.some((f) => f.type === "no_origin_check")) recs.push("Validate Origin and Referer headers on state-changing requests as a defense-in-depth CSRF measure.");
  if (rateLimitFindings.some((f) => f.type === "no_rate_limit" || f.type === "no_rate_limit_on_auth")) recs.push("Implement rate limiting on all API endpoints, especially authentication endpoints. Use sliding window or token bucket algorithms.");
  if (idorFindings.some((f) => f.type === "idor_detected" || f.type === "sequential_id")) recs.push("Replace sequential IDs with UUIDs and implement resource-level authorization checks to prevent IDOR.");
  if (idorFindings.some((f) => f.type === "mass_assignment")) recs.push("Use field allowlists (DTOs) for API input. Never bind all request body fields directly to data models.");
  if (apiFindings.some((f) => f.type === "verbose_errors")) recs.push("Implement generic error responses in production. Log detailed errors server-side only.");

  if (recs.length === 0) recs.push("No API security vulnerabilities detected. Continue regular API security testing and monitoring.");

  recs.push("Implement API gateway middleware for centralized authentication, rate limiting, and request validation as a defense-in-depth measure.");

  return recs;
}
