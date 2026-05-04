/**
 * Probato Accessibility Auditor Agent
 *
 * Audits web pages for WCAG compliance:
 * - Color contrast ratios (WCAG 1.4.3)
 * - ARIA labels and roles (WCAG 4.1.2)
 * - Keyboard navigation (WCAG 2.1.1)
 * - Image alt text (WCAG 1.1.1)
 * - Form labels (WCAG 1.3.1, 3.3.2)
 * - Heading hierarchy (WCAG 1.3.1)
 * - Focus indicators (WCAG 2.4.7)
 * - Landmark regions (WCAG 1.3.1)
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

export interface A11yViolation {
  severity: "critical" | "serious" | "moderate" | "minor";
  wcagCriterion: string; // e.g., "1.4.3", "4.1.2"
  category: string; // "contrast" | "aria" | "keyboard" | "images" | "forms" | "headings" | "focus" | "landmarks"
  title: string;
  description: string;
  selector: string; // CSS selector of the element
  elementHtml: string; // Snippet of the element HTML
  recommendation: string;
}

export interface A11yCheckResult {
  passed: boolean;
  label: string;
  description: string;
}

export interface A11yAuditInput {
  projectId: string;
  userId: string;
  url: string;
  testRunId?: string;
  wcagLevel?: string; // "A", "AA" (default), "AAA"
  checkContrast?: boolean; // default true
  checkAria?: boolean;     // default true
  checkKeyboard?: boolean; // default true
  checkImages?: boolean;   // default true
  checkForms?: boolean;    // default true
  checkHeadings?: boolean; // default true
  checkFocus?: boolean;    // default true
  checkLandmarks?: boolean; // default true
}

export interface A11yAuditResult {
  violations: A11yViolation[];
  passes: A11yCheckResult[];
  incomplete: A11yCheckResult[];
  overallScore: number;
  recommendations: string[];
  duration: number;
  llmUsed: boolean;
  error?: string;
}

// ── Score Calculation ─────────────────────────────────────────────

function calculateA11yScore(violations: A11yViolation[]): number {
  let score = 100;
  for (const violation of violations) {
    switch (violation.severity) {
      case "critical": score -= 15; break;
      case "serious": score -= 8; break;
      case "moderate": score -= 4; break;
      case "minor": score -= 1; break;
    }
  }
  return Math.max(0, Math.min(100, score));
}

// ── Main Entry Point ──────────────────────────────────────────────

export async function runA11yAudit(
  input: A11yAuditInput
): Promise<A11yAuditResult> {
  const startTime = Date.now();

  try {
    // 1. Check credits
    const creditCheck = await checkCredits(input.userId, "a11y_audit");
    if (!creditCheck.hasCredits) {
      return {
        violations: [],
        passes: [],
        incomplete: [],
        overallScore: 0,
        recommendations: [],
        duration: Date.now() - startTime,
        llmUsed: false,
        error: "Insufficient credits to run accessibility audit",
      };
    }

    // 2. Launch browser
    const managed = await getBrowserInstance();
    let violations: A11yViolation[] = [];
    let passes: A11yCheckResult[] = [];
    let incomplete: A11yCheckResult[] = [];
    let llmUsed = false;

    try {
      const page = await managed.browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // 3. Navigate to URL
      await page.goto(input.url, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      // 4. Run browser-based a11y checks
      const shouldCheckContrast = input.checkContrast !== false;
      const shouldCheckAria = input.checkAria !== false;
      const shouldCheckKeyboard = input.checkKeyboard !== false;
      const shouldCheckImages = input.checkImages !== false;
      const shouldCheckForms = input.checkForms !== false;
      const shouldCheckHeadings = input.checkHeadings !== false;
      const shouldCheckFocus = input.checkFocus !== false;
      const shouldCheckLandmarks = input.checkLandmarks !== false;

      if (shouldCheckImages) {
        const { violations: imgViolations, passes: imgPasses } = await checkImages(page);
        violations.push(...imgViolations);
        passes.push(...imgPasses);
      }

      if (shouldCheckForms) {
        const { violations: formViolations, passes: formPasses } = await checkForms(page);
        violations.push(...formViolations);
        passes.push(...formPasses);
      }

      if (shouldCheckHeadings) {
        const { violations: headingViolations, passes: headingPasses } = await checkHeadings(page);
        violations.push(...headingViolations);
        passes.push(...headingPasses);
      }

      if (shouldCheckAria) {
        const { violations: ariaViolations, passes: ariaPasses } = await checkAriaLabels(page);
        violations.push(...ariaViolations);
        passes.push(...ariaPasses);
      }

      if (shouldCheckKeyboard) {
        const { violations: keyViolations, passes: keyPasses } = await checkKeyboardNav(page);
        violations.push(...keyViolations);
        passes.push(...keyPasses);
      }

      if (shouldCheckContrast) {
        const { violations: contrastViolations, passes: contrastPasses } = await checkContrast(page, input.wcagLevel ?? "AA");
        violations.push(...contrastViolations);
        passes.push(...contrastPasses);
      }

      if (shouldCheckFocus) {
        const { violations: focusViolations, passes: focusPasses } = await checkFocus(page);
        violations.push(...focusViolations);
        passes.push(...focusPasses);
      }

      if (shouldCheckLandmarks) {
        const { violations: landmarkViolations, passes: landmarkPasses } = await checkLandmarks(page);
        violations.push(...landmarkViolations);
        passes.push(...landmarkPasses);
      }

      await page.close();
    } finally {
      await cleanupBrowser(managed);
    }

    // 5. Try LLM enrichment via 3-tier strategy
    try {
      const llmResult = await callLLMForA11yAnalysis(input.url, violations);
      if (llmResult.length > 0) {
        violations = [...violations, ...llmResult];
        llmUsed = true;
      }
    } catch (error) {
      console.warn("[A11y-Auditor] LLM failed, using rule-based findings only:", error);
    }

    // 6. Calculate overall score
    const overallScore = calculateA11yScore(violations);

    // Generate recommendations
    const recommendations = generateA11yRecommendations(violations);

    // 7. Deduct credits
    try {
      await deductCredits(
        input.userId,
        "a11y_audit",
        `Accessibility audit for ${input.url}`,
        undefined,
        undefined
      );
    } catch (creditError) {
      console.warn("[A11y-Auditor] Credit deduction failed:", creditError);
    }

    // 8. Persist to DB
    let auditId: string | undefined;
    try {
      const audit = await db.a11yAudit.create({
        data: {
          status: "completed",
          url: input.url,
          overallScore,
          wcagLevel: input.wcagLevel ?? "AA",
          violations: violations as any,
          passes: passes as any,
          incomplete: incomplete as any,
          recommendations: recommendations as any,
          llmUsed,
          duration: Date.now() - startTime,
          projectId: input.projectId,
          userId: input.userId,
          testRunId: input.testRunId ?? null,
        },
      });
      auditId = audit.id;
    } catch (dbError) {
      console.warn("[A11y-Auditor] Failed to persist audit:", dbError);
    }

    // 9. Dispatch notification
    if (violations.some((v) => v.severity === "critical" || v.severity === "serious")) {
      try {
        await dispatchNotification({
          type: "a11y_issue",
          title: `Accessibility issues found: ${input.url}`,
          message: `${violations.length} accessibility violation(s) detected. ${violations.filter((v) => v.severity === "critical").length} critical, ${violations.filter((v) => v.severity === "serious").length} serious.`,
          userId: input.userId,
          projectId: input.projectId,
          testRunId: input.testRunId,
          actionUrl: `/dashboard/projects/${input.projectId}`,
          priority: violations.some((v) => v.severity === "critical") ? "high" : "normal",
          metadata: {
            auditId,
            overallScore,
            violationCount: violations.length,
            criticalCount: violations.filter((v) => v.severity === "critical").length,
            seriousCount: violations.filter((v) => v.severity === "serious").length,
          },
        });
      } catch (notifError) {
        console.warn("[A11y-Auditor] Notification dispatch failed:", notifError);
      }
    }

    // 10. Return result
    return {
      violations,
      passes,
      incomplete,
      overallScore,
      recommendations,
      duration: Date.now() - startTime,
      llmUsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[A11y-Auditor] Failed:", message);

    // Try to persist as failed
    try {
      await db.a11yAudit.create({
        data: {
          status: "failed",
          url: input.url,
          overallScore: 0,
          wcagLevel: input.wcagLevel ?? "AA",
          violations: [],
          passes: [],
          incomplete: [],
          recommendations: [],
          duration: Date.now() - startTime,
          error: message,
          projectId: input.projectId,
          userId: input.userId,
          testRunId: input.testRunId ?? null,
        },
      });
    } catch (dbError) {
      console.warn("[A11y-Auditor] Failed to persist error state:", dbError);
    }

    return {
      violations: [],
      passes: [],
      incomplete: [],
      overallScore: 0,
      recommendations: [],
      duration: Date.now() - startTime,
      llmUsed: false,
      error: message,
    };
  }
}

// ── Image Alt Text Check (WCAG 1.1.1) ────────────────────────────

async function checkImages(page: Page): Promise<{
  violations: A11yViolation[];
  passes: A11yCheckResult[];
}> {
  const violations: A11yViolation[] = [];
  const passes: A11yCheckResult[] = [];

  const imageIssues = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll("img"));
    const issues: Array<{ selector: string; src: string; html: string; hasAlt: boolean; altEmpty: boolean }> = [];
    let passCount = 0;

    for (const img of images) {
      const sel = img.id ? `#${img.id}` : img.className ? `.${img.className.split(" ")[0]}` : "img";
      const src = img.src || "";
      const html = img.outerHTML.substring(0, 200);

      if (!img.hasAttribute("alt")) {
        issues.push({ selector: sel, src, html, hasAlt: false, altEmpty: false });
      } else if (img.alt === "" && !img.hasAttribute("role") && img.getAttribute("role") !== "presentation") {
        issues.push({ selector: sel, src, html, hasAlt: true, altEmpty: true });
      } else {
        passCount++;
      }
    }

    return { issues, passCount };
  });

  for (const issue of imageIssues.issues) {
    violations.push({
      severity: issue.hasAlt && issue.altEmpty ? "minor" : "critical",
      wcagCriterion: "1.1.1",
      category: "images",
      title: issue.hasAlt && issue.altEmpty
        ? "Image has empty alt text without decorative role"
        : "Image missing alt attribute",
      description: issue.hasAlt && issue.altEmpty
        ? "Image has an empty alt attribute but is not marked as decorative. This may confuse screen reader users."
        : "Image element does not have an alt attribute. Screen readers cannot convey the image's meaning to users.",
      selector: issue.selector,
      elementHtml: issue.html,
      recommendation: issue.hasAlt && issue.altEmpty
        ? 'If the image is decorative, add role="presentation". Otherwise, provide descriptive alt text.'
        : "Add a descriptive alt attribute that conveys the image's purpose and content.",
    });
  }

  if (imageIssues.passCount > 0) {
    passes.push({
      passed: true,
      label: "Images with alt text",
      description: `${imageIssues.passCount} image(s) have appropriate alt text.`,
    });
  }

  return { violations, passes };
}

// ── Form Labels Check (WCAG 1.3.1, 3.3.2) ───────────────────────

async function checkForms(page: Page): Promise<{
  violations: A11yViolation[];
  passes: A11yCheckResult[];
}> {
  const violations: A11yViolation[] = [];
  const passes: A11yCheckResult[] = [];

  const formIssues = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input, textarea, select"));
    const issues: Array<{ selector: string; html: string; type: string; hasLabel: boolean }> = [];
    let passCount = 0;

    for (const input of inputs) {
      const el = input as HTMLInputElement;
      // Skip hidden, submit, reset, button inputs
      if (["hidden", "submit", "reset", "button", "image"].includes(el.type)) continue;

      const sel = el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : el.tagName.toLowerCase();
      const html = el.outerHTML.substring(0, 200);

      // Check for associated label
      const hasLabelEl = el.id ? !!document.querySelector(`label[for="${el.id}"]`) : false;
      const hasAriaLabel = el.hasAttribute("aria-label") && el.getAttribute("aria-label")!.trim() !== "";
      const hasAriaLabelledBy = el.hasAttribute("aria-labelledby") && el.getAttribute("aria-labelledby")!.trim() !== "";
      const hasTitle = el.hasAttribute("title") && el.getAttribute("title")!.trim() !== "";
      const hasPlaceholder = el.hasAttribute("placeholder") && el.getAttribute("placeholder")!.trim() !== "";

      const hasLabel = hasLabelEl || hasAriaLabel || hasAriaLabelledBy || hasTitle;

      if (!hasLabel) {
        issues.push({ selector: sel, html, type: el.type || el.tagName.toLowerCase(), hasLabel: false });
      } else {
        passCount++;
      }

      // Check placeholder-only (not sufficient for WCAG)
      if (!hasLabelEl && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle && hasPlaceholder) {
        issues.push({ selector: sel, html, type: el.type || el.tagName.toLowerCase(), hasLabel: true });
      }
    }

    return { issues, passCount };
  });

  for (const issue of formIssues.issues) {
    if (!issue.hasLabel) {
      violations.push({
        severity: "critical",
        wcagCriterion: "1.3.1",
        category: "forms",
        title: `Form input missing label`,
        description: `A ${issue.type} input does not have an associated label, aria-label, or aria-labelledby attribute. Screen readers cannot identify the purpose of this input.`,
        selector: issue.selector,
        elementHtml: issue.html,
        recommendation: "Add a <label> element with a 'for' attribute matching the input's 'id', or add an aria-label attribute to the input.",
      });
    }
  }

  if (formIssues.passCount > 0) {
    passes.push({
      passed: true,
      label: "Form inputs with labels",
      description: `${formIssues.passCount} form input(s) have proper labels.`,
    });
  }

  return { violations, passes };
}

// ── Heading Hierarchy Check (WCAG 1.3.1) ─────────────────────────

async function checkHeadings(page: Page): Promise<{
  violations: A11yViolation[];
  passes: A11yCheckResult[];
}> {
  const violations: A11yViolation[] = [];
  const passes: A11yCheckResult[] = [];

  const headingIssues = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    const issues: Array<{ selector: string; html: string; level: number; text: string }> = [];

    let lastLevel = 0;
    let h1Count = 0;

    for (const heading of headings) {
      const level = parseInt(heading.tagName[1]);
      const sel = heading.id ? `#${heading.id}` : `${heading.tagName.toLowerCase()}`;
      const html = heading.outerHTML.substring(0, 200);
      const text = heading.textContent?.substring(0, 50) || "";

      if (level === 1) h1Count++;

      // Check for skipped levels
      if (lastLevel > 0 && level > lastLevel + 1) {
        issues.push({
          selector: sel,
          html,
          level,
          text: `Skipped from h${lastLevel} to h${level}: "${text}"`,
        });
      }

      lastLevel = level;
    }

    return { issues, h1Count, headingCount: headings.length };
  });

  // Multiple h1s
  if (headingIssues.h1Count > 1) {
    violations.push({
      severity: "moderate",
      wcagCriterion: "1.3.1",
      category: "headings",
      title: "Multiple h1 elements found",
      description: `Found ${headingIssues.h1Count} h1 elements. Best practice is to have a single h1 per page to establish a clear heading hierarchy.`,
      selector: "h1",
      elementHtml: "",
      recommendation: "Use only one h1 element per page as the main heading. Use h2-h6 for sub-sections.",
    });
  }

  // Skipped levels
  for (const issue of headingIssues.issues) {
    violations.push({
      severity: "moderate",
      wcagCriterion: "1.3.1",
      category: "headings",
      title: "Heading level skipped",
      description: `Heading hierarchy is not sequential: ${issue.text}. Screen reader users rely on heading levels to navigate page structure.`,
      selector: issue.selector,
      elementHtml: issue.html,
      recommendation: "Ensure heading levels are sequential (h1→h2→h3) without skipping levels.",
    });
  }

  if (headingIssues.headingCount > 0 && violations.length === 0) {
    passes.push({
      passed: true,
      label: "Heading hierarchy",
      description: `${headingIssues.headingCount} heading(s) follow a proper hierarchy.`,
    });
  }

  return { violations, passes };
}

// ── ARIA Labels Check (WCAG 4.1.2) ───────────────────────────────

async function checkAriaLabels(page: Page): Promise<{
  violations: A11yViolation[];
  passes: A11yCheckResult[];
}> {
  const violations: A11yViolation[] = [];
  const passes: A11yCheckResult[] = [];

  const ariaIssues = await page.evaluate(() => {
    const issues: Array<{ selector: string; html: string; tag: string; role: string | null }> = [];
    let passCount = 0;

    // Check interactive elements for accessible names
    const interactiveSelectors = [
      "button", "a[href]", "input:not([type=hidden])",
      "select", "textarea", "[role='button']", "[role='link']",
      "[role='tab']", "[role='menuitem']", "[role='option']",
    ];

    const elements = Array.from(document.querySelectorAll(interactiveSelectors.join(", ")));

    for (const el of elements) {
      const htmlEl = el as HTMLElement;
      // Skip hidden elements
      if (htmlEl.offsetParent === null && htmlEl.getAttribute("aria-hidden") !== "true") continue;
      // Skip inputs with type=submit/reset/button (they have implicit labels)
      if (htmlEl instanceof HTMLInputElement && ["submit", "reset", "button"].includes(htmlEl.type)) continue;

      const sel = htmlEl.id ? `#${htmlEl.id}` : htmlEl.className ? `.${htmlEl.className.toString().split(" ")[0]}` : htmlEl.tagName.toLowerCase();
      const html = htmlEl.outerHTML.substring(0, 200);
      const role = htmlEl.getAttribute("role");

      // Check for accessible name
      const hasAriaLabel = htmlEl.hasAttribute("aria-label") && htmlEl.getAttribute("aria-label")!.trim() !== "";
      const hasAriaLabelledBy = htmlEl.hasAttribute("aria-labelledby") && htmlEl.getAttribute("aria-labelledby")!.trim() !== "";
      const hasTitle = htmlEl.hasAttribute("title") && htmlEl.getAttribute("title")!.trim() !== "";
      const hasTextContent = (htmlEl.textContent?.trim().length ?? 0) > 0;
      const hasAlt = htmlEl instanceof HTMLImageElement && htmlEl.hasAttribute("alt") && htmlEl.alt.trim() !== "";
      const hasLabel = htmlEl.id ? !!document.querySelector(`label[for="${htmlEl.id}"]`) : false;

      const hasAccessibleName = hasAriaLabel || hasAriaLabelledBy || hasTitle || hasTextContent || hasAlt || hasLabel;

      if (!hasAccessibleName) {
        issues.push({ selector: sel, html, tag: htmlEl.tagName.toLowerCase(), role });
      } else {
        passCount++;
      }
    }

    return { issues, passCount };
  });

  for (const issue of ariaIssues.issues) {
    violations.push({
      severity: "serious",
      wcagCriterion: "4.1.2",
      category: "aria",
      title: `Interactive element missing accessible name`,
      description: `A <${issue.tag}> element${issue.role ? ` with role="${issue.role}"` : ""} does not have an accessible name. Screen readers cannot identify the element's purpose.`,
      selector: issue.selector,
      elementHtml: issue.html,
      recommendation: "Add an aria-label, aria-labelledby, title, or visible text content to provide an accessible name.",
    });
  }

  if (ariaIssues.passCount > 0) {
    passes.push({
      passed: true,
      label: "Interactive elements with accessible names",
      description: `${ariaIssues.passCount} interactive element(s) have accessible names.`,
    });
  }

  return { violations, passes };
}

// ── Keyboard Navigation Check (WCAG 2.1.1) ──────────────────────

async function checkKeyboardNav(page: Page): Promise<{
  violations: A11yViolation[];
  passes: A11yCheckResult[];
}> {
  const violations: A11yViolation[] = [];
  const passes: A11yCheckResult[] = [];

  const keyboardIssues = await page.evaluate(() => {
    const issues: Array<{ selector: string; html: string; issue: string }> = [];
    let passCount = 0;

    // Check for tabindex > 0
    const positiveTabindex = Array.from(document.querySelectorAll("[tabindex]"))
      .filter((el) => {
        const tabindex = parseInt(el.getAttribute("tabindex") || "0");
        return tabindex > 0;
      });

    for (const el of positiveTabindex) {
      const sel = el.id ? `#${el.id}` : `[tabindex="${el.getAttribute("tabindex")}"]`;
      issues.push({
        selector: sel,
        html: el.outerHTML.substring(0, 200),
        issue: `tabindex="${el.getAttribute("tabindex")}" — positive tabindex disrupts natural tab order`,
      });
    }

    // Check for custom interactive elements without keyboard handlers
    const customInteractives = Array.from(
      document.querySelectorAll("[role='button'], [role='link'], [role='tab']")
    );

    for (const el of customInteractives) {
      const htmlEl = el as HTMLElement;
      const hasClickHandler = htmlEl.onclick !== null || htmlEl.hasAttribute("onclick");
      const hasKeydownHandler = htmlEl.onkeydown !== null || htmlEl.hasAttribute("onkeydown");
      const hasKeypressHandler = htmlEl.onkeypress !== null || htmlEl.hasAttribute("onkeypress");

      if (hasClickHandler && !hasKeydownHandler && !hasKeypressHandler) {
        const sel = htmlEl.id ? `#${htmlEl.id}` : `[role="${htmlEl.getAttribute("role")}"]`;
        issues.push({
          selector: sel,
          html: htmlEl.outerHTML.substring(0, 200),
          issue: "Custom interactive element with click handler but no keyboard event handler",
        });
      } else if (htmlEl.getAttribute("role") && !htmlEl.hasAttribute("tabindex") && !["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(htmlEl.tagName)) {
        const sel = htmlEl.id ? `#${htmlEl.id}` : `[role="${htmlEl.getAttribute("role")}"]`;
        issues.push({
          selector: sel,
          html: htmlEl.outerHTML.substring(0, 200),
          issue: "Element with ARIA role is not focusable (missing tabindex)",
        });
      } else {
        passCount++;
      }
    }

    return { issues, passCount, positiveTabindexCount: positiveTabindex.length };
  });

  for (const issue of keyboardIssues.issues) {
    let severity: A11yViolation["severity"] = "serious";
    if (issue.issue.includes("positive tabindex")) severity = "moderate";

    violations.push({
      severity,
      wcagCriterion: "2.1.1",
      category: "keyboard",
      title: "Keyboard navigation issue",
      description: issue.issue,
      selector: issue.selector,
      elementHtml: issue.html,
      recommendation: issue.issue.includes("positive tabindex")
        ? "Remove positive tabindex values. Use tabindex='0' to add elements to the natural tab order, or restructure the DOM for correct order."
        : issue.issue.includes("keyboard event")
        ? "Add keyboard event handlers (onKeyDown, onKeyUp) to custom interactive elements. Handle Enter and Space keys for buttons."
        : "Add tabindex='0' to elements with ARIA roles to make them keyboard focusable.",
    });
  }

  if (keyboardIssues.passCount > 0) {
    passes.push({
      passed: true,
      label: "Keyboard-accessible interactive elements",
      description: `${keyboardIssues.passCount} custom interactive element(s) are keyboard accessible.`,
    });
  }

  return { violations, passes };
}

// ── Contrast Check (WCAG 1.4.3) ──────────────────────────────────

async function checkContrast(page: Page, wcagLevel: string): Promise<{
  violations: A11yViolation[];
  passes: A11yCheckResult[];
}> {
  const violations: A11yViolation[] = [];
  const passes: A11yCheckResult[] = [];

  // Minimum contrast ratios
  const normalTextMin = wcagLevel === "AAA" ? 7 : 4.5;
  const largeTextMin = wcagLevel === "AAA" ? 4.5 : 3;

  const contrastIssues = await page.evaluate((normalMin: number, largeMin: number) => {
    const issues: Array<{ selector: string; html: string; ratio: number; fgColor: string; bgColor: string; isLarge: boolean }> = [];
    let passCount = 0;

    // Get all visible text elements
    const textElements = Array.from(document.querySelectorAll("p, span, a, h1, h2, h3, h4, h5, h6, li, td, th, label, button, div"));

    for (const el of textElements) {
      // Skip empty elements
      if (!el.textContent?.trim()) continue;
      // Skip elements with only whitespace children
      if (el.children.length === 0 && !el.textContent.trim()) continue;

      const style = window.getComputedStyle(el);
      const fgColor = style.color;
      const bgColor = style.backgroundColor;

      // Parse colors
      const fg = parseColor(fgColor);
      const bg = parseColor(bgColor);

      if (!fg || !bg) continue;

      // Calculate relative luminance
      const fgLum = relativeLuminance(fg.r, fg.g, fg.b);
      const bgLum = relativeLuminance(bg.r, bg.g, bg.b);

      // Calculate contrast ratio
      const lighter = Math.max(fgLum, bgLum);
      const darker = Math.min(fgLum, bgLum);
      const ratio = (lighter + 0.05) / (darker + 0.05);

      // Check font size for large text
      const fontSize = parseFloat(style.fontSize);
      const fontWeight = style.fontWeight;
      const isLarge = fontSize >= 18 || (fontSize >= 14 && parseInt(fontWeight) >= 700);
      const minRatio = isLarge ? largeMin : normalMin;

      if (ratio < minRatio) {
        const sel = el.id ? `#${el.id}` : el.className ? `.${el.className.toString().split(" ")[0]}` : el.tagName.toLowerCase();
        issues.push({
          selector: sel,
          html: el.outerHTML.substring(0, 200),
          ratio: Math.round(ratio * 100) / 100,
          fgColor,
          bgColor,
          isLarge,
        });
      } else {
        passCount++;
      }
    }

    function parseColor(colorStr: string): { r: number; g: number; b: number } | null {
      const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
    }

    function relativeLuminance(r: number, g: number, b: number): number {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    return { issues, passCount };
  }, normalTextMin, largeTextMin);

  for (const issue of contrastIssues.issues) {
    violations.push({
      severity: issue.ratio < 3 ? "critical" : "serious",
      wcagCriterion: "1.4.3",
      category: "contrast",
      title: `Insufficient color contrast ratio: ${issue.ratio}:1`,
      description: `Text element has a contrast ratio of ${issue.ratio}:1, which is below the minimum of ${issue.isLarge ? largeTextMin : normalTextMin}:1 for ${issue.isLarge ? "large" : "normal"} text (WCAG Level ${wcagLevel}).`,
      selector: issue.selector,
      elementHtml: issue.html,
      recommendation: `Increase the contrast ratio to at least ${issue.isLarge ? largeTextMin : normalTextMin}:1 by adjusting the text or background color. Current: ${issue.fgColor} on ${issue.bgColor}.`,
    });
  }

  if (contrastIssues.passCount > 0) {
    passes.push({
      passed: true,
      label: "Color contrast",
      description: `${contrastIssues.passCount} text element(s) meet the minimum contrast ratio.`,
    });
  }

  return { violations, passes };
}

// ── Focus Indicators Check (WCAG 2.4.7) ──────────────────────────

async function checkFocus(page: Page): Promise<{
  violations: A11yViolation[];
  passes: A11yCheckResult[];
}> {
  const violations: A11yViolation[] = [];
  const passes: A11yCheckResult[] = [];

  const focusIssues = await page.evaluate(() => {
    const issues: Array<{ selector: string; html: string }> = [];

    // Check for outline: none on potentially focusable elements
    const focusableSelectors = "a, button, input, select, textarea, [tabindex]";
    const focusableElements = Array.from(document.querySelectorAll(focusableSelectors));

    for (const el of focusableElements) {
      const style = window.getComputedStyle(el);
      const outlineStyle = style.outlineStyle;
      const outlineWidth = style.outlineWidth;
      const boxShadow = style.boxShadow;

      // Check if outline is explicitly removed
      if (outlineStyle === "none" && (!boxShadow || boxShadow === "none")) {
        const sel = el.id ? `#${el.id}` : el.tagName.toLowerCase();
        issues.push({
          selector: sel,
          html: el.outerHTML.substring(0, 200),
        });
      }
    }

    // Check for global outline: none rule
    const styleSheets = Array.from(document.styleSheets);
    let globalOutlineNone = false;
    try {
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (rule.cssText && rule.cssText.includes("outline") && rule.cssText.includes("none")) {
              // Check if it's a :focus rule
              if (rule.cssText.includes(":focus")) {
                globalOutlineNone = true;
              }
            }
          }
        } catch {
          // Cross-origin stylesheet, skip
        }
      }
    } catch {
      // Ignore
    }

    return { issues, globalOutlineNone };
  });

  if (focusIssues.globalOutlineNone) {
    violations.push({
      severity: "serious",
      wcagCriterion: "2.4.7",
      category: "focus",
      title: "Global focus outline removal detected",
      description: "CSS rules remove focus outlines globally. This makes it impossible for keyboard users to see which element has focus.",
      selector: ":focus",
      elementHtml: "",
      recommendation: "Do not remove focus outlines. If you must customize them, provide a visible alternative (e.g., box-shadow, custom outline).",
    });
  }

  for (const issue of focusIssues.issues.slice(0, 20)) {
    violations.push({
      severity: "moderate",
      wcagCriterion: "2.4.7",
      category: "focus",
      title: "Focusable element without visible focus indicator",
      description: "This element removes the default focus outline without providing an alternative visible focus indicator.",
      selector: issue.selector,
      elementHtml: issue.html,
      recommendation: "Provide a visible focus indicator using outline, box-shadow, or a custom focus ring.",
    });
  }

  if (focusIssues.issues.length === 0 && !focusIssues.globalOutlineNone) {
    passes.push({
      passed: true,
      label: "Focus indicators",
      description: "Focusable elements have visible focus indicators.",
    });
  }

  return { violations, passes };
}

// ── Landmark Regions Check (WCAG 1.3.1) ──────────────────────────

async function checkLandmarks(page: Page): Promise<{
  violations: A11yViolation[];
  passes: A11yCheckResult[];
}> {
  const violations: A11yViolation[] = [];
  const passes: A11yCheckResult[] = [];

  const landmarkIssues = await page.evaluate(() => {
    const landmarks: Record<string, number> = {
      banner: document.querySelectorAll('[role="banner"], header').length,
      navigation: document.querySelectorAll('[role="navigation"], nav').length,
      main: document.querySelectorAll('[role="main"], main').length,
      contentinfo: document.querySelectorAll('[role="contentinfo"], footer').length,
    };

    const missing: string[] = [];
    const present: string[] = [];

    if (landmarks.main === 0) missing.push("main");
    else present.push("main");

    if (landmarks.banner === 0) missing.push("banner");
    else present.push("banner");

    if (landmarks.navigation === 0) missing.push("navigation");
    else present.push("navigation");

    if (landmarks.contentinfo === 0) missing.push("contentinfo");
    else present.push("contentinfo");

    // Check for multiple main landmarks
    const multipleMain = landmarks.main > 1;

    return { missing, present, landmarks, multipleMain };
  });

  if (landmarkIssues.missing.includes("main")) {
    violations.push({
      severity: "critical",
      wcagCriterion: "1.3.1",
      category: "landmarks",
      title: "Missing main landmark",
      description: "The page does not have a main landmark region (<main> or role='main'). Screen reader users rely on landmarks to navigate page sections.",
      selector: "body",
      elementHtml: "",
      recommendation: "Add a <main> element or role='main' to wrap the primary content of the page.",
    });
  }

  if (landmarkIssues.multipleMain) {
    violations.push({
      severity: "serious",
      wcagCriterion: "1.3.1",
      category: "landmarks",
      title: "Multiple main landmarks",
      description: "The page has more than one main landmark region. There should be exactly one main landmark per page.",
      selector: "[role='main'], main",
      elementHtml: "",
      recommendation: "Ensure only one main landmark exists on the page. Remove duplicate <main> elements or role='main'.",
    });
  }

  if (landmarkIssues.missing.includes("navigation") && landmarkIssues.present.length > 0) {
    violations.push({
      severity: "moderate",
      wcagCriterion: "1.3.1",
      category: "landmarks",
      title: "Missing navigation landmark",
      description: "The page does not have a navigation landmark (<nav> or role='navigation'). This helps screen reader users skip to navigation.",
      selector: "body",
      elementHtml: "",
      recommendation: "Add a <nav> element around navigation links.",
    });
  }

  if (landmarkIssues.present.length > 0 && violations.length === 0) {
    passes.push({
      passed: true,
      label: "Landmark regions",
      description: `Page has proper landmark regions: ${landmarkIssues.present.join(", ")}.`,
    });
  }

  return { violations, passes };
}

// ── LLM-Based Analysis ────────────────────────────────────────────

async function callLLMForA11yAnalysis(
  url: string,
  existingViolations: A11yViolation[]
): Promise<A11yViolation[]> {
  const prompt = buildA11yPrompt(url, existingViolations);

  // Strategy 1: Try z-ai-web-dev-sdk
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert web accessibility analyst specializing in WCAG compliance. Analyze accessibility audit findings and provide additional insights. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
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
    return parseA11yResponse(content);
  } catch (sdkError) {
    console.warn("[A11y-Auditor] z-ai-web-dev-sdk failed:", sdkError);
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
                "You are an expert web accessibility analyst specializing in WCAG compliance. Analyze accessibility audit findings and provide additional insights. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
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
        return parseA11yResponse(content);
      }
    } catch (fetchError) {
      console.warn("[A11y-Auditor] External API failed:", fetchError);
    }
  }

  // Strategy 3: Rule-based fallback — no additional findings
  return [];
}

function buildA11yPrompt(url: string, violations: A11yViolation[]): string {
  const violationsSummary = violations
    .map((v) => `- [${v.severity}] WCAG ${v.wcagCriterion} (${v.category}): ${v.title}`)
    .join("\n");

  return `Analyze the following accessibility audit results for ${url}:

Existing violations:
${violationsSummary || "No violations found yet."}

Return a JSON object with any additional accessibility concerns or insights:
{
  "violations": [
    {
      "severity": "critical|serious|moderate|minor",
      "wcagCriterion": "X.X.X",
      "category": "contrast|aria|keyboard|images|forms|headings|focus|landmarks",
      "title": "Short title",
      "description": "Detailed description",
      "selector": "CSS selector",
      "elementHtml": "HTML snippet",
      "recommendation": "How to fix"
    }
  ]
}

Rules:
- Only add violations that are genuinely new and not covered by existing findings
- Focus on the most impactful accessibility issues
- Provide actionable recommendations with specific code examples
- Reference the correct WCAG criterion numbers
- Return ONLY the JSON, no markdown or explanation`;
}

function parseA11yResponse(content: string): A11yViolation[] {
  try {
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const violations = parsed.violations ?? [];

    return violations.map((v: any) => ({
      severity: isValidA11ySeverity(v.severity) ? v.severity : "minor",
      wcagCriterion: String(v.wcagCriterion ?? "1.3.1"),
      category: isValidA11yCategory(v.category) ? v.category : "aria",
      title: String(v.title ?? "Untitled violation"),
      description: String(v.description ?? ""),
      selector: String(v.selector ?? "body"),
      elementHtml: String(v.elementHtml ?? ""),
      recommendation: String(v.recommendation ?? ""),
    }));
  } catch (parseError) {
    console.warn("[A11y-Auditor] Failed to parse LLM response:", parseError);
    return [];
  }
}

function isValidA11ySeverity(s: string): s is A11yViolation["severity"] {
  return ["critical", "serious", "moderate", "minor"].includes(s);
}

function isValidA11yCategory(c: string): boolean {
  return ["contrast", "aria", "keyboard", "images", "forms", "headings", "focus", "landmarks"].includes(c);
}

// ── Recommendation Generator ──────────────────────────────────────

function generateA11yRecommendations(violations: A11yViolation[]): string[] {
  const recommendations: string[] = [];

  const criticalCount = violations.filter((v) => v.severity === "critical").length;
  const seriousCount = violations.filter((v) => v.severity === "serious").length;

  if (criticalCount > 0) {
    recommendations.push(
      `Fix ${criticalCount} critical accessibility issue(s). These prevent users with disabilities from using the page.`
    );
  }

  if (seriousCount > 0) {
    recommendations.push(
      `Address ${seriousCount} serious issue(s). These create significant barriers for users with disabilities.`
    );
  }

  const categories = [...new Set(violations.map((v) => v.category))];
  for (const category of categories) {
    const categoryViolations = violations.filter((v) => v.category === category);
    switch (category) {
      case "images":
        recommendations.push(
          `Add alt text to ${categoryViolations.length} image(s). Alt text should describe the image's purpose, not just its appearance.`
        );
        break;
      case "forms":
        recommendations.push(
          `Add labels to ${categoryViolations.length} form input(s). Use <label> elements or aria-label attributes.`
        );
        break;
      case "headings":
        recommendations.push(
          `Fix heading hierarchy for ${categoryViolations.length} issue(s). Use sequential heading levels (h1→h2→h3).`
        );
        break;
      case "aria":
        recommendations.push(
          `Add accessible names to ${categoryViolations.length} interactive element(s). Use aria-label or visible text.`
        );
        break;
      case "keyboard":
        recommendations.push(
          `Fix keyboard accessibility for ${categoryViolations.length} element(s). Ensure all interactive elements are focusable and operable via keyboard.`
        );
        break;
      case "contrast":
        recommendations.push(
          `Fix color contrast for ${categoryViolations.length} element(s). Minimum ratio: 4.5:1 for normal text, 3:1 for large text.`
        );
        break;
      case "focus":
        recommendations.push(
          `Add focus indicators to ${categoryViolations.length} element(s). Never remove focus outlines without providing alternatives.`
        );
        break;
      case "landmarks":
        recommendations.push(
          `Add landmark regions for ${categoryViolations.length} issue(s). Use <main>, <nav>, <header>, <footer> elements.`
        );
        break;
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("No accessibility violations detected. Continue testing with real assistive technologies for thorough validation.");
  }

  return recommendations;
}
