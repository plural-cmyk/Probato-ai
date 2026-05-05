/**
 * Probato Security Scanner Agent
 *
 * Scans web pages for common security vulnerabilities:
 * - HTTP Security Headers (CSP, HSTS, X-Frame-Options, etc.)
 * - Content Security Policy validation
 * - Mixed content detection (HTTP resources on HTTPS pages)
 * - XSS vector detection in forms
 * - CORS header analysis
 * - Cookie security flags
 *
 * Uses the same 3-tier LLM strategy as fix-suggester.ts:
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
import type { Selector } from "./actions";

// ── Types ──────────────────────────────────────────────────────────

export interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string; // "headers" | "csp" | "mixed_content" | "xss" | "cors" | "cookies"
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
  reference?: string; // URL to OWASP/Mozilla docs
}

export interface SecurityScanInput {
  projectId: string;
  userId: string;
  url: string;
  testRunId?: string;
  checkHeaders?: boolean;  // default true
  checkCSP?: boolean;      // default true
  checkMixedContent?: boolean; // default true
  checkXSS?: boolean;      // default true
  checkCORS?: boolean;     // default true
  checkCookies?: boolean;  // default true
}

export interface SecurityScanResult {
  findings: SecurityFinding[];
  overallScore: number;
  headersScore: number;
  cspScore: number;
  mixedContentScore: number;
  recommendations: string[];
  duration: number;
  llmUsed: boolean;
  error?: string;
}

// ── Score Calculation ─────────────────────────────────────────────

function calculateScore(findings: SecurityFinding[]): number {
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

export async function runSecurityScan(
  input: SecurityScanInput
): Promise<SecurityScanResult> {
  const startTime = Date.now();

  try {
    // 1. Check credits
    const creditCheck = await checkCredits(input.userId, "security_scan");
    if (!creditCheck.hasCredits) {
      return {
        findings: [],
        overallScore: 0,
        headersScore: 0,
        cspScore: 0,
        mixedContentScore: 0,
        recommendations: [],
        duration: Date.now() - startTime,
        llmUsed: false,
        error: "Insufficient credits to run security scan",
      };
    }

    // 2. Launch browser
    const managed = await getBrowserInstance();
    let findings: SecurityFinding[] = [];
    let rawHeaders: Record<string, string> | null = null;
    let llmUsed = false;

    try {
      const page = await managed.browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // 3. Navigate to URL and capture response headers
      const response = await page.goto(input.url, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      // Capture raw headers
      if (response) {
        const headers = response.headers();
        rawHeaders = headers as Record<string, string>;
      }

      // 4. Run browser-based checks
      const shouldCheckHeaders = input.checkHeaders !== false;
      const shouldCheckCSP = input.checkCSP !== false;
      const shouldCheckMixedContent = input.checkMixedContent !== false;
      const shouldCheckXSS = input.checkXSS !== false;
      const shouldCheckCORS = input.checkCORS !== false;
      const shouldCheckCookies = input.checkCookies !== false;

      if (shouldCheckHeaders && rawHeaders) {
        findings.push(...checkSecurityHeaders(rawHeaders));
      }

      if (shouldCheckCSP && rawHeaders) {
        findings.push(...checkCSP(rawHeaders));
      }

      if (shouldCheckMixedContent) {
        findings.push(...(await checkMixedContent(page)));
      }

      if (shouldCheckXSS) {
        findings.push(...(await checkXSSVectors(page)));
      }

      if (shouldCheckCORS && rawHeaders) {
        findings.push(...checkCORS(rawHeaders));
      }

      if (shouldCheckCookies) {
        findings.push(...(await checkCookieSecurity(page)));
      }

      await page.close();
    } finally {
      await cleanupBrowser(managed);
    }

    // 5. Try LLM analysis via 3-tier strategy
    try {
      const llmResult = await callLLMForSecurityAnalysis(input.url, findings);
      if (llmResult.length > 0) {
        findings = [...findings, ...llmResult];
        llmUsed = true;
      }
    } catch (error) {
      console.warn("[Security-Scanner] LLM failed, using rule-based findings only:", error);
    }

    // 6. Calculate scores
    const headerFindings = findings.filter((f) => f.category === "headers");
    const cspFindings = findings.filter((f) => f.category === "csp");
    const mixedContentFindings = findings.filter((f) => f.category === "mixed_content");

    const headersScore = calculateScore(headerFindings);
    const cspScore = calculateScore(cspFindings);
    const mixedContentScore = calculateScore(mixedContentFindings);
    const overallScore = calculateScore(findings);

    // Generate recommendations
    const recommendations = generateRecommendations(findings);

    // 7. Deduct credits
    try {
      await deductCredits(
        input.userId,
        "security_scan",
        `Security scan for ${input.url}`,
        undefined,
        undefined
      );
    } catch (creditError) {
      console.warn("[Security-Scanner] Credit deduction failed:", creditError);
    }

    // 8. Persist to DB
    let scanId: string | undefined;
    try {
      const scan = await db.securityScan.create({
        data: {
          status: "completed",
          url: input.url,
          overallScore,
          headersScore,
          cspScore,
          mixedContentScore,
          findings: findings as any,
          recommendations: recommendations as any,
          rawHeaders: rawHeaders as any,
          llmUsed,
          duration: Date.now() - startTime,
          projectId: input.projectId,
          userId: input.userId,
          testRunId: input.testRunId ?? null,
        },
      });
      scanId = scan.id;
    } catch (dbError) {
      console.warn("[Security-Scanner] Failed to persist scan:", dbError);
    }

    // 9. Dispatch notification
    if (findings.some((f) => f.severity === "critical" || f.severity === "high")) {
      try {
        await dispatchNotification({
          type: "security_issue",
          title: `Security issues found: ${input.url}`,
          message: `${findings.length} security findings detected. ${findings.filter((f) => f.severity === "critical").length} critical, ${findings.filter((f) => f.severity === "high").length} high severity.`,
          userId: input.userId,
          projectId: input.projectId,
          testRunId: input.testRunId,
          actionUrl: `/dashboard/projects/${input.projectId}`,
          priority: findings.some((f) => f.severity === "critical") ? "critical" : "high",
          metadata: {
            scanId,
            overallScore,
            findingCount: findings.length,
            criticalCount: findings.filter((f) => f.severity === "critical").length,
            highCount: findings.filter((f) => f.severity === "high").length,
          },
        });
      } catch (notifError) {
        console.warn("[Security-Scanner] Notification dispatch failed:", notifError);
      }
    }

    // 10. Return result
    return {
      findings,
      overallScore,
      headersScore,
      cspScore,
      mixedContentScore,
      recommendations,
      duration: Date.now() - startTime,
      llmUsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Security-Scanner] Failed:", message);

    // Try to persist as failed
    try {
      await db.securityScan.create({
        data: {
          status: "failed",
          url: input.url,
          overallScore: 0,
          headersScore: 0,
          cspScore: 0,
          mixedContentScore: 0,
          findings: [],
          recommendations: [],
          duration: Date.now() - startTime,
          error: message,
          projectId: input.projectId,
          userId: input.userId,
          testRunId: input.testRunId ?? null,
        },
      });
    } catch (dbError) {
      console.warn("[Security-Scanner] Failed to persist error state:", dbError);
    }

    return {
      findings: [],
      overallScore: 0,
      headersScore: 0,
      cspScore: 0,
      mixedContentScore: 0,
      recommendations: [],
      duration: Date.now() - startTime,
      llmUsed: false,
      error: message,
    };
  }
}

// ── Security Headers Check ────────────────────────────────────────

function checkSecurityHeaders(headers: Record<string, string>): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  const requiredHeaders: Array<{
    name: string;
    severity: SecurityFinding["severity"];
    title: string;
    description: string;
    recommendation: string;
    reference: string;
  }> = [
    {
      name: "content-security-policy",
      severity: "high",
      title: "Missing Content-Security-Policy header",
      description: "The Content-Security-Policy header helps prevent XSS attacks by controlling which resources the browser is allowed to load.",
      recommendation: "Add a Content-Security-Policy header to restrict resource loading to trusted sources.",
      reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP",
    },
    {
      name: "strict-transport-security",
      severity: "high",
      title: "Missing Strict-Transport-Security header",
      description: "The HSTS header ensures browsers only connect via HTTPS, preventing protocol downgrade attacks and cookie hijacking.",
      recommendation: "Add Strict-Transport-Security header with a max-age of at least 1 year (e.g., 'max-age=31536000; includeSubDomains').",
      reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security",
    },
    {
      name: "x-frame-options",
      severity: "medium",
      title: "Missing X-Frame-Options header",
      description: "The X-Frame-Options header prevents clickjacking attacks by controlling whether a page can be embedded in an iframe.",
      recommendation: "Add X-Frame-Options header set to 'DENY' or 'SAMEORIGIN'.",
      reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options",
    },
    {
      name: "x-content-type-options",
      severity: "medium",
      title: "Missing X-Content-Type-Options header",
      description: "The X-Content-Type-Options header prevents MIME-type sniffing, which can lead to security vulnerabilities.",
      recommendation: "Add X-Content-Type-Options header set to 'nosniff'.",
      reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options",
    },
    {
      name: "referrer-policy",
      severity: "low",
      title: "Missing Referrer-Policy header",
      description: "The Referrer-Policy header controls how much referrer information is shared when navigating away from the page.",
      recommendation: "Add Referrer-Policy header set to 'strict-origin-when-cross-origin' or 'no-referrer'.",
      reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy",
    },
    {
      name: "permissions-policy",
      severity: "low",
      title: "Missing Permissions-Policy header",
      description: "The Permissions-Policy header controls which browser features and APIs can be used in the page.",
      recommendation: "Add Permissions-Policy header to restrict access to sensitive browser features (camera, microphone, geolocation, etc.).",
      reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy",
    },
  ];

  for (const header of requiredHeaders) {
    const headerName = Object.keys(headers).find(
      (k) => k.toLowerCase() === header.name
    );
    if (!headerName) {
      findings.push({
        severity: header.severity,
        category: "headers",
        title: header.title,
        description: header.description,
        evidence: `Header "${header.name}" is not present in the HTTP response`,
        recommendation: header.recommendation,
        reference: header.reference,
      });
    }
  }

  return findings;
}

// ── CSP Check ─────────────────────────────────────────────────────

function checkCSP(headers: Record<string, string>): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  const cspHeader = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === "content-security-policy"
  );

  if (!cspHeader) {
    // Already reported by checkSecurityHeaders
    return findings;
  }

  const cspValue = cspHeader[1];

  // Check for unsafe-inline
  if (cspValue.includes("'unsafe-inline'")) {
    findings.push({
      severity: "high",
      category: "csp",
      title: "CSP allows unsafe-inline scripts",
      description: "The Content-Security-Policy includes 'unsafe-inline', which negates much of the XSS protection that CSP provides.",
      evidence: `CSP directive contains 'unsafe-inline': ${cspValue.substring(0, 200)}`,
      recommendation: "Remove 'unsafe-inline' and use nonce-based or hash-based CSP directives instead.",
      reference: "https://content-security-policy.com/nonce/",
    });
  }

  // Check for unsafe-eval
  if (cspValue.includes("'unsafe-eval'")) {
    findings.push({
      severity: "high",
      category: "csp",
      title: "CSP allows unsafe-eval",
      description: "The Content-Security-Policy includes 'unsafe-eval', which allows eval() and similar functions that can lead to code injection.",
      evidence: `CSP directive contains 'unsafe-eval': ${cspValue.substring(0, 200)}`,
      recommendation: "Remove 'unsafe-eval' and refactor code to avoid eval(), new Function(), and similar dynamic code execution.",
      reference: "https://content-security-policy.com/eval/",
    });
  }

  // Check for overly broad * in script-src
  if (cspValue.includes("script-src") && cspValue.match(/script-src[^;]*\*/)) {
    findings.push({
      severity: "medium",
      category: "csp",
      title: "CSP script-src uses wildcard",
      description: "The CSP script-src directive uses a wildcard (*), allowing scripts from any origin.",
      evidence: `CSP script-src contains wildcard: ${cspValue.substring(0, 200)}`,
      recommendation: "Replace the wildcard with specific trusted domains for script loading.",
      reference: "https://content-security-policy.com/script-src/",
    });
  }

  // Check for missing default-src
  if (!cspValue.includes("default-src")) {
    findings.push({
      severity: "medium",
      category: "csp",
      title: "CSP missing default-src directive",
      description: "The Content-Security-Policy does not include a default-src directive, which serves as a fallback for other resource types.",
      evidence: `CSP does not contain default-src: ${cspValue.substring(0, 200)}`,
      recommendation: "Add a default-src directive as a fallback (e.g., 'default-src \\'self\\'').",
      reference: "https://content-security-policy.com/default-src/",
    });
  }

  return findings;
}

// ── Mixed Content Check ───────────────────────────────────────────

async function checkMixedContent(page: Page): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const url = page.url();

  // Only check if the page is HTTPS
  if (!url.startsWith("https://")) {
    findings.push({
      severity: "info",
      category: "mixed_content",
      title: "Page served over HTTP",
      description: "The page is served over HTTP rather than HTTPS. All pages should use HTTPS to protect user data.",
      evidence: `Page URL: ${url}`,
      recommendation: "Serve the page over HTTPS and redirect all HTTP traffic to HTTPS.",
      reference: "https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content",
    });
    return findings;
  }

  // Find HTTP resources on the HTTPS page
  const mixedResources = await page.evaluate(() => {
    const results: Array<{ type: string; src: string; element: string }> = [];

    // Check img elements
    const images = Array.from(document.querySelectorAll("img[src]"));
    for (const img of images) {
      const src = (img as HTMLImageElement).src;
      if (src.startsWith("http://")) {
        results.push({ type: "img", src, element: img.outerHTML.substring(0, 150) });
      }
    }

    // Check script elements
    const scripts = Array.from(document.querySelectorAll("script[src]"));
    for (const script of scripts) {
      const src = (script as HTMLScriptElement).src;
      if (src.startsWith("http://")) {
        results.push({ type: "script", src, element: script.outerHTML.substring(0, 150) });
      }
    }

    // Check link elements
    const links = Array.from(document.querySelectorAll("link[href]"));
    for (const link of links) {
      const href = (link as HTMLLinkElement).href;
      if (href.startsWith("http://")) {
        results.push({ type: "link", src: href, element: link.outerHTML.substring(0, 150) });
      }
    }

    // Check iframe elements
    const iframes = Array.from(document.querySelectorAll("iframe[src]"));
    for (const iframe of iframes) {
      const src = (iframe as HTMLIFrameElement).src;
      if (src.startsWith("http://")) {
        results.push({ type: "iframe", src, element: iframe.outerHTML.substring(0, 150) });
      }
    }

    return results;
  });

  // Separate by severity: scripts/iframes are more dangerous than images
  for (const resource of mixedResources) {
    const isCritical = resource.type === "script" || resource.type === "iframe";
    findings.push({
      severity: isCritical ? "high" : "medium",
      category: "mixed_content",
      title: `Mixed content: HTTP ${resource.type} on HTTPS page`,
      description: `An HTTP ${resource.type} resource is loaded on an HTTPS page, which weakens the security of the entire page.${isCritical ? " Script and iframe mixed content is especially dangerous as it can compromise the entire page." : ""}`,
      evidence: resource.src,
      recommendation: `Change the ${resource.type} URL to use HTTPS: ${resource.src.replace("http://", "https://")}`,
      reference: "https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content",
    });
  }

  return findings;
}

// ── XSS Vector Check ──────────────────────────────────────────────

async function checkXSSVectors(page: Page): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  const xssIssues = await page.evaluate(() => {
    const issues: Array<{ type: string; description: string; evidence: string }> = [];

    // Find forms without CSRF tokens
    const forms = Array.from(document.querySelectorAll("form"));
    for (const form of forms) {
      const hasCSRF = form.querySelector(
        'input[name*="csrf"], input[name*="token"], input[name*="_token"], input[name*="authenticity"]'
      );
      if (!hasCSRF && (form.method === "POST" || form.method.toLowerCase() === "post")) {
        issues.push({
          type: "csrf",
          description: "Form submitted via POST without a CSRF token",
          evidence: form.outerHTML.substring(0, 200),
        });
      }
    }

    // Find inline event handlers
    const allElements = Array.from(document.querySelectorAll("*"));
    const eventAttributes = [
      "onclick", "onload", "onerror", "onmouseover", "onfocus", "onblur",
      "onsubmit", "onkeydown", "onkeyup", "onkeypress", "onchange",
    ];

    let inlineHandlerCount = 0;
    for (const el of allElements) {
      for (const attr of eventAttributes) {
        if (el.hasAttribute(attr)) {
          inlineHandlerCount++;
          break;
        }
      }
    }

    if (inlineHandlerCount > 0) {
      issues.push({
        type: "inline_handlers",
        description: `${inlineHandlerCount} element(s) with inline event handlers detected, which can be a vector for XSS attacks`,
        evidence: `${inlineHandlerCount} inline event handler(s) found`,
      });
    }

    // Find javascript: URLs
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      if (href.toLowerCase().startsWith("javascript:")) {
        issues.push({
          type: "javascript_uri",
          description: "Anchor element with javascript: URI found",
          evidence: a.outerHTML.substring(0, 150),
        });
      }
    }

    return issues;
  });

  for (const issue of xssIssues) {
    let severity: SecurityFinding["severity"] = "medium";
    if (issue.type === "csrf") severity = "high";
    if (issue.type === "javascript_uri") severity = "high";
    if (issue.type === "inline_handlers") severity = "medium";

    findings.push({
      severity,
      category: "xss",
      title: issue.description,
      description: issue.description,
      evidence: issue.evidence,
      recommendation: getXSRecommendation(issue.type),
      reference: "https://owasp.org/www-community/attacks/xss/",
    });
  }

  return findings;
}

function getXSRecommendation(type: string): string {
  switch (type) {
    case "csrf":
      return "Add a CSRF token to all POST forms. Use frameworks that provide automatic CSRF protection.";
    case "inline_handlers":
      return "Move all inline event handlers to external JavaScript files. Use addEventListener() instead.";
    case "javascript_uri":
      return "Replace javascript: URIs with proper event handlers. Never use javascript: in href attributes.";
    default:
      return "Review and sanitize all user-controllable input and output.";
  }
}

// ── CORS Check ────────────────────────────────────────────────────

function checkCORS(headers: Record<string, string>): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  const acaoHeader = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === "access-control-allow-origin"
  );

  if (acaoHeader) {
    const value = acaoHeader[1];
    if (value === "*") {
      findings.push({
        severity: "high",
        category: "cors",
        title: "Overly permissive CORS: Access-Control-Allow-Origin is *",
        description: "The Access-Control-Allow-Origin header is set to '*', allowing any origin to access the resource. This can lead to cross-site request forgery and data theft.",
        evidence: `Access-Control-Allow-Origin: *`,
        recommendation: "Set Access-Control-Allow-Origin to specific trusted origins instead of '*'.",
        reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS",
      });
    } else if (value.includes(",")) {
      findings.push({
        severity: "medium",
        category: "cors",
        title: "Multiple origins in Access-Control-Allow-Origin",
        description: "The Access-Control-Allow-Origin header contains multiple origins, which is not standard and may be misconfigured.",
        evidence: `Access-Control-Allow-Origin: ${value}`,
        recommendation: "Return a single origin per request based on the Origin request header. Use a server-side allowlist.",
        reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS",
      });
    }
  }

  // Check for credentials with wildcard
  const acacHeader = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === "access-control-allow-credentials"
  );

  if (acacHeader && acacHeader[1].toLowerCase() === "true" && acaoHeader?.[1] === "*") {
    findings.push({
      severity: "critical",
      category: "cors",
      title: "CORS allows credentials with wildcard origin",
      description: "Access-Control-Allow-Credentials is set to true with Access-Control-Allow-Origin: *. Browsers block this combination, but it indicates a serious misconfiguration.",
      evidence: "Access-Control-Allow-Credentials: true + Access-Control-Allow-Origin: *",
      recommendation: "Never use Access-Control-Allow-Origin: * when credentials are allowed. Specify exact origins instead.",
      reference: "https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny",
    });
  }

  return findings;
}

// ── Cookie Security Check ─────────────────────────────────────────

async function checkCookieSecurity(page: Page): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  const cookieIssues = await page.evaluate(() => {
    // We can't directly access HttpOnly cookies from JS (that's the point)
    // But we can check for cookies that ARE accessible (missing HttpOnly)
    const accessibleCookies = document.cookie;
    if (!accessibleCookies) return [];

    const cookiePairs = accessibleCookies.split(";").map((c) => c.trim());
    const issues: Array<{ cookie: string; description: string }> = [];

    // Any cookie accessible via document.cookie lacks the HttpOnly flag
    for (const pair of cookiePairs) {
      const name = pair.split("=")[0]?.trim();
      if (name) {
        // Skip obviously non-sensitive cookies
        const isLikelyNonSensitive = [
          "theme", "lang", "locale", "timezone", "preferences",
          "cookie_consent", "gdpr", "analytics", "_ga", "_gid",
        ].some((ns) => name.toLowerCase().includes(ns));

        if (!isLikelyNonSensitive) {
          issues.push({
            cookie: name,
            description: `Cookie "${name}" is accessible via JavaScript (missing HttpOnly flag)`,
          });
        }
      }
    }

    return issues;
  });

  for (const issue of cookieIssues) {
    findings.push({
      severity: "medium",
      category: "cookies",
      title: issue.description,
      description: "Cookies accessible via JavaScript are vulnerable to XSS attacks. Sensitive cookies (session, auth) should use the HttpOnly flag.",
      evidence: issue.cookie,
      recommendation: "Set the HttpOnly flag on all sensitive cookies. Only non-sensitive cookies (preferences, analytics) should be JavaScript-accessible.",
      reference: "https://owasp.org/www-community/HttpOnly",
    });
  }

  return findings;
}

// ── LLM-Based Analysis ────────────────────────────────────────────

async function callLLMForSecurityAnalysis(
  url: string,
  existingFindings: SecurityFinding[]
): Promise<SecurityFinding[]> {
  const prompt = buildSecurityPrompt(url, existingFindings);

  // Strategy 1: Try z-ai-web-dev-sdk
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert web security analyst. Analyze security scan findings and provide additional insights. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
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
    return parseSecurityResponse(content);
  } catch (sdkError) {
    console.warn("[Security-Scanner] z-ai-web-dev-sdk failed:", sdkError);
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
                "You are an expert web security analyst. Analyze security scan findings and provide additional insights. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
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
        return parseSecurityResponse(content);
      }
    } catch (fetchError) {
      console.warn("[Security-Scanner] External API failed:", fetchError);
    }
  }

  // Strategy 3: Rule-based fallback — no additional findings
  return [];
}

function buildSecurityPrompt(url: string, findings: SecurityFinding[]): string {
  const findingsSummary = findings
    .map((f) => `- [${f.severity}] ${f.category}: ${f.title}`)
    .join("\n");

  return `Analyze the following security scan results for ${url}:

Existing findings:
${findingsSummary || "No findings yet."}

Return a JSON object with any additional security concerns or insights:
{
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "headers|csp|mixed_content|xss|cors|cookies",
      "title": "Short title",
      "description": "Detailed description",
      "evidence": "What was observed",
      "recommendation": "How to fix",
      "reference": "URL to docs"
    }
  ]
}

Rules:
- Only add findings that are genuinely new and not covered by existing findings
- Focus on high-impact security issues
- Provide actionable recommendations
- Return ONLY the JSON, no markdown or explanation`;
}

function parseSecurityResponse(content: string): SecurityFinding[] {
  try {
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const findings = parsed.findings ?? [];

    return findings.map((f: any) => ({
      severity: isValidSeverity(f.severity) ? f.severity : "info",
      category: isValidCategory(f.category) ? f.category : "headers",
      title: String(f.title ?? "Untitled finding"),
      description: String(f.description ?? ""),
      evidence: String(f.evidence ?? ""),
      recommendation: String(f.recommendation ?? ""),
      reference: f.reference ? String(f.reference) : undefined,
    }));
  } catch (parseError) {
    console.warn("[Security-Scanner] Failed to parse LLM response:", parseError);
    return [];
  }
}

function isValidSeverity(s: string): s is SecurityFinding["severity"] {
  return ["critical", "high", "medium", "low", "info"].includes(s);
}

function isValidCategory(c: string): boolean {
  return ["headers", "csp", "mixed_content", "xss", "cors", "cookies"].includes(c);
}

// ── Recommendation Generator ──────────────────────────────────────

function generateRecommendations(findings: SecurityFinding[]): string[] {
  const recommendations: string[] = [];

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;

  if (criticalCount > 0) {
    recommendations.push(
      `Fix ${criticalCount} critical security issue(s) immediately. Critical vulnerabilities can lead to complete system compromise.`
    );
  }

  if (highCount > 0) {
    recommendations.push(
      `Address ${highCount} high severity issue(s) as soon as possible. These represent significant security risks.`
    );
  }

  const categories = [...new Set(findings.map((f) => f.category))];
  for (const category of categories) {
    const categoryFindings = findings.filter((f) => f.category === category);
    switch (category) {
      case "headers":
        recommendations.push(
          `Implement missing security headers (${categoryFindings.length} issue(s)). Use Helmet.js or similar middleware for automated header management.`
        );
        break;
      case "csp":
        recommendations.push(
          `Strengthen Content-Security-Policy (${categoryFindings.length} issue(s)). Remove unsafe-inline and unsafe-eval, use nonce-based policies.`
        );
        break;
      case "mixed_content":
        recommendations.push(
          `Fix mixed content issues (${categoryFindings.length} issue(s)). Upgrade all HTTP resources to HTTPS.`
        );
        break;
      case "xss":
        recommendations.push(
          `Address XSS vectors (${categoryFindings.length} issue(s)). Add CSRF tokens, remove inline handlers, sanitize all user input.`
        );
        break;
      case "cors":
        recommendations.push(
          `Fix CORS misconfigurations (${categoryFindings.length} issue(s)). Use specific origins instead of wildcards.`
        );
        break;
      case "cookies":
        recommendations.push(
          `Secure cookies (${categoryFindings.length} issue(s)). Add HttpOnly, Secure, and SameSite flags to sensitive cookies.`
        );
        break;
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("No security issues detected. Continue monitoring and re-scan regularly.");
  }

  return recommendations;
}
