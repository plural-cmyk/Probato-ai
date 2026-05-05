/**
 * Probato Fix Suggestion Engine
 *
 * When a test fails, the fix suggester analyzes the failure context
 * (error message, page source, action that failed, screenshot) and
 * generates AI-powered fix suggestions with code diffs, reasoning,
 * and confidence scores.
 *
 * Fix types:
 * - selector_fix: Element selector has changed, needs updating
 * - assertion_fix: Text assertion failed, expected value needs updating
 * - code_fix: Test code logic needs modification (wait, navigation, etc.)
 * - config_fix: Test configuration needs adjustment (timeout, viewport, etc.)
 * - dependency_fix: Missing or changed dependencies (route change, API change)
 *
 * The engine uses the same 3-tier LLM strategy as provider.ts:
 * 1. z-ai-web-dev-sdk (primary)
 * 2. External OpenAI-compatible API (fallback)
 * 3. Rule-based fallback (no LLM needed)
 */

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { deductCredits, checkCredits } from "@/lib/billing/credits";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import type { TestAction, StepResult, Selector } from "./actions";

// ── Types ──────────────────────────────────────────────────────────

export type FixType =
  | "selector_fix"
  | "assertion_fix"
  | "code_fix"
  | "config_fix"
  | "dependency_fix";

export interface FixSuggestionInput {
  testResultId: string;
  testRunId: string;
  projectId: string;
  userId: string;
  stepIndex: number;
  error: string;
  action: TestAction;
  screenshot?: string;
  actualText?: string;
  actualUrl?: string;
  testCaseCode?: string;
  testCaseId?: string;
  pageUrl?: string;
}

export interface SuggestedFix {
  type: FixType;
  title: string;
  description: string;
  confidence: number; // 0-1
  diff?: string;
  originalCode?: string;
  suggestedCode?: string;
  reasoning: string;
  metadata?: Record<string, unknown>;
}

export interface FixSuggestionResult {
  suggestions: SuggestedFix[];
  duration: number;
  llmUsed: boolean;
  error?: string;
}

// ── Main Entry Point ──────────────────────────────────────────────

/**
 * Generate fix suggestions for a failed test step.
 * This is the primary function called from the API route.
 */
export async function generateFixSuggestions(
  input: FixSuggestionInput
): Promise<FixSuggestionResult> {
  const startTime = Date.now();

  try {
    // 1. Check credits
    const creditCheck = await checkCredits(input.userId, "fix_suggestion");
    if (!creditCheck.hasCredits) {
      return {
        suggestions: [],
        duration: Date.now() - startTime,
        llmUsed: false,
        error: "Insufficient credits to generate fix suggestions",
      };
    }

    // 2. Build context for the LLM
    const context = buildFixContext(input);

    // 3. Try LLM-based suggestion generation
    let suggestions: SuggestedFix[] = [];
    let llmUsed = false;

    try {
      const llmResult = await callLLMForFix(context);
      if (llmResult.length > 0) {
        suggestions = llmResult;
        llmUsed = true;
      }
    } catch (error) {
      console.warn("[Fix-Suggester] LLM failed, using rule-based fallback:", error);
    }

    // 4. If LLM didn't produce results, use rule-based fallback
    if (suggestions.length === 0) {
      suggestions = ruleBasedFixSuggestions(input);
    }

    // 5. Deduct credits (only if we produced suggestions)
    if (suggestions.length > 0) {
      try {
        await deductCredits(
          input.userId,
          "fix_suggestion",
          `Fix suggestion for: ${input.error.substring(0, 80)}`,
          input.testResultId,
          "test_result"
        );
      } catch (creditError) {
        console.warn("[Fix-Suggester] Credit deduction failed:", creditError);
      }
    }

    // 6. Persist suggestions to DB
    const persistedIds: string[] = [];
    for (const suggestion of suggestions) {
      try {
        const record = await db.fixSuggestion.create({
          data: {
            title: suggestion.title,
            description: suggestion.description,
            type: suggestion.type,
            status: "pending",
            confidence: suggestion.confidence,
            diff: suggestion.diff ?? null,
            originalCode: suggestion.originalCode ?? null,
            suggestedCode: suggestion.suggestedCode ?? null,
            reasoning: suggestion.reasoning ?? null,
            errorMessage: input.error,
            stepIndex: input.stepIndex,
            metadata: suggestion.metadata ?? undefined,
            testResultId: input.testResultId,
            testRunId: input.testRunId,
            projectId: input.projectId,
            testCaseId: input.testCaseId ?? null,
          },
        });
        persistedIds.push(record.id);
      } catch (dbError) {
        console.warn("[Fix-Suggester] Failed to persist suggestion:", dbError);
      }
    }

    // 7. Dispatch notification
    if (persistedIds.length > 0) {
      try {
        await dispatchNotification({
          type: "fix_suggestion",
          title: `Fix suggestion available: ${suggestions[0].title}`,
          message: `${suggestions.length} fix suggestion(s) generated for a failed test step. ${suggestions[0].description.substring(0, 100)}`,
          userId: input.userId,
          projectId: input.projectId,
          testRunId: input.testRunId,
          actionUrl: `/dashboard/projects/${input.projectId}`,
          priority: "normal",
          metadata: {
            suggestionCount: suggestions.length,
            fixTypes: suggestions.map((s) => s.type),
            topConfidence: Math.max(...suggestions.map((s) => s.confidence)),
          },
        });
      } catch (notifError) {
        console.warn("[Fix-Suggester] Notification dispatch failed:", notifError);
      }
    }

    return {
      suggestions,
      duration: Date.now() - startTime,
      llmUsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Fix-Suggester] Failed:", message);
    return {
      suggestions: [],
      duration: Date.now() - startTime,
      llmUsed: false,
      error: message,
    };
  }
}

// ── Context Builder ────────────────────────────────────────────────

interface FixContext {
  actionType: string;
  actionLabel: string;
  selector?: Selector;
  error: string;
  actualText?: string;
  actualUrl?: string;
  testCaseCode?: string;
  pageUrl?: string;
  fillValue?: string;
  expectedText?: string;
}

function buildFixContext(input: FixSuggestionInput): FixContext {
  const action = input.action;
  const context: FixContext = {
    actionType: action.type,
    actionLabel: action.label,
    error: input.error,
    actualText: input.actualText,
    actualUrl: input.actualUrl,
    testCaseCode: input.testCaseCode,
    pageUrl: input.pageUrl,
  };

  // Extract selector from action if present
  if ("selector" in action) {
    context.selector = (action as any).selector as Selector;
  }

  // Extract fill value
  if (action.type === "fill") {
    context.fillValue = (action as Extract<typeof action, { type: "fill" }>).value;
  }

  // Extract expected text from assertion
  if (action.type === "assertText") {
    context.expectedText = (action as Extract<typeof action, { type: "assertText" }>).expected;
  }

  return context;
}

// ── LLM-Based Fix Generation ──────────────────────────────────────

async function callLLMForFix(context: FixContext): Promise<SuggestedFix[]> {
  const prompt = buildFixPrompt(context);

  // Strategy 1: Try z-ai-web-dev-sdk
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert test automation engineer specializing in Playwright and browser testing. You analyze test failures and suggest precise code fixes. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 3000,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    return parseFixResponse(content);
  } catch (sdkError) {
    console.warn("[Fix-Suggester] z-ai-web-dev-sdk failed:", sdkError);
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
                "You are an expert test automation engineer specializing in Playwright and browser testing. You analyze test failures and suggest precise code fixes. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 3000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content ?? "";
        return parseFixResponse(content);
      }
    } catch (fetchError) {
      console.warn("[Fix-Suggester] External API failed:", fetchError);
    }
  }

  return [];
}

function buildFixPrompt(context: FixContext): string {
  const selectorInfo = context.selector
    ? `Selector: ${context.selector.strategy}:"${context.selector.value}"`
    : "No selector used";
  const actualTextInfo = context.actualText
    ? `Actual text on page: "${context.actualText}"`
    : "";
  const expectedTextInfo = context.expectedText
    ? `Expected text: "${context.expectedText}"`
    : "";
  const urlInfo = context.actualUrl
    ? `Current URL: ${context.actualUrl}`
    : "";
  const codeInfo = context.testCaseCode
    ? `Current test code:\n\`\`\`\n${context.testCaseCode.substring(0, 2000)}\n\`\`\``
    : "";

  return `A Playwright test failed. Analyze the failure and suggest fixes.

FAILED ACTION: ${context.actionType} — ${context.actionLabel}
${selectorInfo}
ERROR: ${context.error}
${actualTextInfo}
${expectedTextInfo}
${urlInfo}
${codeInfo}

Return a JSON object with this exact structure:
{
  "suggestions": [
    {
      "type": "selector_fix|assertion_fix|code_fix|config_fix|dependency_fix",
      "title": "Short title describing the fix",
      "description": "Detailed description of what to change and why",
      "confidence": 0.85,
      "diff": "unified diff of the code change (if applicable)",
      "originalCode": "the original code snippet that needs changing",
      "suggestedCode": "the replacement code",
      "reasoning": "Why this fix should work"
    }
  ]
}

Rules:
- Suggest 1-3 specific, actionable fixes ranked by confidence
- confidence: 0-1 (0.9+ = very confident, 0.7-0.9 = likely, 0.5-0.7 = possible, <0.5 = uncertain)
- For selector_fix: suggest alternative selectors (testId, css, role, text)
- For assertion_fix: suggest updated expected text based on actualText
- For code_fix: suggest adding waits, changing action order, adjusting logic
- For config_fix: suggest timeout changes, viewport adjustments
- For dependency_fix: suggest URL or route changes
- If generating a diff, use standard unified diff format
- Be specific — include actual code/selector values, not placeholders
- Return ONLY the JSON, no markdown or explanation`;
}

function parseFixResponse(content: string): SuggestedFix[] {
  try {
    // Try to find JSON in markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content;

    // Try to find raw JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const suggestions = parsed.suggestions ?? [];

    return suggestions.map((s: any) => ({
      type: (isValidFixType(s.type) ? s.type : "code_fix") as FixType,
      title: String(s.title ?? "Untitled fix"),
      description: String(s.description ?? ""),
      confidence: Math.min(1, Math.max(0, Number(s.confidence ?? 0.5))),
      diff: s.diff ? String(s.diff) : undefined,
      originalCode: s.originalCode ? String(s.originalCode) : undefined,
      suggestedCode: s.suggestedCode ? String(s.suggestedCode) : undefined,
      reasoning: String(s.reasoning ?? ""),
      metadata: s.metadata ?? undefined,
    }));
  } catch (parseError) {
    console.warn("[Fix-Suggester] Failed to parse LLM response:", parseError);
    return [];
  }
}

function isValidFixType(type: string): boolean {
  return ["selector_fix", "assertion_fix", "code_fix", "config_fix", "dependency_fix"].includes(type);
}

// ── Rule-Based Fix Suggestions (Fallback) ──────────────────────────

/**
 * Generate fix suggestions using rules and pattern matching.
 * No LLM needed — works entirely offline.
 */
function ruleBasedFixSuggestions(input: FixSuggestionInput): SuggestedFix[] {
  const suggestions: SuggestedFix[] = [];
  const action = input.action;
  const error = input.error.toLowerCase();

  // ── Selector-based failure ──
  if ("selector" in action && isSelectorError(error)) {
    const selector = (action as any).selector as Selector;

    // Suggest 1: Try alternative selector strategy
    if (selector.strategy === "css") {
      suggestions.push({
        type: "selector_fix",
        title: `Switch from CSS to testId selector`,
        description: `The CSS selector "${selector.value}" no longer matches any element. Consider using a data-testid attribute instead, which is more resilient to style changes.`,
        confidence: 0.7,
        reasoning: "CSS selectors break when class names change. data-testid attributes are intentionally stable and designed for testing.",
        originalCode: JSON.stringify({ strategy: "css", value: selector.value }),
        suggestedCode: `// Find the element's data-testid in the page source and use:\n{ strategy: "testId", value: "your-test-id" }`,
        metadata: { originalStrategy: selector.strategy, originalValue: selector.value },
      });
    }

    if (selector.strategy === "testId") {
      suggestions.push({
        type: "selector_fix",
        title: `Update testId selector value`,
        description: `The data-testid="${selector.value}" element was not found. The testId may have been renamed or the element removed from the page.`,
        confidence: 0.75,
        reasoning: "data-testid attributes can be renamed during refactoring. Check the page source for the current testId value.",
        originalCode: JSON.stringify({ strategy: "testId", value: selector.value }),
        suggestedCode: `// Check the page for the current data-testid value and update:\n{ strategy: "testId", value: "updated-test-id" }`,
        metadata: { originalStrategy: selector.strategy, originalValue: selector.value },
      });
    }

    if (selector.strategy === "text") {
      suggestions.push({
        type: "selector_fix",
        title: `Update text selector or switch strategy`,
        description: `No element found with text "${selector.value}". The text content may have changed, or the element structure has been modified.`,
        confidence: 0.65,
        reasoning: "Text selectors are fragile because visible text changes frequently. A testId or role-based selector would be more reliable.",
        originalCode: JSON.stringify({ strategy: "text", value: selector.value }),
        suggestedCode: `// Option 1: Update text to match current content\n{ strategy: "text", value: "updated text" }\n// Option 2: Use a more stable selector\n{ strategy: "testId", value: "element-test-id" }`,
        metadata: { originalStrategy: selector.strategy, originalValue: selector.value },
      });
    }

    // Suggest 2: Add a wait before the action
    suggestions.push({
      type: "config_fix",
      title: `Add wait before ${action.type} action`,
      description: `The element may not be present yet when the action executes. Adding a waitForSelector or increasing the timeout may resolve the issue.`,
      confidence: 0.5,
      reasoning: "SPAs and dynamic pages may load elements asynchronously. The action may be executing before the element is rendered.",
      suggestedCode: `// Add before the failing action:\n{ type: "waitForSelector", selector: ${JSON.stringify(selector)}, timeout: 10000, label: "Wait for element" }`,
      metadata: { actionType: action.type, selectorStrategy: selector.strategy },
    });
  }

  // ── Text assertion failure ──
  if (action.type === "assertText" && input.actualText) {
    const assertAction = action as Extract<typeof action, { type: "assertText" }>;
    suggestions.push({
      type: "assertion_fix",
      title: `Update expected text to match actual`,
      description: `The assertion expected "${assertAction.expected}" but the element contains "${input.actualText}". The text content has changed on the page.`,
      confidence: 0.8,
      reasoning: "Visible text changes are common in UI updates. If the new text is correct, update the assertion to match.",
      originalCode: `{ type: "assertText", selector: ${JSON.stringify(assertAction.selector)}, expected: "${assertAction.expected}" }`,
      suggestedCode: `{ type: "assertText", selector: ${JSON.stringify(assertAction.selector)}, expected: "${input.actualText.replace(/"/g, '\\"')}" }`,
      diff: `- expected: "${assertAction.expected}"\n+ expected: "${input.actualText}"`,
      metadata: { expectedText: assertAction.expected, actualText: input.actualText },
    });
  }

  // ── URL assertion failure ──
  if (action.type === "assertUrl" && input.actualUrl) {
    const urlAction = action as Extract<typeof action, { type: "assertUrl" }>;
    suggestions.push({
      type: "assertion_fix",
      title: `Update expected URL to match actual`,
      description: `The URL assertion expected "${urlAction.expected}" but the current URL is "${input.actualUrl}". The navigation may have changed.`,
      confidence: 0.75,
      reasoning: "URL changes often occur during route refactoring or when query parameters are added/removed.",
      originalCode: `{ type: "assertUrl", expected: "${urlAction.expected}" }`,
      suggestedCode: `{ type: "assertUrl", expected: "${input.actualUrl}" }`,
      diff: `- expected: "${urlAction.expected}"\n+ expected: "${input.actualUrl}"`,
      metadata: { expectedUrl: urlAction.expected, actualUrl: input.actualUrl },
    });
  }

  // ── Timeout / navigation failure ──
  if (error.includes("timeout") || error.includes("navigation")) {
    suggestions.push({
      type: "config_fix",
      title: `Increase timeout for ${action.type} action`,
      description: `The action timed out before completing. The page may be loading slowly or the element may take longer to appear. Increasing the timeout can help with flaky tests.`,
      confidence: 0.6,
      reasoning: "Network conditions and page complexity can cause variable load times. A longer timeout gives the page more time to stabilize.",
      suggestedCode: `// Increase timeout:\n// Change timeout from current value to 30000ms\n{ type: "${action.type}", ..., timeout: 30000 }`,
      metadata: { actionType: action.type, errorType: "timeout" },
    });

    suggestions.push({
      type: "code_fix",
      title: `Add waitForNavigation or waitForLoadState`,
      description: `The page may not be fully loaded when the next action executes. Adding a navigation wait or load state check can ensure the page is ready.`,
      confidence: 0.55,
      reasoning: "SPAs often need explicit wait conditions because content loads asynchronously after initial page render.",
      suggestedCode: `// Add after navigation:\n{ type: "waitForNavigation", timeout: 15000, label: "Wait for page to load" }`,
      metadata: { actionType: action.type, errorType: "navigation" },
    });
  }

  // ── Form submission / element interaction failure ──
  if (error.includes("not visible") || error.includes("not interactable")) {
    suggestions.push({
      type: "code_fix",
      title: `Scroll element into view before interaction`,
      description: `The element exists in the DOM but is not visible or interactable, possibly because it's outside the viewport or obscured by another element.`,
      confidence: 0.65,
      reasoning: "Elements that are below the fold or hidden behind modals/overlays need to be scrolled into view before interaction.",
      suggestedCode: `// Add before the failing action:\n{ type: "scroll", direction: "down", amount: 300, label: "Scroll to element" }\n// Or add a waitForSelector with state: "visible"`,
      metadata: { actionType: action.type, errorType: "not_visible" },
    });
  }

  // ── Generic fallback ──
  if (suggestions.length === 0) {
    suggestions.push({
      type: "code_fix",
      title: `Review and update the failing test step`,
      description: `The test step "${action.label}" failed with: "${input.error.substring(0, 150)}". Manual review may be needed to determine the root cause and appropriate fix.`,
      confidence: 0.3,
      reasoning: "The error pattern doesn't match any known fix categories. Manual investigation is recommended.",
      metadata: { actionType: action.type, error: input.error },
    });
  }

  return suggestions;
}

// ── Helper ──────────────────────────────────────────────────────────

function isSelectorError(error: string): boolean {
  const patterns = [
    "element not found",
    "waiting for selector",
    "failed to find element",
    "no element found",
    "timed out waiting for selector",
    "is not visible",
    "waiting for element",
  ];
  return patterns.some((p) => error.includes(p));
}

/**
 * Apply an approved fix suggestion to the test case.
 * Updates the test case code and marks the suggestion as applied.
 */
export async function applyFixSuggestion(
  suggestionId: string,
  userId: string,
  reviewNote?: string
): Promise<{ success: boolean; testCaseId?: string; error?: string }> {
  try {
    // 1. Fetch the suggestion
    const suggestion = await db.fixSuggestion.findUnique({
      where: { id: suggestionId },
      include: { testCase: true },
    });

    if (!suggestion) {
      return { success: false, error: "Fix suggestion not found" };
    }

    if (suggestion.status !== "pending" && suggestion.status !== "approved") {
      return { success: false, error: `Cannot apply suggestion with status: ${suggestion.status}` };
    }

    // 2. If there's a linked test case, update its code
    if (suggestion.testCase && suggestion.suggestedCode) {
      await db.testCase.update({
        where: { id: suggestion.testCase.id },
        data: {
          code: suggestion.suggestedCode,
          autoHealed: true,
        },
      });
    }

    // 3. If it's a selector fix with metadata, update the test case selector
    if (suggestion.type === "selector_fix" && suggestion.testCase && suggestion.metadata) {
      const metadata = suggestion.metadata as any;
      if (metadata.newSelector) {
        await db.testCase.update({
          where: { id: suggestion.testCase.id },
          data: {
            selector: JSON.stringify(metadata.newSelector),
            autoHealed: true,
          },
        });
      }
    }

    // 4. Update the suggestion status
    await db.fixSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: "applied",
        appliedAt: new Date(),
        appliedBy: userId,
        reviewNote: reviewNote ?? null,
      },
    });

    return { success: true, testCaseId: suggestion.testCase?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Fix-Suggester] Apply failed:", message);
    return { success: false, error: message };
  }
}

/**
 * Reject a fix suggestion.
 */
export async function rejectFixSuggestion(
  suggestionId: string,
  userId: string,
  reviewNote?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const suggestion = await db.fixSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      return { success: false, error: "Fix suggestion not found" };
    }

    if (suggestion.status !== "pending") {
      return { success: false, error: `Cannot reject suggestion with status: ${suggestion.status}` };
    }

    await db.fixSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: "rejected",
        appliedBy: userId,
        reviewNote: reviewNote ?? null,
      },
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
