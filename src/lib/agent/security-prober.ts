/**
 * Probato Active Security Prober Agent (M23)
 *
 * Actively probes web applications for security vulnerabilities:
 * - Reflected XSS: Injects safe test payloads into URL params, forms, and inputs,
 *   then checks if the payload is reflected unsanitized in the DOM
 * - DOM-based XSS: Detects dangerous DOM sinks (innerHTML, document.write, eval, etc.)
 *   and sources (location.hash, location.search, document.referrer)
 * - Stored XSS indicators: Detects user-generated content areas lacking sanitization
 * - Auth flow probing: Detects login forms, tests for missing CSRF protection,
 *   insecure session handling, open redirect vulnerabilities, and auth bypass indicators
 *
 * IMPORTANT: This agent uses SAFE, NON-EXPLOITATIVE test payloads only.
 * It injects benign marker strings (e.g., "probato_xss_test_12345") and checks
 * for their reflection — it NEVER executes JavaScript or attempts actual exploitation.
 *
 * Uses the same 3-tier LLM strategy as security-scanner.ts:
 * 1. z-ai-web-dev-sdk (primary)
 * 2. External OpenAI-compatible API (fallback)
 * 3. Rule-based fallback (no LLM needed)
 *
 * Follows the same patterns: credit check/deduct, notification dispatch,
 * DB persistence, browser launch/cleanup.
 */

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { checkCredits, deductCredits } from "@/lib/billing/credits";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { getBrowserInstance, cleanupBrowser } from "@/lib/browser/chromium";
import type { Page } from "puppeteer-core";

// ── Types ──────────────────────────────────────────────────────────

export interface XSSProbeFinding {
  type: "reflected" | "dom_based" | "stored_indicator" | "input_vector";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string;
  payload: string;           // The test payload that was used
  injectionPoint: string;    // Where the payload was injected (URL param, form field, etc.)
  reflected: boolean;        // Whether the payload was found in the response DOM
  sanitized: boolean;        // Whether the payload was sanitized before reflection
  recommendation: string;
  reference?: string;
}

export interface AuthProbeFinding {
  type: "missing_csrf" | "weak_session" | "open_redirect" | "auth_bypass_indicator" |
        "insecure_login" | "credential_exposure" | "session_fixation_indicator" |
        "broken_auth_flow" | "missing_rate_limit";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string;
  endpoint: string;          // The auth endpoint that was probed
  method: string;            // HTTP method (GET, POST)
  recommendation: string;
  reference?: string;
}

export interface SecurityProbeInput {
  projectId?: string;
  userId: string;
  url: string;
  testRunId?: string;
  probeXSS?: boolean;        // default true
  probeAuth?: boolean;       // default true
  maxPayloads?: number;      // default 10, max 20 — limit XSS payloads to test
  probeDepth?: "quick" | "standard" | "deep"; // default "standard"
}

export interface SecurityProbeResult {
  xssFindings: XSSProbeFinding[];
  authFindings: AuthProbeFinding[];
  payloadsTested: string[];
  authEndpoints: string[];
  overallScore: number;
  xssScore: number;
  authScore: number;
  recommendations: string[];
  duration: number;
  llmUsed: boolean;
  error?: string;
}

// ── Safe XSS Test Payloads ────────────────────────────────────────

/**
 * SAFE test payloads — these are benign marker strings that test for
 * reflection without executing any JavaScript. If they appear in the DOM
 * unsanitized, it indicates a potential XSS vulnerability.
 *
 * The payloads use HTML-like syntax to test if the application encodes
 * or strips dangerous characters.
 */
const XSS_TEST_PAYLOADS = [
  // Basic marker string — simplest reflection test
  "probato_xss_test_a1b2c3",
  // HTML tag injection — tests if angle brackets are encoded
  "<probato>xss_test</probato>",
  // Script tag injection (safe — won't execute, just tests reflection)
  "<script>probato_xss_marker</script>",
  // IMG tag with onerror (safe — just tests if event handlers survive)
  "<img src=x onerror=probato_xss_marker>",
  // SVG tag injection
  "<svg onload=probato_xss_marker>",
  // Attribute injection test
  '" probato_xss="test',
  // Single quote attribute injection
  "' probato_xss='test",
  // JavaScript URI scheme test
  "javascript:probato_xss_marker",
  // Event handler injection in attribute context
  "onmouseover=probato_xss_marker",
  // Template injection indicator
  "{{probato_xss_test}}",
  // Expression injection (CSS)
  "expression(probato_xss_marker)",
  // Data URI test
  "data:text/html,probato_xss_marker",
  // Encoded angle bracket test — tests double-encoding
  "&lt;probato&gt;xss&lt;/probato&gt;",
  // Null byte injection
  "probato\x00xss_test",
  // Unicode escape test
  "probato\\u003cscript\\u003e",
];

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

export async function runSecurityProbe(
  input: SecurityProbeInput
): Promise<SecurityProbeResult> {
  const startTime = Date.now();

  try {
    // 1. Check credits
    const creditCheck = await checkCredits(input.userId, "security_probe");
    if (!creditCheck.hasCredits) {
      return {
        xssFindings: [],
        authFindings: [],
        payloadsTested: [],
        authEndpoints: [],
        overallScore: 0,
        xssScore: 0,
        authScore: 0,
        recommendations: [],
        duration: Date.now() - startTime,
        llmUsed: false,
        error: "Insufficient credits to run security probe",
      };
    }

    // 2. Launch browser
    const managed = await getBrowserInstance();
    let xssFindings: XSSProbeFinding[] = [];
    let authFindings: AuthProbeFinding[] = [];
    let payloadsTested: string[] = [];
    let authEndpoints: string[] = [];
    let llmUsed = false;

    try {
      const page = await managed.browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // 3. Navigate to URL
      const response = await page.goto(input.url, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      if (!response) {
        throw new Error("Failed to load page — no response received");
      }

      // 4. Run XSS probing
      const shouldProbeXSS = input.probeXSS !== false;
      if (shouldProbeXSS) {
        const maxPayloads = Math.min(Math.max(input.maxPayloads ?? 10, 1), 20);
        const depth = input.probeDepth ?? "standard";

        const xssResult = await performXSSProbing(page, input.url, maxPayloads, depth);
        xssFindings = xssResult.findings;
        payloadsTested = xssResult.payloadsTested;
      }

      // 5. Run Auth probing
      const shouldProbeAuth = input.probeAuth !== false;
      if (shouldProbeAuth) {
        const authResult = await performAuthProbing(page, input.url);
        authFindings = authResult.findings;
        authEndpoints = authResult.endpoints;
      }

      await page.close();
    } finally {
      await cleanupBrowser(managed);
    }

    // 6. Try LLM analysis via 3-tier strategy
    try {
      const llmResult = await callLLMForProbeAnalysis(input.url, xssFindings, authFindings);
      if (llmResult.extraXSSFindings.length > 0) {
        xssFindings = [...xssFindings, ...llmResult.extraXSSFindings];
      }
      if (llmResult.extraAuthFindings.length > 0) {
        authFindings = [...authFindings, ...llmResult.extraAuthFindings];
      }
      if (llmResult.extraXSSFindings.length > 0 || llmResult.extraAuthFindings.length > 0) {
        llmUsed = true;
      }
    } catch (error) {
      console.warn("[Security-Prober] LLM failed, using rule-based findings only:", error);
    }

    // 7. Calculate scores
    const xssScore = calculateScore(xssFindings);
    const authScore = calculateScore(authFindings);

    // Overall = weighted average (XSS is typically higher risk)
    const overallScore = xssFindings.length > 0 || authFindings.length > 0
      ? Math.round(xssScore * 0.6 + authScore * 0.4)
      : 100;

    // Generate recommendations
    const recommendations = generateRecommendations(xssFindings, authFindings);

    // 8. Deduct credits
    try {
      await deductCredits(
        input.userId,
        "security_probe",
        `Security probe for ${input.url}`,
        undefined,
        undefined
      );
    } catch (creditError) {
      console.warn("[Security-Prober] Credit deduction failed:", creditError);
    }

    // 9. Persist to DB
    let probeId: string | undefined;
    try {
      const probe = await db.securityProbe.create({
        data: {
          status: "completed",
          url: input.url,
          overallScore,
          xssScore,
          authScore,
          xssFindings: xssFindings as any,
          authFindings: authFindings as any,
          payloadsTested: payloadsTested as any,
          authEndpoints: authEndpoints as any,
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
      console.warn("[Security-Prober] Failed to persist probe:", dbError);
    }

    // 10. Dispatch notification
    const allFindings = [...xssFindings, ...authFindings];
    if (allFindings.some((f) => f.severity === "critical" || f.severity === "high")) {
      try {
        const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
        const highCount = allFindings.filter((f) => f.severity === "high").length;

        await dispatchNotification({
          type: "security_issue",
          title: `Active security probe found issues: ${input.url}`,
          message: `${allFindings.length} probe finding(s) detected. ${criticalCount} critical, ${highCount} high severity. XSS: ${xssFindings.length}, Auth: ${authFindings.length}.`,
          userId: input.userId,
          projectId: input.projectId,
          testRunId: input.testRunId,
          actionUrl: input.projectId
            ? `/dashboard/projects/${input.projectId}`
            : undefined,
          priority: criticalCount > 0 ? "critical" : "high",
          metadata: {
            probeId,
            overallScore,
            xssScore,
            authScore,
            criticalCount,
            highCount,
            xssFindingCount: xssFindings.length,
            authFindingCount: authFindings.length,
          },
        });
      } catch (notifError) {
        console.warn("[Security-Prober] Notification dispatch failed:", notifError);
      }
    }

    // 11. Return result
    return {
      xssFindings,
      authFindings,
      payloadsTested,
      authEndpoints,
      overallScore,
      xssScore,
      authScore,
      recommendations,
      duration: Date.now() - startTime,
      llmUsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Security-Prober] Failed:", message);

    // Try to persist as failed
    try {
      await db.securityProbe.create({
        data: {
          status: "failed",
          url: input.url,
          overallScore: 0,
          xssScore: 0,
          authScore: 0,
          xssFindings: [],
          authFindings: [],
          payloadsTested: [],
          authEndpoints: [],
          recommendations: [],
          duration: Date.now() - startTime,
          error: message,
          projectId: input.projectId ?? null,
          userId: input.userId,
          testRunId: input.testRunId ?? null,
        },
      });
    } catch (dbError) {
      console.warn("[Security-Prober] Failed to persist error state:", dbError);
    }

    return {
      xssFindings: [],
      authFindings: [],
      payloadsTested: [],
      authEndpoints: [],
      overallScore: 0,
      xssScore: 0,
      authScore: 0,
      recommendations: [],
      duration: Date.now() - startTime,
      llmUsed: false,
      error: message,
    };
  }
}

// ── XSS Probing ──────────────────────────────────────────────────

/**
 * Perform active XSS probing by:
 * 1. Discovering injection points (forms, URL params, hash fragments)
 * 2. Injecting safe test payloads
 * 3. Checking if payloads are reflected unsanitized in the DOM
 * 4. Detecting dangerous DOM sinks and sources
 */
async function performXSSProbing(
  page: Page,
  baseUrl: string,
  maxPayloads: number,
  depth: "quick" | "standard" | "deep"
): Promise<{ findings: XSSProbeFinding[]; payloadsTested: string[] }> {
  const findings: XSSProbeFinding[] = [];
  const payloadsTested: string[] = [];

  // Select payloads based on depth
  const payloadCount = depth === "quick" ? Math.min(5, maxPayloads)
    : depth === "deep" ? Math.min(20, maxPayloads)
    : Math.min(10, maxPayloads);
  const payloads = XSS_TEST_PAYLOADS.slice(0, payloadCount);

  // 1. Discover injection points on the page
  const injectionPoints = await discoverInjectionPoints(page);

  // 2. Test reflected XSS via URL parameters
  const urlParams = await discoverURLParams(page);
  if (urlParams.length > 0) {
    for (const param of urlParams.slice(0, depth === "quick" ? 3 : depth === "deep" ? 10 : 5)) {
      // Test with the basic marker payload first
      const testPayload = payloads[0]; // "probato_xss_test_a1b2c3"
      payloadsTested.push(`url_param:${param}=${testPayload}`);

      try {
        const testUrl = new URL(baseUrl);
        testUrl.searchParams.set(param, testPayload);

        const result = await testReflectedPayload(page, testUrl.toString(), testPayload);
        if (result.reflected && !result.sanitized) {
          findings.push({
            type: "reflected",
            severity: "critical",
            title: `Reflected XSS via URL parameter: "${param}"`,
            description: `The test payload injected via the "${param}" URL parameter was reflected unsanitized in the page DOM. This indicates the application does not properly encode user input from URL parameters before rendering it, which is a classic reflected XSS vulnerability. An attacker could craft a malicious URL that executes arbitrary JavaScript in a victim's browser when they click the link.`,
            evidence: result.evidence,
            payload: testPayload,
            injectionPoint: `URL parameter: ${param}`,
            reflected: true,
            sanitized: false,
            recommendation: `Encode and sanitize the "${param}" parameter before rendering it in the page. Use context-appropriate output encoding (HTML entity encoding for HTML context, JavaScript encoding for script context, URL encoding for URL context). Consider implementing Content Security Policy (CSP) as a defense-in-depth measure.`,
            reference: "https://owasp.org/www-community/attacks/xss/#reflected-xss-attacks",
          });
        } else if (result.reflected && result.sanitized) {
          findings.push({
            type: "reflected",
            severity: "info",
            title: `URL parameter "${param}" reflects input (sanitized)`,
            description: `The test payload injected via the "${param}" URL parameter was reflected in the page but appears to be sanitized/encoded. While this is not currently exploitable, the fact that user input is reflected means that any future regression in sanitization could create an XSS vulnerability. Regular security testing is recommended.`,
            evidence: result.evidence,
            payload: testPayload,
            injectionPoint: `URL parameter: ${param}`,
            reflected: true,
            sanitized: true,
            recommendation: `Consider implementing a Content Security Policy (CSP) header as a defense-in-depth measure. Continue to monitor and test the "${param}" parameter regularly for sanitization regressions.`,
            reference: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html",
          });
        }
      } catch (testError) {
        console.warn(`[Security-Prober] URL param test failed for "${param}":`, testError);
      }
    }
  }

  // 3. Test reflected XSS via form inputs
  for (const form of injectionPoints.forms.slice(0, depth === "quick" ? 2 : depth === "deep" ? 8 : 4)) {
    const testPayload = payloads[0];

    for (const inputField of form.inputs.slice(0, 5)) {
      payloadsTested.push(`form_input:${inputField.name || inputField.id || "unnamed"}=${testPayload}`);

      try {
        const result = await testFormInputReflection(page, form, inputField, testPayload);
        if (result.reflected && !result.sanitized) {
          findings.push({
            type: "reflected",
            severity: "high",
            title: `Reflected XSS via form input: "${inputField.name || inputField.id || "unnamed"}"`,
            description: `The test payload injected into the "${inputField.name || inputField.id || "unnamed"}" form field was reflected unsanitized in the page DOM after form submission. This indicates that the application does not properly encode form input before rendering it, enabling reflected XSS attacks through form submissions. Unlike URL-based reflected XSS, this may require a POST request to trigger, but is still exploitable.`,
            evidence: result.evidence,
            payload: testPayload,
            injectionPoint: `Form input: ${form.action || "current page"} -> ${inputField.name || inputField.id || "unnamed"}`,
            reflected: true,
            sanitized: false,
            recommendation: `Validate and sanitize all form input on the server side. Apply context-appropriate output encoding when rendering user-submitted data. Implement CSRF protection to prevent unauthorized form submissions.`,
            reference: "https://owasp.org/www-community/attacks/xss/#reflected-xss-attacks",
          });
        }
      } catch (formError) {
        console.warn(`[Security-Prober] Form input test failed:`, formError);
      }
    }
  }

  // 4. Test DOM-based XSS (hash fragment injection)
  if (depth !== "quick") {
    const testPayload = payloads[0];
    payloadsTested.push(`hash_fragment:${testPayload}`);

    try {
      const hashTestUrl = `${baseUrl.split("#")[0]}#${testPayload}`;
      const hashResult = await testDOMBasedXSS(page, hashTestUrl, testPayload);
      findings.push(...hashResult);
    } catch (hashError) {
      console.warn("[Security-Prober] Hash fragment test failed:", hashError);
    }
  }

  // 5. Detect dangerous DOM sinks and sources
  const domFindings = await detectDOMSinksAndSources(page);
  findings.push(...domFindings);

  // 6. Detect stored XSS indicators (user-generated content areas)
  if (depth === "deep") {
    const storedFindings = await detectStoredXSSIndicators(page);
    findings.push(...storedFindings);
  }

  // 7. Test additional payloads on confirmed injection points
  // If we found a reflected parameter, test more payloads to confirm severity
  const reflectedParams = findings
    .filter((f) => f.type === "reflected" && f.reflected && !f.sanitized)
    .map((f) => f.injectionPoint);

  if (reflectedParams.length > 0 && depth !== "quick") {
    for (const param of reflectedParams.slice(0, 3)) {
      // Test with HTML injection payload
      const htmlPayload = payloads[1]; // "<probato>xss_test</probato>"
      if (htmlPayload && payloadsTested.length < maxPayloads * 3) {
        payloadsTested.push(`${param}=${htmlPayload}`);

        const paramName = param.replace("URL parameter: ", "");
        try {
          const testUrl = new URL(baseUrl);
          testUrl.searchParams.set(paramName, htmlPayload);
          const htmlResult = await testReflectedPayload(page, testUrl.toString(), htmlPayload);

          if (htmlResult.reflected && !htmlResult.sanitized) {
            findings.push({
              type: "reflected",
              severity: "critical",
              title: `HTML injection confirmed via: "${paramName}"`,
              description: `HTML tags injected via the "${paramName}" parameter were rendered in the page without encoding. This confirms that the application does not encode angle brackets, allowing full HTML injection. This is a severe XSS vulnerability that allows an attacker to inject arbitrary HTML including script tags, iframes, and other dangerous elements.`,
              evidence: htmlResult.evidence,
              payload: htmlPayload,
              injectionPoint: param,
              reflected: true,
              sanitized: false,
              recommendation: `Implement strict output encoding that converts < to &lt;, > to &gt;, " to &quot;, and ' to &#x27;. Use a security-focused template engine that auto-escapes by default.`,
              reference: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html",
            });
          }
        } catch (htmlTestError) {
          console.warn(`[Security-Prober] HTML injection test failed for "${paramName}":`, htmlTestError);
        }
      }
    }
  }

  return { findings, payloadsTested };
}

// ── Injection Point Discovery ─────────────────────────────────────

interface FormInfo {
  action: string;
  method: string;
  id: string;
  inputs: Array<{
    name: string;
    id: string;
    type: string;
    placeholder: string;
  }>;
}

async function discoverInjectionPoints(page: Page): Promise<{
  forms: FormInfo[];
}> {
  const forms = await page.evaluate(() => {
    const formInfos: FormInfo[] = [];
    const formElements = Array.from(document.querySelectorAll("form"));

    for (const form of formElements) {
      const inputs = Array.from(form.querySelectorAll("input, textarea, select"))
        .filter((el) => {
          const input = el as HTMLInputElement;
          // Skip hidden, submit, button, and reset inputs
          return !["hidden", "submit", "button", "reset", "image"].includes(input.type);
        })
        .map((el) => {
          const input = el as HTMLInputElement;
          return {
            name: input.name || "",
            id: input.id || "",
            type: input.type || "text",
            placeholder: input.placeholder || "",
          };
        });

      formInfos.push({
        action: form.action || "",
        method: (form.method || "GET").toUpperCase(),
        id: form.id || "",
        inputs,
      });
    }

    return formInfos;
  });

  return { forms };
}

async function discoverURLParams(page: Page): Promise<string[]> {
  // Discover URL parameters by checking:
  // 1. Current URL params
  // 2. Query params found in links on the page
  // 3. Common parameter names used in web apps

  const params = await page.evaluate(() => {
    const paramSet = new Set<string>();

    // Current URL params
    const currentParams = new URLSearchParams(window.location.search);
    for (const [key] of currentParams) {
      paramSet.add(key);
    }

    // Params from links on the page
    const links = Array.from(document.querySelectorAll("a[href]"));
    for (const link of links) {
      try {
        const href = (link as HTMLAnchorElement).href;
        if (href && href.includes("?")) {
          const url = new URL(href, window.location.origin);
          for (const [key] of url.searchParams) {
            paramSet.add(key);
          }
        }
      } catch {
        // Invalid URL, skip
      }
    }

    // Params from form actions
    const forms = Array.from(document.querySelectorAll("form"));
    for (const form of forms) {
      try {
        if (form.action && form.action.includes("?")) {
          const url = new URL(form.action, window.location.origin);
          for (const [key] of url.searchParams) {
            paramSet.add(key);
          }
        }
      } catch {
        // Invalid URL, skip
      }
    }

    return Array.from(paramSet);
  });

  // Add common parameter names for testing if not many were discovered
  const commonParams = [
    "q", "query", "search", "id", "page", "sort", "filter",
    "category", "tag", "name", "user", "redirect", "url", "return",
    "next", "callback", "ref", "source", "lang", "debug", "test",
  ];

  for (const param of commonParams) {
    if (!params.includes(param)) {
      params.push(param);
    }
  }

  return params;
}

// ── Reflected Payload Testing ─────────────────────────────────────

async function testReflectedPayload(
  page: Page,
  testUrl: string,
  payload: string
): Promise<{ reflected: boolean; sanitized: boolean; evidence: string }> {
  try {
    const response = await page.goto(testUrl, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });

    if (!response) {
      return { reflected: false, sanitized: false, evidence: "No response" };
    }

    // Wait a moment for dynamic content
    await new Promise((r) => setTimeout(r, 500));

    // Check if the payload or parts of it appear in the DOM
    const checkResult = await page.evaluate((marker) => {
      const results = {
        reflected: false,
        sanitized: false,
        evidence: "",
      };

      // Get the full page HTML
      const html = document.documentElement.outerHTML;

      // Check if the raw marker string is in the HTML
      if (html.includes(marker)) {
        results.reflected = true;
        results.sanitized = true; // Assume sanitized until we find unsanitized reflection

        // Check if HTML tags from the marker survived (unsanitized)
        const tagMatch = marker.match(/<[^>]+>/);
        if (tagMatch) {
          // If HTML tags appear in the DOM as actual elements (not text), it's unsanitized
          // Check if the tag exists as a DOM element
          const tagName = tagMatch[0].match(/<(\w+)/)?.[1];
          if (tagName) {
            const customElements = document.querySelectorAll(tagName);
            for (const el of customElements) {
              if (el.textContent?.includes(marker.replace(/<[^>]+>/g, "").replace(/<\/[^>]+>/g, ""))) {
                results.sanitized = false;
                break;
              }
            }
          }

          // Also check if the raw angle brackets appear unencoded
          if (html.includes(tagMatch[0])) {
            // The raw tag string appears — check it's not just in a script/style tag
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = "";
            const bodyText = document.body?.innerText || "";

            // If the marker text (without tags) appears in visible text and contains our marker
            const markerText = marker.replace(/<[^>]+>/g, "").replace(/<\/[^>]+>/g, "");
            if (bodyText.includes(markerText)) {
              // Text is visible — check if it's in an element that was created by our injection
              const allElements = document.querySelectorAll("*");
              for (const el of allElements) {
                if (el.innerHTML.includes(marker) && !el.closest("script") && !el.closest("style")) {
                  // Found our marker in a non-script/style element's innerHTML
                  // This means HTML injection worked
                  results.sanitized = false;
                  break;
                }
              }
            }
          }
        } else {
          // Simple text marker — check if it appears in visible text
          const bodyText = document.body?.innerText || "";
          if (bodyText.includes(marker)) {
            results.sanitized = false; // Text markers being visible means no output encoding
          }

          // But also check if it's HTML-encoded
          const encodedMarker = marker
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
          if (html.includes(encodedMarker)) {
            results.sanitized = true;
          }
        }

        // Collect evidence — find the context where the marker appears
        const markerIndex = html.indexOf(marker);
        if (markerIndex >= 0) {
          const start = Math.max(0, markerIndex - 100);
          const end = Math.min(html.length, markerIndex + marker.length + 100);
          results.evidence = html.substring(start, end);
        } else {
          // Check for encoded version
          const encodedVersions = [
            marker,
            marker.replace(/</g, "&lt;").replace(/>/g, "&gt;"),
            encodeURIComponent(marker),
          ];
          for (const version of encodedVersions) {
            const idx = html.indexOf(version);
            if (idx >= 0) {
              const start = Math.max(0, idx - 100);
              const end = Math.min(html.length, idx + version.length + 100);
              results.evidence = html.substring(start, end);
              break;
            }
          }
        }
      }

      return results;
    }, payload);

    return checkResult;
  } catch (navError) {
    console.warn("[Security-Prober] Navigation to test URL failed:", navError);
    return { reflected: false, sanitized: false, evidence: `Navigation failed: ${navError instanceof Error ? navError.message : String(navError)}` };
  }
}

// ── Form Input Reflection Testing ─────────────────────────────────

async function testFormInputReflection(
  page: Page,
  form: FormInfo,
  inputField: { name: string; id: string; type: string; placeholder: string },
  payload: string
): Promise<{ reflected: boolean; sanitized: boolean; evidence: string }> {
  try {
    // Navigate back to the original page first
    const currentUrl = page.url();

    // Find the form and fill in the input
    const selector = inputField.name
      ? `form input[name="${inputField.name}"], form textarea[name="${inputField.name}"], form select[name="${inputField.name}"]`
      : inputField.id
      ? `form #${inputField.id}`
      : null;

    if (!selector) return { reflected: false, sanitized: false, evidence: "No selector available" };

    const inputEl = await page.$(selector);
    if (!inputEl) return { reflected: false, sanitized: false, evidence: "Input element not found" };

    // Clear and type the payload
    await inputEl.click({ clickCount: 3 });
    await inputEl.type(payload, { delay: 20 });

    // Submit the form
    const submitBtn = await page.$(`form ${form.id ? `#${form.id}` : ""} button[type="submit"], form input[type="submit"]`);
    if (submitBtn) {
      await Promise.all([
        submitBtn.click(),
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {
          // Navigation might not happen (AJAX form)
        }),
      ]);
    } else {
      await page.evaluate((sel) => {
        const input = document.querySelector(sel) as HTMLInputElement;
        if (input?.form) input.form.submit();
      }, selector);
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {});
    }

    // Wait for any dynamic updates
    await new Promise((r) => setTimeout(r, 500));

    // Check for reflection
    const checkResult = await page.evaluate((marker) => {
      const html = document.documentElement.outerHTML;
      const bodyText = document.body?.innerText || "";
      const reflected = html.includes(marker) || bodyText.includes(marker);

      // Check for HTML-encoding
      const encoded = marker.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const sanitized = html.includes(encoded);

      let evidence = "";
      if (reflected) {
        const idx = html.indexOf(marker);
        if (idx >= 0) {
          const start = Math.max(0, idx - 80);
          const end = Math.min(html.length, idx + marker.length + 80);
          evidence = html.substring(start, end);
        } else {
          evidence = `Found in body text: "${bodyText.substring(bodyText.indexOf(marker) - 40, bodyText.indexOf(marker) + marker.length + 40)}"`;
        }
      }

      return { reflected, sanitized: sanitized || !reflected, evidence };
    }, payload);

    // Navigate back to original page
    try {
      await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 8000 });
    } catch {
      // Non-critical
    }

    return checkResult;
  } catch (formError) {
    console.warn("[Security-Prober] Form input reflection test failed:", formError);
    return { reflected: false, sanitized: false, evidence: `Test failed: ${formError instanceof Error ? formError.message : String(formError)}` };
  }
}

// ── DOM-Based XSS Detection ───────────────────────────────────────

async function testDOMBasedXSS(
  page: Page,
  testUrl: string,
  payload: string
): Promise<XSSProbeFinding[]> {
  const findings: XSSProbeFinding[] = [];

  try {
    await page.goto(testUrl, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });

    await new Promise((r) => setTimeout(r, 500));

    // Check if the hash fragment content appears in the DOM
    const hashResult = await page.evaluate((marker) => {
      const html = document.documentElement.outerHTML;
      const bodyText = document.body?.innerText || "";

      // Check if hash content appears in the page (not just in the URL bar)
      // Exclude the URL itself from the check
      const htmlWithoutUrl = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
      const reflected = bodyText.includes(marker) ||
        (htmlWithoutUrl.includes(marker) && !htmlWithoutUrl.includes(`href="${window.location.href}"`));

      return { reflected, html: html.substring(0, 5000) };
    }, payload);

    if (hashResult.reflected) {
      findings.push({
        type: "dom_based",
        severity: "high",
        title: "Potential DOM-based XSS via URL hash fragment",
        description: `Content from the URL hash fragment (location.hash) appears to be reflected in the page DOM without proper sanitization. This is a DOM-based XSS vulnerability where the application reads the hash fragment and uses it to modify the page content, typically via innerHTML or similar DOM manipulation. Since the hash fragment is not sent to the server, server-side validation cannot protect against this attack vector.`,
        evidence: `Hash fragment "${payload}" reflected in page DOM`,
        payload,
        injectionPoint: "URL hash fragment (location.hash)",
        reflected: true,
        sanitized: false,
        recommendation: "Avoid using location.hash, location.search, or document.referrer directly in DOM manipulation. Use textContent instead of innerHTML, or sanitize input using DOMPurify before insertion. Consider implementing a Content Security Policy that disallows inline scripts.",
        reference: "https://owasp.org/www-community/attacks/DOM_Based_XSS",
      });
    }
  } catch (navError) {
    console.warn("[Security-Prober] DOM-based XSS test failed:", navError);
  }

  return findings;
}

// ── DOM Sink/Source Detection ─────────────────────────────────────

async function detectDOMSinksAndSources(page: Page): Promise<XSSProbeFinding[]> {
  const findings: XSSProbeFinding[] = [];

  const domAnalysis = await page.evaluate(() => {
    const issues: Array<{
      type: string;
      severity: string;
      description: string;
      evidence: string;
    }> = [];

    // 1. Check for dangerous DOM sinks in inline scripts
    const scripts = Array.from(document.querySelectorAll("script:not([src])"));
    const dangerousSinks = [
      { pattern: /\.innerHTML\s*=/, name: "innerHTML", severity: "high" },
      { pattern: /\.outerHTML\s*=/, name: "outerHTML", severity: "high" },
      { pattern: /document\.write\s*\(/, name: "document.write()", severity: "critical" },
      { pattern: /document\.writeln\s*\(/, name: "document.writeln()", severity: "critical" },
      { pattern: /eval\s*\(/, name: "eval()", severity: "critical" },
      { pattern: /new Function\s*\(/, name: "new Function()", severity: "critical" },
      { pattern: /setTimeout\s*\(\s*["']/, name: "setTimeout(string)", severity: "high" },
      { pattern: /setInterval\s*\(\s*["']/, name: "setInterval(string)", severity: "high" },
      { pattern: /\.insertAdjacentHTML\s*\(/, name: "insertAdjacentHTML()", severity: "high" },
    ];

    const dangerousSources = [
      { pattern: /location\.hash/, name: "location.hash" },
      { pattern: /location\.search/, name: "location.search" },
      { pattern: /location\.href/, name: "location.href" },
      { pattern: /location\.pathname/, name: "location.pathname" },
      { pattern: /document\.referrer/, name: "document.referrer" },
      { pattern: /document\.URL/, name: "document.URL" },
      { pattern: /window\.name/, name: "window.name" },
      { pattern: /document\.cookie/, name: "document.cookie" },
    ];

    for (const script of scripts) {
      const content = script.textContent || "";

      // Check for sinks
      for (const sink of dangerousSinks) {
        if (sink.pattern.test(content)) {
          // Check if a source flows into this sink
          const hasSourceFlow = dangerousSources.some((src) => src.pattern.test(content));

          issues.push({
            type: "dom_sink",
            severity: hasSourceFlow ? "critical" : sink.severity === "critical" ? "high" : "medium",
            description: hasSourceFlow
              ? `Dangerous DOM sink "${sink.name}" with user-controlled source detected in inline script. This is a likely DOM-based XSS vulnerability where user input from ${dangerousSources.find((s) => s.pattern.test(content))?.name || "a source"} flows into ${sink.name} without sanitization.`
              : `Dangerous DOM sink "${sink.name}" found in inline script. While no direct user-controlled source was detected in the same script block, this sink could still be vulnerable if it receives unsanitized input from other code paths.`,
            evidence: content.substring(0, 300),
          });
        }
      }

      // Check for sources without sanitization
      for (const source of dangerousSources) {
        if (source.pattern.test(content)) {
          // Check if DOMPurify or similar sanitization is used
          const hasSanitization = /DOMPurify|sanitize|escape|encodeURI|textContent/.test(content);

          if (!hasSanitization) {
            const hasSink = dangerousSinks.some((s) => s.pattern.test(content));
            if (!hasSink) {
              // Source without sink or sanitization in the same block
              issues.push({
                type: "dom_source",
                severity: "medium",
                description: `User-controlled DOM source "${source.name}" is read in inline script without visible sanitization. While no dangerous sink was found in the same script block, this source could flow into a vulnerable sink elsewhere in the application.`,
                evidence: content.substring(0, 300),
              });
            }
          }
        }
      }
    }

    // 2. Check for jQuery-specific sinks
    const jquerySinks = [
      { pattern: /\$\([^)]*\)\.html\s*\(/, name: "$().html()" },
      { pattern: /\$\.globalEval\s*\(/, name: "$.globalEval()" },
      { pattern: /\$\([^)]*\)\.append\s*\(/, name: "$().append()" },
      { pattern: /\$\([^)]*\)\.prepend\s*\(/, name: "$().prepend()" },
      { pattern: /\$\([^)]*\)\.after\s*\(/, name: "$().after()" },
      { pattern: /\$\([^)]*\)\.before\s*\(/, name: "$().before()" },
    ];

    for (const script of scripts) {
      const content = script.textContent || "";
      for (const sink of jquerySinks) {
        if (sink.pattern.test(content)) {
          issues.push({
            type: "dom_sink",
            severity: "medium",
            description: `jQuery DOM manipulation method "${sink.name}" found in inline script. If this method receives user-controlled input, it could lead to DOM-based XSS. jQuery's HTML manipulation methods can execute inline scripts if the input contains HTML elements with event handlers.`,
            evidence: content.substring(0, 300),
          });
        }
      }
    }

    return issues;
  });

  for (const issue of domAnalysis) {
    findings.push({
      type: issue.type === "dom_sink" ? "dom_based" : "input_vector",
      severity: (issue.severity as XSSProbeFinding["severity"]),
      title: issue.description.split(".")[0] + ".",
      description: issue.description,
      evidence: issue.evidence,
      payload: "(DOM analysis — no payload injected)",
      injectionPoint: "Inline script analysis",
      reflected: false,
      sanitized: false,
      recommendation: getDOMSinkRecommendation(issue.type),
      reference: "https://owasp.org/www-community/attacks/DOM_Based_XSS",
    });
  }

  return findings;
}

function getDOMSinkRecommendation(type: string): string {
  switch (type) {
    case "dom_sink":
      return "Replace innerHTML/outerHTML with textContent or use a sanitization library like DOMPurify. Avoid document.write() entirely. Use safer alternatives like createElement() and textContent.";
    case "dom_source":
      return "Always sanitize data from DOM sources (location.hash, location.search, etc.) before using it. Use DOMPurify.sanitize() or context-appropriate encoding.";
    default:
      return "Implement input validation and output encoding for all user-controllable data flows in the DOM.";
  }
}

// ── Stored XSS Indicator Detection ────────────────────────────────

async function detectStoredXSSIndicators(page: Page): Promise<XSSProbeFinding[]> {
  const findings: XSSProbeFinding[] = [];

  const indicators = await page.evaluate(() => {
    const results: Array<{
      type: string;
      description: string;
      evidence: string;
      severity: string;
    }> = [];

    // Check for content-editable areas without sanitization indicators
    const editables = Array.from(document.querySelectorAll("[contenteditable='true'], [contenteditable='']"));
    for (const el of editables) {
      const hasSanitizeLib = document.querySelector("script[src*='dompurify'], script[src*='sanitize'], script[src*='xss']");
      results.push({
        type: "stored_indicator",
        description: `Content-editable element found${!hasSanitizeLib ? " without visible sanitization library" : ""}. User-generated content from contenteditable areas may be stored without sanitization, leading to stored XSS if the content is rendered to other users without proper encoding.`,
        evidence: el.outerHTML.substring(0, 200),
        severity: "medium",
      });
    }

    // Check for rich text editors
    const richTextEditors = Array.from(document.querySelectorAll(
      ".ql-editor, .cke_editable, .mce-content-body, .tox-edit-area, .ProseMirror, .tiptap, [data-gramm]"
    ));
    for (const editor of richTextEditors) {
      results.push({
        type: "stored_indicator",
        description: "Rich text editor detected. Rich text editors allow HTML input and may not sanitize content before it's sent to the server, potentially leading to stored XSS if the server does not properly sanitize the stored content before rendering it to other users.",
        evidence: editor.outerHTML.substring(0, 200),
        severity: "medium",
      });
    }

    // Check for comment/review sections that might store user content
    const userContentAreas = Array.from(document.querySelectorAll(
      "[class*='comment'], [class*='review'], [class*='feedback'], [id*='comment'], [id*='review']"
    ));
    if (userContentAreas.length > 0) {
      results.push({
        type: "stored_indicator",
        description: `${userContentAreas.length} user-generated content area(s) detected (comments/reviews/feedback). These areas typically accept and display user input to other users, making them prime targets for stored XSS attacks if the server does not properly sanitize the stored content.`,
        evidence: userContentAreas.slice(0, 3).map((el) => el.tagName + (el.className ? `.${el.className.split(" ")[0]}` : "") + (el.id ? `#${el.id}` : "")).join(", "),
        severity: "low",
      });
    }

    return results;
  });

  for (const indicator of indicators) {
    findings.push({
      type: "stored_indicator",
      severity: indicator.severity as XSSProbeFinding["severity"],
      title: indicator.description.split(".")[0] + ".",
      description: indicator.description,
      evidence: indicator.evidence,
      payload: "(Stored XSS indicator — no payload injected)",
      injectionPoint: "DOM analysis",
      reflected: false,
      sanitized: false,
      recommendation: "Implement server-side sanitization for all user-generated content before storage and before rendering. Use a library like DOMPurify for HTML sanitization. Apply Content Security Policy headers as a defense-in-depth measure. Consider using a allowlist approach for accepted HTML tags and attributes.",
      reference: "https://owasp.org/www-community/attacks/xss/#stored-xss-attacks",
    });
  }

  return findings;
}

// ── Auth Probing ──────────────────────────────────────────────────

/**
 * Perform active authentication probing by:
 * 1. Detecting login forms and auth-related pages
 * 2. Testing for missing CSRF protection on login/auth forms
 * 3. Checking for insecure session handling
 * 4. Testing for open redirect vulnerabilities
 * 5. Detecting auth bypass indicators
 * 6. Testing for rate limiting on auth endpoints
 */
async function performAuthProbing(
  page: Page,
  baseUrl: string
): Promise<{ findings: AuthProbeFinding[]; endpoints: string[] }> {
  const findings: AuthProbeFinding[] = [];
  const endpoints: string[] = [];

  // 1. Detect login forms and auth elements
  const authAnalysis = await page.evaluate(() => {
    const result: {
      loginForms: Array<{
        action: string;
        method: string;
        hasCSRF: boolean;
        csrfFieldName: string;
        hasPasswordField: boolean;
        hasAutocomplete: boolean;
        inputs: Array<{ name: string; type: string; autocomplete: string }>;
      }>;
      authLinks: string[];
      sessionCookies: string[];
      hasMetaAuth: boolean;
    } = {
      loginForms: [],
      authLinks: [],
      sessionCookies: [],
      hasMetaAuth: false,
    };

    // Detect login forms
    const forms = Array.from(document.querySelectorAll("form"));
    for (const form of forms) {
      const inputs = Array.from(form.querySelectorAll("input, textarea, select"));
      const hasPassword = inputs.some(
        (i) => (i as HTMLInputElement).type === "password"
      );
      const hasEmail = inputs.some(
        (i) => (i as HTMLInputElement).type === "email" ||
          (i as HTMLInputElement).name?.toLowerCase().includes("email") ||
          (i as HTMLInputElement).name?.toLowerCase().includes("username") ||
          (i as HTMLInputElement).name?.toLowerCase().includes("login")
      );

      if (hasPassword || hasEmail) {
        // This looks like a login/auth form
        const csrfField = form.querySelector(
          'input[name*="csrf"], input[name*="token"], input[name*="_token"], input[name*="authenticity"], input[name*="xsrf"], input[name*="nonce"]'
        );

        result.loginForms.push({
          action: form.action || window.location.href,
          method: (form.method || "GET").toUpperCase(),
          hasCSRF: !!csrfField,
          csrfFieldName: csrfField ? (csrfField as HTMLInputElement).name : "",
          hasPasswordField: hasPassword,
          hasAutocomplete: inputs.some(
            (i) => (i as HTMLInputElement).autocomplete === "off" ||
              (i as HTMLInputElement).autocomplete === "new-password"
          ),
          inputs: inputs.map((i) => ({
            name: (i as HTMLInputElement).name || "",
            type: (i as HTMLInputElement).type || "",
            autocomplete: (i as HTMLInputElement).autocomplete || "",
          })),
        });
      }
    }

    // Detect auth-related links
    const links = Array.from(document.querySelectorAll("a[href]"));
    const authPatterns = [
      /login/i, /signin/i, /sign-in/i, /auth/i, /register/i, /signup/i,
      /sign-up/i, /logout/i, /signout/i, /sign-out/i, /forgot/i,
      /reset-password/i, /change-password/i, /profile/i, /account/i,
    ];

    for (const link of links) {
      const href = (link as HTMLAnchorElement).href;
      const text = link.textContent || "";
      for (const pattern of authPatterns) {
        if (pattern.test(href) || pattern.test(text)) {
          if (!result.authLinks.includes(href)) {
            result.authLinks.push(href);
          }
          break;
        }
      }
    }

    // Check accessible cookies (missing HttpOnly)
    const cookieStr = document.cookie;
    if (cookieStr) {
      result.sessionCookies = cookieStr.split(";").map((c) => c.trim().split("=")[0]?.trim() || "");
    }

    // Check for auth-related meta tags
    const metaTags = Array.from(document.querySelectorAll("meta"));
    for (const meta of metaTags) {
      const name = meta.getAttribute("name") || "";
      if (name.includes("auth") || name.includes("csrf") || name.includes("token")) {
        result.hasMetaAuth = true;
        break;
      }
    }

    return result;
  });

  // 2. Analyze login forms
  for (const loginForm of authAnalysis.loginForms) {
    endpoints.push(loginForm.action);

    // Missing CSRF token on login form
    if (!loginForm.hasCSRF) {
      findings.push({
        type: "missing_csrf",
        severity: "high",
        title: "Login form missing CSRF token protection",
        description: `The login form at "${loginForm.action}" does not include a CSRF token field. Without CSRF protection, an attacker can forge login requests from other websites, potentially logging the victim into an attacker-controlled account (login CSRF). This can lead to serious security issues, especially if the application trusts the authenticated session to perform sensitive operations. The attacker could then trick the victim into performing actions under the attacker's account, and later retrieve any data or actions the victim performed.`,
        evidence: `Form action: ${loginForm.action}, method: ${loginForm.method}, no CSRF token field found. Fields: ${loginForm.inputs.map((i) => `${i.name}(${i.type})`).join(", ")}`,
        endpoint: loginForm.action,
        method: loginForm.method,
        recommendation: "Add a CSRF token to all authentication forms. Most modern frameworks provide built-in CSRF protection (e.g., csurf for Express, Django's CSRF middleware, Rails' protect_from_forgery). Use the SameSite cookie attribute as an additional defense layer.",
        reference: "https://owasp.org/www-community/attacks/csrf",
      });
    }

    // Login form using GET method (credentials in URL)
    if (loginForm.method === "GET" && loginForm.hasPasswordField) {
      findings.push({
        type: "insecure_login",
        severity: "high",
        title: "Login form submits credentials via GET method",
        description: `The login form at "${loginForm.action}" uses the HTTP GET method, which means credentials will be included in the URL query string. This exposes passwords in browser history, server access logs, proxy logs, and the HTTP Referer header when navigating to external sites. This is a significant security risk as credentials can be inadvertently logged, cached, or leaked to third parties through the Referer header.`,
        evidence: `Form method: GET, action: ${loginForm.action}`,
        endpoint: loginForm.action,
        method: "GET",
        recommendation: "Change the login form method to POST. Never transmit credentials via GET requests. Ensure the form submits over HTTPS to prevent network-level credential interception.",
        reference: "https://owasp.org/www-community/attacks/Information_exposure_through_query_strings_in_url",
      });
    }

    // Password field without autocomplete=off/new-password
    if (loginForm.hasPasswordField && !loginForm.hasAutocomplete) {
      findings.push({
        type: "insecure_login",
        severity: "low",
        title: "Password field missing autocomplete attribute",
        description: `The login form at "${loginForm.action}" has a password field without autocomplete="new-password" or autocomplete="off". While this is a low-severity issue, it can lead to browsers storing credentials in their password manager, which may be accessible if the user's device is compromised. For sensitive applications, setting autocomplete="new-password" on login forms and autocomplete="current-password" on change-password forms is recommended.`,
        evidence: `Password field missing autocomplete attribute in form: ${loginForm.action}`,
        endpoint: loginForm.action,
        method: loginForm.method,
        recommendation: 'Add autocomplete="new-password" to password fields on registration/change-password forms and autocomplete="current-password" on login forms to help browsers manage credentials securely.',
        reference: "https://developer.mozilla.org/en-US/docs/Web/Security/Securing_your_site/Turning_off_form_autocompletion",
      });
    }
  }

  // 3. Check session cookie security
  for (const cookieName of authAnalysis.sessionCookies) {
    const isLikelySession = [
      "session", "sess", "sid", "jsession", "phpsessid", "asp.net_sessionid",
      "connect.sid", "_session_id", "auth", "token", "jwt",
    ].some((s) => cookieName.toLowerCase().includes(s));

    if (isLikelySession) {
      findings.push({
        type: "weak_session",
        severity: "medium",
        title: `Session cookie "${cookieName}" accessible via JavaScript`,
        description: `The session cookie "${cookieName}" is accessible via document.cookie, which means it does not have the HttpOnly flag set. If an XSS vulnerability exists on the site, an attacker could steal this session cookie using JavaScript, allowing them to hijack the user's authenticated session. Session cookies should always be protected with the HttpOnly flag to prevent JavaScript access, making them immune to XSS-based session theft.`,
        evidence: `Cookie "${cookieName}" is readable via document.cookie (missing HttpOnly flag)`,
        endpoint: baseUrl,
        method: "GET",
        recommendation: `Set the HttpOnly flag on the "${cookieName}" session cookie. Also ensure the Secure flag is set (cookie only sent over HTTPS) and use SameSite=Strict or SameSite=Lax to prevent CSRF attacks via cross-origin requests.`,
        reference: "https://owasp.org/www-community/HttpOnly",
      });
    }
  }

  // 4. Test for open redirect vulnerability
  const redirectParams = ["redirect", "url", "return", "next", "continue", "goto", "forward", "destination", "redir"];
  for (const param of redirectParams.slice(0, 5)) {
    try {
      const testUrl = new URL(baseUrl);
      testUrl.searchParams.set(param, "https://evil.example.com/probato-redirect-test");

      const response = await page.goto(testUrl.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 8000,
      });

      if (response) {
        const finalUrl = page.url();
        const statusCode = response.status();

        // Check if we were redirected to the evil URL
        if (finalUrl.includes("evil.example.com") || statusCode >= 300 && statusCode < 400) {
          findings.push({
            type: "open_redirect",
            severity: "medium",
            title: `Open redirect vulnerability via "${param}" parameter`,
            description: `The application redirects to an arbitrary external URL specified via the "${param}" parameter. Open redirect vulnerabilities can be used in phishing attacks where an attacker creates a link that appears to point to a legitimate site but actually redirects to a malicious site. The trust users place in the legitimate domain name is exploited to trick them into visiting the attacker's site.`,
            evidence: `URL parameter "${param}" caused redirect to external site. Status: ${statusCode}, Final URL: ${finalUrl}`,
            endpoint: testUrl.toString(),
            method: "GET",
            recommendation: `Validate the "${param}" parameter against an allowlist of permitted redirect destinations. Only allow relative URLs (starting with /) or URLs to trusted domains. Never redirect to user-supplied URLs without validation.`,
            reference: "https://owasp.org/www-community/attacks/Open_Redirect",
          });

          endpoints.push(testUrl.toString());
        }
      }

      // Navigate back
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {});
    } catch (redirectError) {
      console.warn(`[Security-Prober] Open redirect test failed for "${param}":`, redirectError);
    }
  }

  // 5. Test for auth bypass indicators
  const bypassIndicators = await page.evaluate(() => {
    const indicators: Array<{
      type: string;
      description: string;
      evidence: string;
      severity: string;
    }> = [];

    // Check for admin/debug routes exposed to unauthenticated users
    const adminIndicators = Array.from(document.querySelectorAll(
      "a[href*='admin'], a[href*='debug'], a[href*='console'], a[href*='dashboard'], a[href*='manage'], a[href*='panel']"
    ));

    if (adminIndicators.length > 0) {
      indicators.push({
        type: "auth_bypass_indicator",
        description: `${adminIndicators.length} admin/dashboard link(s) visible on the page. If these are accessible without authentication, it could indicate an authentication bypass or missing authorization check. These links should only be visible and accessible to authenticated users with appropriate roles.`,
        evidence: adminIndicators.slice(0, 3).map((el) => (el as HTMLAnchorElement).href).join(", "),
        severity: "medium",
      });
    }

    // Check for API endpoints that might lack authentication
    const apiLinks = Array.from(document.querySelectorAll(
      "a[href*='/api/'], script[src*='/api/']"
    ));
    if (apiLinks.length > 0) {
      indicators.push({
        type: "auth_bypass_indicator",
        description: `${apiLinks.length} API endpoint(s) found on the page. These endpoints should be tested for authentication and authorization. Unauthenticated API access could lead to data exposure or unauthorized actions.`,
        evidence: apiLinks.slice(0, 5).map((el) => {
          const href = el.getAttribute("href") || el.getAttribute("src") || "";
          return href.substring(0, 100);
        }).join(", "),
        severity: "low",
      });
    }

    // Check for sensitive data in page source (auth tokens, API keys)
    const pageSource = document.documentElement.outerHTML;
    const sensitivePatterns = [
      { pattern: /api[_-]?key\s*[:=]\s*["'][a-zA-Z0-9]{20,}/i, name: "API key" },
      { pattern: /secret[_-]?key\s*[:=]\s*["'][a-zA-Z0-9]{20,}/i, name: "Secret key" },
      { pattern: /bearer\s+[a-zA-Z0-9\-._~+/]+=*/i, name: "Bearer token" },
      { pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/i, name: "JWT token" },
    ];

    for (const { pattern, name } of sensitivePatterns) {
      const match = pageSource.match(pattern);
      if (match && !pageSource.includes("example.com") && !pageSource.includes("your-api-key")) {
        indicators.push({
          type: "credential_exposure",
          description: `Potential ${name} found in page source. Exposing sensitive credentials in client-side code allows anyone who views the page source to extract them. This can lead to unauthorized access to APIs, services, or data that these credentials protect.`,
          evidence: match[0].substring(0, 50) + "...",
          severity: "critical",
        });
      }
    }

    return indicators;
  });

  for (const indicator of bypassIndicators) {
    findings.push({
      type: indicator.type as AuthProbeFinding["type"],
      severity: indicator.severity as AuthProbeFinding["severity"],
      title: indicator.description.split(".")[0] + ".",
      description: indicator.description,
      evidence: indicator.evidence,
      endpoint: baseUrl,
      method: "GET",
      recommendation: getAuthRecommendation(indicator.type),
      reference: "https://owasp.org/www-project-web-security-testing-guide/",
    });
  }

  // 6. Test for rate limiting on auth endpoints
  if (authAnalysis.loginForms.length > 0) {
    const loginForm = authAnalysis.loginForms[0];
    const hasRateLimit = await testRateLimitOnLogin(page, loginForm);
    if (!hasRateLimit) {
      findings.push({
        type: "missing_rate_limit",
        severity: "high",
        title: "Login endpoint appears to lack rate limiting",
        description: `The login endpoint at "${loginForm.action}" does not appear to enforce rate limiting. After submitting multiple failed login attempts in quick succession, the server continued to accept and process requests without blocking or throttling. This allows attackers to perform brute-force attacks to guess passwords, credential stuffing attacks using leaked credentials from other breaches, and account enumeration by observing different responses for valid vs. invalid usernames.`,
        evidence: `Multiple rapid login attempts were accepted without rate limiting at: ${loginForm.action}`,
        endpoint: loginForm.action,
        method: loginForm.method,
        recommendation: "Implement rate limiting on all authentication endpoints. Use progressive delays or account lockout after a threshold of failed attempts (e.g., 5 failed attempts triggers a 15-minute lockout). Consider implementing CAPTCHA after a few failed attempts. Monitor for unusual login patterns and implement IP-based rate limiting as well.",
        reference: "https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks",
      });
    }
  }

  // Collect auth endpoints
  for (const link of authAnalysis.authLinks) {
    if (!endpoints.includes(link)) {
      endpoints.push(link);
    }
  }

  return { findings, endpoints };
}

// ── Rate Limit Testing ─────────────────────────────────────────────

async function testRateLimitOnLogin(
  page: Page,
  loginForm: { action: string; method: string; inputs: Array<{ name: string; type: string }> }
): Promise<boolean> {
  // Send several rapid requests and check if any are blocked
  const testCount = 5;
  let blockedCount = 0;

  for (let i = 0; i < testCount; i++) {
    try {
      const response = await page.evaluate(async (formAction, formMethod) => {
        try {
          const res = await fetch(formAction, {
            method: formMethod === "GET" ? "GET" : "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formMethod === "GET" ? undefined : "username=probato_test_invalid&password=wrong_password_" + Date.now(),
          });
          return { status: res.status, ok: res.ok };
        } catch {
          return { status: 0, ok: false };
        }
      }, loginForm.action, loginForm.method);

      // 429 = Too Many Requests, 403 = Forbidden, 503 = Service Unavailable
      if (response.status === 429 || response.status === 403 || response.status === 503) {
        blockedCount++;
      }
    } catch {
      // Network error might indicate blocking
      blockedCount++;
    }
  }

  // If more than half the requests were blocked, rate limiting is likely in place
  return blockedCount > testCount / 2;
}

// ── Auth Recommendation Generator ──────────────────────────────────

function getAuthRecommendation(type: string): string {
  switch (type) {
    case "auth_bypass_indicator":
      return "Implement proper authentication and authorization checks on all admin/dashboard routes. Use middleware to verify session validity and user roles before serving protected pages. Apply the principle of least privilege.";
    case "credential_exposure":
      return "Never expose API keys, tokens, or secrets in client-side code. Move all sensitive credential usage to server-side API routes. Use environment variables for configuration secrets and proxy API requests through your backend.";
    case "missing_csrf":
      return "Add CSRF tokens to all state-changing forms. Use the SameSite cookie attribute and verify the Origin/Referer headers on the server side.";
    case "weak_session":
      return "Set HttpOnly, Secure, and SameSite flags on all session cookies. Use strong session IDs with sufficient entropy. Implement session rotation after login and absolute session timeouts.";
    case "open_redirect":
      return "Validate redirect URLs against an allowlist. Only allow relative paths or URLs to trusted domains. Never redirect to user-supplied URLs without validation.";
    case "insecure_login":
      return "Always use POST for login forms. Ensure credentials are transmitted over HTTPS. Implement proper password policies and consider multi-factor authentication.";
    case "missing_rate_limit":
      return "Implement rate limiting on authentication endpoints. Use progressive delays, CAPTCHA after failed attempts, and account lockout mechanisms.";
    default:
      return "Follow OWASP authentication best practices and implement defense-in-depth security measures.";
  }
}

// ── LLM-Based Analysis ────────────────────────────────────────────

interface LLMProbeResult {
  extraXSSFindings: XSSProbeFinding[];
  extraAuthFindings: AuthProbeFinding[];
}

async function callLLMForProbeAnalysis(
  url: string,
  xssFindings: XSSProbeFinding[],
  authFindings: AuthProbeFinding[]
): Promise<LLMProbeResult> {
  const prompt = buildProbePrompt(url, xssFindings, authFindings);

  // Strategy 1: Try z-ai-web-dev-sdk
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert web security penetration tester. Analyze active security probe findings and provide additional insights about XSS and authentication vulnerabilities. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    return parseProbeResponse(content);
  } catch (sdkError) {
    console.warn("[Security-Prober] z-ai-web-dev-sdk failed:", sdkError);
  }

  // Strategy 2: Try external OpenAI-compatible API
  const externalUrl = process.env.LLM_API_URL;
  const externalKey = process.env.LLM_API_KEY;
  const externalModel = process.env.LLM_MODEL || "gpt-4o-mini";

  if (externalUrl && externalKey) {
    try {
      const response = await fetch(`${externalUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${externalKey}`,
        },
        body: JSON.stringify({
          model: externalModel,
          messages: [
            {
              role: "system",
              content:
                "You are an expert web security penetration tester. Analyze active security probe findings and provide additional insights about XSS and authentication vulnerabilities. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content ?? "";
        return parseProbeResponse(content);
      }
    } catch (fetchError) {
      console.warn("[Security-Prober] External API failed:", fetchError);
    }
  }

  // Strategy 3: Rule-based fallback — no additional findings
  return { extraXSSFindings: [], extraAuthFindings: [] };
}

function buildProbePrompt(
  url: string,
  xssFindings: XSSProbeFinding[],
  authFindings: AuthProbeFinding[]
): string {
  const xssSummary = xssFindings
    .map((f) => `- [${f.severity}] ${f.type}: ${f.title} (reflected=${f.reflected}, sanitized=${f.sanitized})`)
    .join("\n");

  const authSummary = authFindings
    .map((f) => `- [${f.severity}] ${f.type}: ${f.title}`)
    .join("\n");

  return `Analyze the following active security probe results for ${url}:

XSS Probe Findings:
${xssSummary || "No XSS findings."}

Auth Probe Findings:
${authSummary || "No auth findings."}

Return a JSON object with any additional security concerns or insights:
{
  "xssFindings": [
    {
      "type": "reflected|dom_based|stored_indicator|input_vector",
      "severity": "critical|high|medium|low|info",
      "title": "Short title",
      "description": "Detailed description",
      "evidence": "What was observed",
      "payload": "Test payload used",
      "injectionPoint": "Where payload was injected",
      "reflected": true/false,
      "sanitized": true/false,
      "recommendation": "How to fix",
      "reference": "URL to docs"
    }
  ],
  "authFindings": [
    {
      "type": "missing_csrf|weak_session|open_redirect|auth_bypass_indicator|insecure_login|credential_exposure|session_fixation_indicator|broken_auth_flow|missing_rate_limit",
      "severity": "critical|high|medium|low|info",
      "title": "Short title",
      "description": "Detailed description",
      "evidence": "What was observed",
      "endpoint": "The auth endpoint",
      "method": "HTTP method",
      "recommendation": "How to fix",
      "reference": "URL to docs"
    }
  ]
}

Rules:
- Only add findings that are genuinely new and not covered by existing findings
- Focus on high-impact XSS and authentication security issues
- Provide actionable recommendations
- Return ONLY the JSON, no markdown or explanation`;
}

function parseProbeResponse(content: string): LLMProbeResult {
  const result: LLMProbeResult = { extraXSSFindings: [], extraAuthFindings: [] };

  try {
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return result;

    const parsed = JSON.parse(jsonMatch[0]);

    // Parse XSS findings
    if (Array.isArray(parsed.xssFindings)) {
      result.extraXSSFindings = parsed.xssFindings.map((f: any) => ({
        type: isValidXSSType(f.type) ? f.type : "input_vector",
        severity: isValidSeverity(f.severity) ? f.severity : "info",
        title: String(f.title ?? "Untitled XSS finding"),
        description: String(f.description ?? ""),
        evidence: String(f.evidence ?? ""),
        payload: String(f.payload ?? ""),
        injectionPoint: String(f.injectionPoint ?? ""),
        reflected: Boolean(f.reflected),
        sanitized: Boolean(f.sanitized),
        recommendation: String(f.recommendation ?? ""),
        reference: f.reference ? String(f.reference) : undefined,
      }));
    }

    // Parse Auth findings
    if (Array.isArray(parsed.authFindings)) {
      result.extraAuthFindings = parsed.authFindings.map((f: any) => ({
        type: isValidAuthType(f.type) ? f.type : "broken_auth_flow",
        severity: isValidSeverity(f.severity) ? f.severity : "info",
        title: String(f.title ?? "Untitled auth finding"),
        description: String(f.description ?? ""),
        evidence: String(f.evidence ?? ""),
        endpoint: String(f.endpoint ?? ""),
        method: String(f.method ?? "GET"),
        recommendation: String(f.recommendation ?? ""),
        reference: f.reference ? String(f.reference) : undefined,
      }));
    }
  } catch (parseError) {
    console.warn("[Security-Prober] Failed to parse LLM response:", parseError);
  }

  return result;
}

function isValidSeverity(s: string): s is XSSProbeFinding["severity"] {
  return ["critical", "high", "medium", "low", "info"].includes(s);
}

function isValidXSSType(t: string): boolean {
  return ["reflected", "dom_based", "stored_indicator", "input_vector"].includes(t);
}

function isValidAuthType(t: string): boolean {
  return [
    "missing_csrf", "weak_session", "open_redirect", "auth_bypass_indicator",
    "insecure_login", "credential_exposure", "session_fixation_indicator",
    "broken_auth_flow", "missing_rate_limit",
  ].includes(t);
}

// ── Recommendation Generator ──────────────────────────────────────

function generateRecommendations(
  xssFindings: XSSProbeFinding[],
  authFindings: AuthProbeFinding[]
): string[] {
  const recommendations: string[] = [];

  const criticalXSS = xssFindings.filter((f) => f.severity === "critical").length;
  const highXSS = xssFindings.filter((f) => f.severity === "high").length;
  const reflectedXSS = xssFindings.filter((f) => f.type === "reflected" && f.reflected && !f.sanitized).length;
  const domXSS = xssFindings.filter((f) => f.type === "dom_based").length;

  const criticalAuth = authFindings.filter((f) => f.severity === "critical").length;
  const highAuth = authFindings.filter((f) => f.severity === "high").length;
  const missingCSRF = authFindings.filter((f) => f.type === "missing_csrf").length;
  const weakSessions = authFindings.filter((f) => f.type === "weak_session").length;
  const openRedirects = authFindings.filter((f) => f.type === "open_redirect").length;

  // XSS recommendations
  if (criticalXSS > 0) {
    recommendations.push(
      `Fix ${criticalXSS} critical XSS vulnerability(ies) immediately. Confirmed reflected XSS allows attackers to inject arbitrary content that executes in victims' browsers.`
    );
  }

  if (reflectedXSS > 0) {
    recommendations.push(
      `Address ${reflectedXSS} reflected XSS finding(s). Implement context-aware output encoding for all user-controllable data. Use auto-escaping template engines.`
    );
  }

  if (domXSS > 0) {
    recommendations.push(
      `Fix ${domXSS} DOM-based XSS issue(s). Replace innerHTML with textContent, sanitize input with DOMPurify, and avoid using location.hash/search directly in DOM manipulation.`
    );
  }

  // Auth recommendations
  if (criticalAuth > 0) {
    recommendations.push(
      `Fix ${criticalAuth} critical authentication security issue(s) immediately. Exposed credentials or auth bypass vulnerabilities can lead to complete account compromise.`
    );
  }

  if (missingCSRF > 0) {
    recommendations.push(
      `Add CSRF protection to ${missingCSRF} form(s). Implement anti-CSRF tokens and use the SameSite cookie attribute as additional protection.`
    );
  }

  if (weakSessions > 0) {
    recommendations.push(
      `Secure ${weakSessions} session cookie(s) with HttpOnly, Secure, and SameSite flags. Implement session rotation and proper timeout mechanisms.`
    );
  }

  if (openRedirects > 0) {
    recommendations.push(
      `Fix ${openRedirects} open redirect vulnerability(ies). Validate redirect URLs against an allowlist and only allow relative paths or trusted domains.`
    );
  }

  if (highXSS > 0 || highAuth > 0) {
    recommendations.push(
      `Address ${highXSS + highAuth} high severity security issue(s) as soon as possible. These represent significant attack vectors that could lead to data theft or unauthorized access.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("No active security vulnerabilities detected. Continue regular security testing and monitoring.");
  }

  // Always add a defense-in-depth recommendation
  recommendations.push(
    "Implement a Content Security Policy (CSP) header as a defense-in-depth measure against XSS attacks, even if no vulnerabilities were found. CSP significantly reduces the impact of any future XSS vulnerabilities."
  );

  return recommendations;
}
