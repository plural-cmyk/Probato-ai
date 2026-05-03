/**
 * Probato Auto-Heal Engine
 *
 * When a test fails because a selector no longer matches (e.g., a button's
 * class changed, a data-testid was renamed), the auto-heal engine:
 *
 * 1. Detects selector-based failures in test results
 * 2. Visits the target URL with the browser
 * 3. Searches for alternative selectors that match the same element
 * 4. Ranks candidates by similarity (same text, same role, same position)
 * 5. Re-runs the failed test step with the healed selector
 * 6. If successful, updates the test case's selector in the database
 *
 * This is the core value proposition of Probato — tests that maintain themselves.
 */

import { Page, ElementHandle } from "puppeteer-core";
import { getBrowserInstance, cleanupBrowser, DEFAULT_ACTION_TIMEOUT } from "@/lib/browser/chromium";
import { db } from "@/lib/db";
import type { Selector, TestAction, StepResult } from "./actions";

// ── Types ──────────────────────────────────────────────────────────

export interface HealCandidate {
  selector: Selector;
  confidence: number;      // 0–1, higher = more likely correct
  strategy: string;        // How this candidate was found
  matchedText?: string;    // Text content of the matched element
  matchedTag?: string;     // Tag name of the matched element
}

export interface HealResult {
  originalSelector: Selector;
  healedSelector: Selector | null;
  confidence: number;
  candidates: HealCandidate[];
  healed: boolean;
  retestPassed: boolean;
  url: string;
  error?: string;
}

export interface AutoHealReport {
  featureId: string;
  featureName: string;
  testRunId: string;
  healResults: HealResult[];
  totalHealed: number;
  totalFailed: number;
  duration: number;
}

// ── Main Entry Point ──────────────────────────────────────────────

/**
 * Attempt to auto-heal failed test steps by finding alternative selectors.
 */
export async function autoHealTestRun(
  testRunId: string,
  targetUrl: string,
  failedSteps: StepResult[]
): Promise<AutoHealReport> {
  const startTime = Date.now();
  const healResults: HealResult[] = [];
  let totalHealed = 0;
  let totalFailed = 0;

  // Only attempt to heal steps that have a selector-based failure
  const healableSteps = failedSteps.filter(
    (step) =>
      step.status === "failed" &&
      step.action &&
      "selector" in step.action &&
      step.error &&
      isSelectorError(step.error)
  );

  if (healableSteps.length === 0) {
    return {
      featureId: "",
      featureName: "",
      testRunId,
      healResults: [],
      totalHealed: 0,
      totalFailed: 0,
      duration: Date.now() - startTime,
      error: "No selector-based failures to heal",
    };
  }

  let managed: Awaited<ReturnType<typeof getBrowserInstance>> | null = null;

  try {
    managed = await getBrowserInstance();
    const page = await managed.browser.newPage();

    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    page.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT);
    page.setDefaultNavigationTimeout(DEFAULT_ACTION_TIMEOUT);

    // Navigate to the target URL
    console.log(`[Auto-Heal] Navigating to ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_ACTION_TIMEOUT });
    await new Promise((r) => setTimeout(r, 1500));

    // Process each healable step
    for (const step of healableSteps) {
      const action = step.action as TestAction & { selector: Selector };
      const originalSelector = action.selector;

      console.log(`[Auto-Heal] Trying to heal selector: ${originalSelector.strategy}:"${originalSelector.value}"`);

      // Find alternative selectors
      const candidates = await findAlternativeSelectors(page, originalSelector, step.error ?? "");

      if (candidates.length === 0) {
        healResults.push({
          originalSelector,
          healedSelector: null,
          confidence: 0,
          candidates: [],
          healed: false,
          retestPassed: false,
          url: targetUrl,
          error: "No alternative selectors found",
        });
        totalFailed++;
        continue;
      }

      // Try each candidate until one works
      let healed = false;
      for (const candidate of candidates) {
        console.log(`[Auto-Heal] Trying candidate: ${candidate.selector.strategy}:"${candidate.selector.value}" (confidence: ${candidate.confidence.toFixed(2)})`);

        // Test the candidate by performing the same action
        const retestResult = await retestWithSelector(page, action, candidate.selector);

        if (retestResult) {
          healResults.push({
            originalSelector,
            healedSelector: candidate.selector,
            confidence: candidate.confidence,
            candidates,
            healed: true,
            retestPassed: true,
            url: targetUrl,
          });
          totalHealed++;
          healed = true;

          // Update the test case in the database
          await updateHealedSelector(action, candidate.selector);
          break;
        }
      }

      if (!healed) {
        healResults.push({
          originalSelector,
          healedSelector: candidates[0]?.selector ?? null,
          confidence: candidates[0]?.confidence ?? 0,
          candidates,
          healed: false,
          retestPassed: false,
          url: targetUrl,
          error: "All candidates failed retest",
        });
        totalFailed++;
      }
    }

    await page.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Auto-Heal] Failed: ${message}`);
    return {
      featureId: "",
      featureName: "",
      testRunId,
      healResults,
      totalHealed,
      totalFailed,
      duration: Date.now() - startTime,
      error: message,
    };
  } finally {
    if (managed) {
      await cleanupBrowser(managed);
    }
  }

  return {
    featureId: "",
    featureName: "",
    testRunId,
    healResults,
    totalHealed,
    totalFailed,
    duration: Date.now() - startTime,
  };
}

// ── Alternative Selector Discovery ────────────────────────────────

/**
 * Find alternative selectors for an element that failed to match.
 * Uses multiple strategies to discover candidates.
 */
async function findAlternativeSelectors(
  page: Page,
  originalSelector: Selector,
  errorMessage: string
): Promise<HealCandidate[]> {
  const candidates: HealCandidate[] = [];

  // Extract what we know about the original selector's intent
  const originalValue = originalSelector.value;
  const originalStrategy = originalSelector.strategy;

  // Strategy 1: Extract text from the error message and search by text
  const textFromError = extractTextFromError(errorMessage);
  if (textFromError) {
    const textCandidates = await findByText(page, textFromError);
    candidates.push(...textCandidates);
  }

  // Strategy 2: If original was CSS, try text-based or role-based
  if (originalStrategy === "css") {
    // Try finding by the CSS value as text content
    const textCandidates = await findByText(page, originalValue);
    candidates.push(...textCandidates);

    // Try common attribute patterns
    const attrCandidates = await findByAttributePatterns(page, originalValue);
    candidates.push(...attrCandidates);
  }

  // Strategy 3: If original was text, try CSS or role
  if (originalStrategy === "text") {
    const cssCandidates = await findByTextContent(page, originalValue);
    candidates.push(...cssCandidates);
  }

  // Strategy 4: If original was testId, try nearby elements with different testIds
  if (originalStrategy === "testId") {
    const nearbyCandidates = await findNearbyTestIds(page, originalValue);
    candidates.push(...nearbyCandidates);
  }

  // Strategy 5: If original was role, try finding by ARIA attributes
  if (originalStrategy === "role") {
    const roleCandidates = await findByAriaRole(page, originalValue);
    candidates.push(...roleCandidates);
  }

  // Strategy 6: If original was placeholder, try finding by label or name
  if (originalStrategy === "placeholder" || originalStrategy === "label") {
    const labelCandidates = await findByLabelOrPlaceholder(page, originalValue);
    candidates.push(...labelCandidates);
  }

  // Sort by confidence (highest first)
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Deduplicate by selector value
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.selector.strategy}:${c.selector.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Find elements by their visible text content.
 */
async function findByText(page: Page, text: string): Promise<HealCandidate[]> {
  return page.evaluate((searchText: string) => {
    const results: Array<{
      strategy: string;
      value: string;
      confidence: number;
      text: string;
      tag: string;
    }> = [];

    // Search all visible elements with matching text
    const allElements = document.querySelectorAll("button, a, input, select, textarea, [role], [data-testid], label");
    for (const el of allElements) {
      const elText = el.textContent?.trim() ?? "";
      if (!elText) continue;

      const similarity = textSimilarity(searchText.toLowerCase(), elText.toLowerCase());
      if (similarity < 0.4) continue;

      // Build selectors for this element
      const tag = el.tagName.toLowerCase();
      const text = elText.substring(0, 50);

      // data-testid
      const testId = el.getAttribute("data-testid");
      if (testId) {
        results.push({
          strategy: "testId",
          value: testId,
          confidence: similarity * 0.95,
          text,
          tag,
        });
      }

      // id-based
      if (el.id) {
        results.push({
          strategy: "css",
          value: `#${el.id}`,
          confidence: similarity * 0.85,
          text,
          tag,
        });
      }

      // text-based
      if (elText.length < 50) {
        results.push({
          strategy: "text",
          value: elText,
          confidence: similarity * 0.8,
          text,
          tag,
        });
      }

      // role-based
      const role = el.getAttribute("role") ?? implicitRole(tag);
      if (role) {
        const name = el.getAttribute("aria-label") ?? el.getAttribute("name") ?? "";
        results.push({
          strategy: "role",
          value: name ? `${role}[name='${name}']` : role,
          confidence: similarity * 0.75,
          text,
          tag,
        });
      }
    }

    return results;

    function implicitRole(tag: string): string {
      const roleMap: Record<string, string> = {
        button: "button",
        a: "link",
        input: "textbox",
        select: "combobox",
        textarea: "textbox",
        nav: "navigation",
        form: "form",
        header: "banner",
        footer: "contentinfo",
        main: "main",
      };
      return roleMap[tag] ?? "";
    }

    function textSimilarity(a: string, b: string): number {
      if (a === b) return 1;
      if (a.includes(b) || b.includes(a)) return 0.85;
      // Simple word overlap
      const wordsA = new Set(a.split(/\s+/));
      const wordsB = new Set(b.split(/\s+/));
      const intersection = [...wordsA].filter((w) => wordsB.has(w));
      const union = new Set([...wordsA, ...wordsB]);
      return union.size > 0 ? intersection.length / union.size : 0;
    }
  }, text).then((results) =>
    results.map((r) => ({
      selector: { strategy: r.strategy as Selector["strategy"], value: r.value },
      confidence: r.confidence,
      strategy: r.strategy,
      matchedText: r.text,
      matchedTag: r.tag,
    }))
  );
}

/**
 * Find elements by CSS attribute patterns (partial match on class, id, name).
 */
async function findByAttributePatterns(page: Page, cssSelector: string): Promise<HealCandidate[]> {
  return page.evaluate((selector: string) => {
    const results: Array<{
      strategy: string;
      value: string;
      confidence: number;
      text: string;
      tag: string;
    }> = [];

    // Parse the original selector to extract attribute info
    const idMatch = selector.match(/#([\w-]+)/);
    const classMatch = selector.match(/\.([\w-]+)/);
    const attrMatch = selector.match(/\[([\w-]+)(?:=["']([^"']+)["'])?\]/);
    const tagMatch = selector.match(/^(\w+)/);

    // Search by partial ID
    if (idMatch) {
      const partialId = idMatch[1];
      document.querySelectorAll(`[id*="${partialId}"]`).forEach((el) => {
        results.push({
          strategy: "css",
          value: `#${el.id}`,
          confidence: 0.7,
          text: el.textContent?.trim().substring(0, 50) ?? "",
          tag: el.tagName.toLowerCase(),
        });
      });
    }

    // Search by partial class
    if (classMatch) {
      const partialClass = classMatch[1];
      document.querySelectorAll(`[class*="${partialClass}"]`).forEach((el) => {
        results.push({
          strategy: "css",
          value: `.${el.className.toString().split(/\s+/)[0]}`,
          confidence: 0.6,
          text: el.textContent?.trim().substring(0, 50) ?? "",
          tag: el.tagName.toLowerCase(),
        });
      });
    }

    // Search by attribute name
    if (attrMatch) {
      const attrName = attrMatch[1];
      document.querySelectorAll(`[${attrName}]`).forEach((el) => {
        const attrValue = el.getAttribute(attrName);
        results.push({
          strategy: "css",
          value: attrValue ? `[${attrName}="${attrValue}"]` : `[${attrName}]`,
          confidence: 0.65,
          text: el.textContent?.trim().substring(0, 50) ?? "",
          tag: el.tagName.toLowerCase(),
        });
      });
    }

    // Search by tag + nearby test
    if (tagMatch) {
      const tag = tagMatch[1];
      document.querySelectorAll(tag).forEach((el) => {
        const testId = el.getAttribute("data-testid");
        if (testId) {
          results.push({
            strategy: "testId",
            value: testId,
            confidence: 0.5,
            text: el.textContent?.trim().substring(0, 50) ?? "",
            tag: el.tagName.toLowerCase(),
          });
        }
      });
    }

    return results;
  }, cssSelector).then((results) =>
    results.map((r) => ({
      selector: { strategy: r.strategy as Selector["strategy"], value: r.value },
      confidence: r.confidence,
      strategy: "attribute-pattern",
      matchedText: r.text,
      matchedTag: r.tag,
    }))
  );
}

async function findByTextContent(page: Page, text: string): Promise<HealCandidate[]> {
  // Use XPath to find elements containing the text
  try {
    const xpath = `//*[contains(text(), '${text.replace(/'/g, "\\'")}')]`;
    const elements = await page.$x(xpath);
    const candidates: HealCandidate[] = [];

    for (let i = 0; i < Math.min(elements.length, 5); i++) {
      const el = elements[i] as ElementHandle<Element>;
      const tag = await el.evaluate((e) => e.tagName.toLowerCase());
      const elText = await el.evaluate((e) => e.textContent?.trim().substring(0, 50) ?? "");
      const testId = await el.evaluate((e) => e.getAttribute("data-testid"));
      const id = await el.evaluate((e) => e.id);

      if (testId) {
        candidates.push({
          selector: { strategy: "testId", value: testId },
          confidence: 0.8,
          strategy: "text-content-to-testid",
          matchedText: elText,
          matchedTag: tag,
        });
      }
      if (id) {
        candidates.push({
          selector: { strategy: "css", value: `#${id}` },
          confidence: 0.7,
          strategy: "text-content-to-id",
          matchedText: elText,
          matchedTag: tag,
        });
      }
    }

    return candidates;
  } catch {
    return [];
  }
}

async function findNearbyTestIds(page: Page, testId: string): Promise<HealCandidate[]> {
  return page.evaluate((tid: string) => {
    const results: HealCandidate[] = [];

    // Find the original element (if it partially matches)
    document.querySelectorAll(`[data-testid*="${tid.split("-")[0]}"]`).forEach((el) => {
      const newTestId = el.getAttribute("data-testid");
      if (newTestId && newTestId !== tid) {
        results.push({
          selector: { strategy: "testId", value: newTestId },
          confidence: 0.6,
          strategy: "nearby-testid",
          matchedText: el.textContent?.trim().substring(0, 50),
          matchedTag: el.tagName.toLowerCase(),
        });
      }
    });

    // Find sibling elements with testIds
    const original = document.querySelector(`[data-testid="${tid}"]`);
    if (original?.parentElement) {
      original.parentElement.querySelectorAll("[data-testid]").forEach((el) => {
        const siblingTestId = el.getAttribute("data-testid");
        if (siblingTestId && siblingTestId !== tid) {
          results.push({
            selector: { strategy: "testId", value: siblingTestId },
            confidence: 0.5,
            strategy: "sibling-testid",
            matchedText: el.textContent?.trim().substring(0, 50),
            matchedTag: el.tagName.toLowerCase(),
          });
        }
      });
    }

    return results;
  }, testId).then((results) => results.map((r) => ({
    ...r,
    selector: { strategy: r.selector.strategy as Selector["strategy"], value: r.selector.value },
  })));
}

async function findByAriaRole(page: Page, roleValue: string): Promise<HealCandidate[]> {
  const roleMatch = roleValue.match(/^(\w+)(?:\[name=['"]([^'"]+)['"]\])?$/);
  if (!roleMatch) return [];

  const [, role, name] = roleMatch;

  return page.evaluate(({ searchRole, searchName }: { searchRole: string; searchName?: string }) => {
    const results: HealCandidate[] = [];

    document.querySelectorAll(`[role="${searchRole}"], ${implicitTagForRole(searchRole)}`).forEach((el) => {
      const ariaLabel = el.getAttribute("aria-label");
      const elName = el.getAttribute("name");
      const text = el.textContent?.trim().substring(0, 50) ?? "";
      const tag = el.tagName.toLowerCase();

      // If name was specified, check for match
      if (searchName) {
        const nameMatch =
          ariaLabel?.toLowerCase().includes(searchName.toLowerCase()) ||
          elName?.toLowerCase().includes(searchName.toLowerCase()) ||
          text.toLowerCase().includes(searchName.toLowerCase());

        if (!nameMatch) return;
      }

      const testId = el.getAttribute("data-testid");
      if (testId) {
        results.push({
          selector: { strategy: "testId" as const, value: testId },
          confidence: 0.75,
          strategy: "aria-to-testid",
          matchedText: text,
          matchedTag: tag,
        });
      }

      if (el.id) {
        results.push({
          selector: { strategy: "css" as const, value: `#${el.id}` },
          confidence: 0.65,
          strategy: "aria-to-id",
          matchedText: text,
          matchedTag: tag,
        });
      }

      if (text) {
        results.push({
          selector: { strategy: "text" as const, value: text },
          confidence: 0.6,
          strategy: "aria-to-text",
          matchedText: text,
          matchedTag: tag,
        });
      }
    });

    return results;

    function implicitTagForRole(role: string): string {
      const map: Record<string, string> = {
        button: "button",
        link: "a",
        textbox: "input, textarea",
        navigation: "nav",
        form: "form",
      };
      return map[role] ?? "";
    }
  }, { searchRole: role, searchName: name }).then((results) =>
    results.map((r) => ({
      ...r,
      selector: { strategy: r.selector.strategy as Selector["strategy"], value: r.selector.value },
    }))
  );
}

async function findByLabelOrPlaceholder(page: Page, value: string): Promise<HealCandidate[]> {
  return page.evaluate((searchValue: string) => {
    const results: HealCandidate[] = [];

    // Search by aria-label
    document.querySelectorAll(`[aria-label*="${searchValue}"]`).forEach((el) => {
      const ariaLabel = el.getAttribute("aria-label") ?? "";
      const testId = el.getAttribute("data-testid");
      if (testId) {
        results.push({
          selector: { strategy: "testId" as const, value: testId },
          confidence: 0.8,
          strategy: "label-to-testid",
          matchedText: ariaLabel,
          matchedTag: el.tagName.toLowerCase(),
        });
      }
    });

    // Search by name attribute
    document.querySelectorAll(`[name*="${searchValue}"]`).forEach((el) => {
      const name = el.getAttribute("name") ?? "";
      results.push({
        selector: { strategy: "css" as const, value: `[name="${name}"]` },
        confidence: 0.65,
        strategy: "label-to-name",
        matchedText: name,
        matchedTag: el.tagName.toLowerCase(),
      });
    });

    // Search labels containing the text
    document.querySelectorAll("label").forEach((label) => {
      if (label.textContent?.toLowerCase().includes(searchValue.toLowerCase())) {
        const forId = label.getAttribute("for");
        if (forId) {
          results.push({
            selector: { strategy: "css" as const, value: `#${forId}` },
            confidence: 0.7,
            strategy: "label-for",
            matchedText: label.textContent.trim().substring(0, 50),
            matchedTag: "input",
          });
        }
      }
    });

    return results;
  }, value).then((results) =>
    results.map((r) => ({
      ...r,
      selector: { strategy: r.selector.strategy as Selector["strategy"], value: r.selector.value },
    }))
  );
}

// ── Retest with Healed Selector ────────────────────────────────────

/**
 * Try performing the same action with a different selector.
 * Returns true if the action succeeds, false otherwise.
 */
async function retestWithSelector(
  page: Page,
  originalAction: TestAction & { selector: Selector },
  newSelector: Selector
): Promise<boolean> {
  try {
    const cssSelector = selectorToCssForHeal(newSelector);

    // Wait for the element
    await page.waitForSelector(cssSelector, { timeout: 3000 });

    // Try the action
    switch (originalAction.type) {
      case "click": {
        const el = await page.$(cssSelector);
        if (el) { await el.click(); return true; }
        break;
      }
      case "fill": {
        const fillAction = originalAction as Extract<typeof originalAction, { type: "fill" }>;
        const el = await page.$(cssSelector);
        if (el) { await el.click({ clickCount: 3 }); await el.press("Backspace"); await el.type(fillAction.value, { delay: 10 }); return true; }
        break;
      }
      case "assertVisible": {
        const el = await page.$(cssSelector);
        if (el) { const visible = await el.isIntersectingViewport(); return visible; }
        break;
      }
      case "hover": {
        const el = await page.$(cssSelector);
        if (el) { await el.hover(); return true; }
        break;
      }
      default:
        // For other action types, just check the element exists
        const el = await page.$(cssSelector);
        return el !== null;
    }
  } catch {
    return false;
  }
  return false;
}

// ── Database Update ────────────────────────────────────────────────

/**
 * Update a test case's selector in the database after successful auto-heal.
 */
async function updateHealedSelector(
  action: TestAction & { selector: Selector },
  newSelector: Selector
): Promise<void> {
  try {
    // Find test cases that use the old selector
    const oldSelectorStr = JSON.stringify(action.selector);
    const testCases = await db.testCase.findMany({
      where: { selector: { contains: action.selector.value } },
      take: 10,
    });

    for (const testCase of testCases) {
      await db.testCase.update({
        where: { id: testCase.id },
        data: {
          selector: JSON.stringify(newSelector),
          autoHealed: true,
        },
      });
    }

    console.log(`[Auto-Heal] Updated ${testCases.length} test case(s) with healed selector`);
  } catch (error) {
    console.warn("[Auto-Heal] Failed to update test case selector:", error);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function isSelectorError(error: string): boolean {
  const selectorErrorPatterns = [
    "Element not found",
    "Waiting for selector",
    "failed to find element",
    "No element found",
    "Timed out waiting for selector",
    "Evaluation failed",
    "is not visible",
    "Waiting for element",
  ];
  return selectorErrorPatterns.some((pattern) =>
    error.toLowerCase().includes(pattern.toLowerCase())
  );
}

function extractTextFromError(error: string): string | null {
  // Try to extract quoted text from error messages like:
  // Element not found for click: text:"Sign In"
  // Form element not found for submit: css:"#login-form"
  const textMatch = error.match(/text:"([^"]+)"/);
  if (textMatch) return textMatch[1];

  const labelMatch = error.match(/label:"([^"]+)"/);
  if (labelMatch) return labelMatch[1];

  // Try extracting from selector descriptions
  const selectorMatch = error.match(/(?:css|text|testId|role|placeholder|label):"([^"]+)"/);
  if (selectorMatch) return selectorMatch[1];

  return null;
}

function selectorToCssForHeal(selector: Selector): string {
  switch (selector.strategy) {
    case "css":
      return selector.value;
    case "testId":
      return `[data-testid="${selector.value}"]`;
    case "placeholder":
      return `[placeholder="${selector.value}"]`;
    case "label":
      return `input[aria-label="${selector.value}"], input[id=label:has-text("${selector.value}") + input]`;
    case "role": {
      const roleMatch = selector.value.match(/^(\w+)(?:\[name=['"]([^'"]+)['"]\])?$/);
      if (roleMatch) {
        const [, role, name] = roleMatch;
        if (name) {
          return `[role="${role}"][aria-label="${name}"], [role="${role}"][name="${name}"]`;
        }
        return `[role="${role}"]`;
      }
      return `[role="${selector.value}"]`;
    }
    case "text":
      return `text="${selector.value}"`;
    default:
      return selector.value;
  }
}
