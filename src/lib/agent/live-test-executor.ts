/**
 * Probato Live Test Executor
 *
 * Wraps the existing test executor with real-time event streaming.
 * Uses AsyncGenerator pattern to yield step-by-step events as they happen,
 * enabling the Live Test View in the dashboard.
 *
 * Event types:
 *  - run_start    → Test run begins (includes total steps, URL)
 *  - step_start   → Individual action starts executing
 *  - step_complete → Action finished (pass/fail/error) with screenshot
 *  - step_skipped  → Action was skipped (after a failure)
 *  - run_complete  → Entire test run finished with summary
 *  - console      → Browser console message captured
 *  - network      → Network request/response captured
 *  - error        → Unexpected error during execution
 */

import { Browser, Page } from "puppeteer-core";
import { getBrowserInstance, cleanupBrowser, ManagedBrowser, DEFAULT_ACTION_TIMEOUT } from "@/lib/browser/chromium";
import {
  TestAction,
  TestRunConfig,
  StepResult,
  StepStatus,
  Selector,
  NavigateAction,
  ClickAction,
  FillAction,
  SelectAction,
  CheckAction,
  UncheckAction,
  SubmitAction,
  PressAction,
  WaitAction,
  WaitForSelectorAction,
  WaitForNavigationAction,
  ScreenshotAction,
  ScrollAction,
  HoverAction,
  AssertTextAction,
  AssertVisibleAction,
  AssertUrlAction,
  ReadTextAction,
} from "./actions";

// ── Live Event Types ────────────────────────────────────────────

export interface LiveTestEvent {
  type: "run_start" | "step_start" | "step_complete" | "step_skipped" | "run_complete" | "console" | "network" | "error";
  runId: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface RunStartEvent extends LiveTestEvent {
  type: "run_start";
  url: string;
  totalSteps: number;
  viewport: { width: number; height: number };
  preset?: string;
}

export interface StepStartEvent extends LiveTestEvent {
  type: "step_start";
  stepIndex: number;
  action: TestAction;
}

export interface StepCompleteEvent extends LiveTestEvent {
  type: "step_complete";
  stepIndex: number;
  action: TestAction;
  status: StepStatus;
  duration: number;
  screenshot?: string;
  actualText?: string;
  actualUrl?: string;
  error?: string;
}

export interface StepSkippedEvent extends LiveTestEvent {
  type: "step_skipped";
  stepIndex: number;
  action: TestAction;
}

export interface RunCompleteEvent extends LiveTestEvent {
  type: "run_complete";
  status: StepStatus;
  duration: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
  };
}

export interface ConsoleEvent extends LiveTestEvent {
  type: "console";
  stepIndex: number;
  level: "log" | "warn" | "error" | "info";
  text: string;
}

export interface NetworkEvent extends LiveTestEvent {
  type: "network";
  stepIndex: number;
  method: string;
  url: string;
  status: number;
  contentType?: string;
}

export interface ErrorEvent extends LiveTestEvent {
  type: "error";
  message: string;
}

// ── Live Test Run Config ────────────────────────────────────────

export interface LiveTestRunConfig extends TestRunConfig {
  runId: string;            // Pre-generated test run ID from DB
  projectId: string;        // Project ID for DB persistence
  userId: string;           // User ID for credit deduction
  preset?: string;          // Test preset name (smoke, navigation, etc.)
  captureConsole?: boolean; // Capture browser console messages (default: true)
  captureNetwork?: boolean; // Capture network requests (default: true)
  abortSignal?: AbortSignal; // For cancelling the test run
}

// ── Async Generator: Live Test Execution ────────────────────────

/**
 * Execute a test run and yield live events as they happen.
 * This is the core of the Live Test View — each step result is
 * streamed to the client in real-time.
 *
 * Usage:
 *   for await (const event of executeLiveTestRun(config)) {
 *     // Send event to client via SSE or streaming response
 *   }
 */
export async function* executeLiveTestRun(
  config: LiveTestRunConfig
): AsyncGenerator<LiveTestEvent, void, unknown> {
  const startTime = Date.now();
  const maxSteps = config.maxSteps ?? 50;
  const screenshotEveryStep = config.screenshotEveryStep ?? true;
  const captureConsole = config.captureConsole ?? true;
  const captureNetwork = config.captureNetwork ?? true;
  const { runId, abortSignal } = config;

  // ── Yield: Run Start ──
  const runStartEvent: RunStartEvent = {
    type: "run_start",
    runId,
    timestamp: new Date().toISOString(),
    url: config.url,
    totalSteps: Math.min(config.actions.length, maxSteps),
    viewport: config.viewport ?? { width: 1280, height: 720 },
    preset: config.preset,
  };
  yield runStartEvent;

  let managed: ManagedBrowser | null = null;
  const steps: StepResult[] = [];
  const consoleMessages: { level: string; text: string; stepIndex: number }[] = [];
  const networkRequests: { method: string; url: string; status: number; stepIndex: number }[] = [];

  try {
    // Check for cancellation before starting
    if (abortSignal?.aborted) {
      yield createErrorEvent(runId, "Test run cancelled before starting");
      yield createRunCompleteEvent(runId, startTime, "skipped", steps);
      return;
    }

    managed = await getBrowserInstance();
    const page = await managed.browser.newPage();

    // Set viewport
    await page.setViewport({
      width: config.viewport?.width ?? 1280,
      height: config.viewport?.height ?? 720,
    });

    // Set user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set timeouts
    const actionTimeout = Math.min(config.timeout ?? DEFAULT_ACTION_TIMEOUT, DEFAULT_ACTION_TIMEOUT);
    page.setDefaultTimeout(actionTimeout);
    page.setDefaultNavigationTimeout(actionTimeout);

    // ── Capture Console Messages ──
    if (captureConsole) {
      page.on("console", (msg) => {
        const level = msg.type() as "log" | "warn" | "error" | "info";
        const text = msg.text();
        consoleMessages.push({ level, text, stepIndex: steps.length });
      });
    }

    // ── Capture Network Requests ──
    if (captureNetwork) {
      page.on("response", (response) => {
        const request = response.request();
        networkRequests.push({
          method: request.method(),
          url: request.url(),
          status: response.status(),
          stepIndex: steps.length,
        });
      });
    }

    // ── Execute Each Step ──
    for (let i = 0; i < Math.min(config.actions.length, maxSteps); i++) {
      const action = config.actions[i];

      // Check for cancellation before each step
      if (abortSignal?.aborted) {
        // Mark remaining steps as skipped
        for (let j = i; j < config.actions.length; j++) {
          const skipEvent: StepSkippedEvent = {
            type: "step_skipped",
            runId,
            timestamp: new Date().toISOString(),
            stepIndex: j,
            action: config.actions[j],
          };
          yield skipEvent;
          steps.push({
            action: config.actions[j],
            status: "skipped",
            duration: 0,
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      // ── Yield: Step Start ──
      const stepStartEvent: StepStartEvent = {
        type: "step_start",
        runId,
        timestamp: new Date().toISOString(),
        stepIndex: i,
        action,
      };
      yield stepStartEvent;

      const stepStart = Date.now();

      try {
        const result = await executeAction(page, action, actionTimeout);

        // Auto-screenshot after every step if enabled
        if (screenshotEveryStep && !result.screenshot && result.status === "passed") {
          try {
            const buf = await page.screenshot({ type: "png" });
            result.screenshot = buf.toString("base64");
          } catch {
            // Screenshot failure shouldn't break the test
          }
        }

        // Capture current URL
        result.actualUrl = page.url();
        result.duration = Date.now() - stepStart;

        steps.push(result);

        // ── Yield: Step Complete ──
        const stepCompleteEvent: StepCompleteEvent = {
          type: "step_complete",
          runId,
          timestamp: new Date().toISOString(),
          stepIndex: i,
          action,
          status: result.status,
          duration: result.duration,
          screenshot: result.screenshot,
          actualText: result.actualText,
          actualUrl: result.actualUrl,
          error: result.error,
        };
        yield stepCompleteEvent;

        // Yield any captured console messages for this step
        if (captureConsole) {
          const stepConsoles = consoleMessages.filter((m) => m.stepIndex === i);
          for (const msg of stepConsoles) {
            if (msg.level === "error" || msg.level === "warn") {
              const consoleEvent: ConsoleEvent = {
                type: "console",
                runId,
                timestamp: new Date().toISOString(),
                stepIndex: i,
                level: msg.level as "log" | "warn" | "error" | "info",
                text: msg.text,
              };
              yield consoleEvent;
            }
          }
        }

        // Yield any captured network requests for this step
        if (captureNetwork) {
          const stepNetwork = networkRequests.filter((n) => n.stepIndex === i);
          for (const req of stepNetwork) {
            if (req.status >= 400 || req.url.includes("api/")) {
              const networkEvent: NetworkEvent = {
                type: "network",
                runId,
                timestamp: new Date().toISOString(),
                stepIndex: i,
                method: req.method,
                url: req.url,
                status: req.status,
              };
              yield networkEvent;
            }
          }
        }

        // Clear captured messages for next step
        consoleMessages.length = 0;
        networkRequests.length = 0;

        // Stop on failure
        if (result.status === "failed" || result.status === "error") {
          for (let j = i + 1; j < config.actions.length; j++) {
            const skipEvent: StepSkippedEvent = {
              type: "step_skipped",
              runId,
              timestamp: new Date().toISOString(),
              stepIndex: j,
              action: config.actions[j],
            };
            yield skipEvent;
            steps.push({
              action: config.actions[j],
              status: "skipped",
              duration: 0,
              timestamp: new Date().toISOString(),
            });
          }
          break;
        }
      } catch (unexpectedError) {
        const errorMsg = unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError);
        steps.push({
          action,
          status: "error",
          error: errorMsg,
          duration: Date.now() - stepStart,
          timestamp: new Date().toISOString(),
        });

        // ── Yield: Step Complete (error) ──
        const stepCompleteEvent: StepCompleteEvent = {
          type: "step_complete",
          runId,
          timestamp: new Date().toISOString(),
          stepIndex: i,
          action,
          status: "error",
          duration: Date.now() - stepStart,
          error: errorMsg,
        };
        yield stepCompleteEvent;

        // Skip remaining steps
        for (let j = i + 1; j < config.actions.length; j++) {
          const skipEvent: StepSkippedEvent = {
            type: "step_skipped",
            runId,
            timestamp: new Date().toISOString(),
            stepIndex: j,
            action: config.actions[j],
          };
          yield skipEvent;
          steps.push({
            action: config.actions[j],
            status: "skipped",
            duration: 0,
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }
    }
  } catch (browserError) {
    const errorMsg = browserError instanceof Error ? browserError.message : String(browserError);
    console.error(`[Live Test Executor] Browser error: ${errorMsg}`);

    yield createErrorEvent(runId, `Browser error: ${errorMsg}`);

    // All steps are skipped
    if (steps.length === 0) {
      for (let i = 0; i < config.actions.length; i++) {
        steps.push({
          action: config.actions[i],
          status: "skipped",
          duration: 0,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } finally {
    if (managed) {
      await cleanupBrowser(managed);
    }
  }

  // ── Yield: Run Complete ──
  yield createRunCompleteEvent(runId, startTime, undefined, steps);
}

// ── Helper: Create Error Event ──

function createErrorEvent(runId: string, message: string): ErrorEvent {
  return {
    type: "error",
    runId,
    timestamp: new Date().toISOString(),
    message,
  };
}

// ── Helper: Create Run Complete Event ──

function createRunCompleteEvent(
  runId: string,
  startTime: number,
  forceStatus: StepStatus | undefined,
  steps: StepResult[]
): RunCompleteEvent {
  const summary = computeSummary(steps);
  const status = forceStatus
    ?? (summary.failed > 0 || summary.errors > 0
      ? summary.errors > 0 ? "error" : "failed"
      : "passed");

  return {
    type: "run_complete",
    runId,
    timestamp: new Date().toISOString(),
    status: status as StepStatus,
    duration: Date.now() - startTime,
    summary,
  };
}

// ── Action Executor (reused from test-executor.ts) ──────────────

async function executeAction(
  page: Page,
  action: TestAction,
  defaultTimeout: number
): Promise<StepResult> {
  const start = Date.now();
  const base: Omit<StepResult, "status" | "duration" | "timestamp"> = { action };

  try {
    switch (action.type) {
      case "navigate":
        await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
        break;

      case "click": {
        const element = await findElement(page, action.selector, defaultTimeout);
        if (!element) throw new Error(`Element not found for click: ${describeSelector(action.selector)}`);
        await element.click();
        await page.waitForNetworkIdle({ timeout: 2000 }).catch(() => {});
        break;
      }

      case "fill": {
        const element = await findElement(page, action.selector, defaultTimeout);
        if (!element) throw new Error(`Element not found for fill: ${describeSelector(action.selector)}`);
        if (action.clear !== false) {
          await element.click({ clickCount: 3 });
          await element.press("Backspace");
        }
        await element.type(action.value, { delay: 10 });
        break;
      }

      case "select": {
        const element = await findElement(page, action.selector, defaultTimeout);
        if (!element) throw new Error(`Element not found for select: ${describeSelector(action.selector)}`);
        await element.select(action.value);
        break;
      }

      case "check": {
        const element = await findElement(page, action.selector, defaultTimeout);
        if (!element) throw new Error(`Element not found for check: ${describeSelector(action.selector)}`);
        const isChecked = await element.getProperty("checked").then((p) => p?.jsonValue());
        if (!isChecked) await element.click();
        break;
      }

      case "uncheck": {
        const element = await findElement(page, action.selector, defaultTimeout);
        if (!element) throw new Error(`Element not found for uncheck: ${describeSelector(action.selector)}`);
        const isChecked = await element.getProperty("checked").then((p) => p?.jsonValue());
        if (isChecked) await element.click();
        break;
      }

      case "submit": {
        const element = await findElement(page, action.selector, defaultTimeout);
        if (!element) throw new Error(`Form element not found for submit: ${describeSelector(action.selector)}`);
        const tagName = await element.getProperty("tagName").then((p) => p?.jsonValue());
        if (tagName === "FORM") {
          await page.evaluate((el: HTMLFormElement) => el.submit(), element);
        } else {
          await element.click();
        }
        await page.waitForNavigation({ timeout: 3000, waitUntil: "domcontentloaded" }).catch(() => {});
        break;
      }

      case "press":
        if (action.selector) {
          const element = await findElement(page, action.selector, defaultTimeout);
          if (!element) throw new Error(`Element not found for press: ${describeSelector(action.selector)}`);
          await element.press(action.key);
        } else {
          await page.keyboard.press(action.key);
        }
        break;

      case "wait":
        await new Promise((resolve) => setTimeout(resolve, action.ms));
        break;

      case "waitForSelector":
        await page.waitForSelector(selectorToCss(action.selector), { timeout: action.timeout ?? defaultTimeout });
        break;

      case "waitForNavigation":
        await page.waitForNavigation({ timeout: action.timeout ?? defaultTimeout, waitUntil: "domcontentloaded" });
        break;

      case "screenshot": {
        const buf = await page.screenshot({ type: "png", fullPage: action.fullPage ?? false });
        return { ...base, status: "passed", screenshot: buf.toString("base64"), duration: Date.now() - start, timestamp: new Date().toISOString() };
      }

      case "scroll": {
        const amount = action.amount ?? 300;
        const direction = action.direction === "down" ? 1 : -1;
        await page.evaluate((scrollAmount: number) => window.scrollBy(0, scrollAmount), amount * direction);
        break;
      }

      case "hover": {
        const element = await findElement(page, action.selector, defaultTimeout);
        if (!element) throw new Error(`Element not found for hover: ${describeSelector(action.selector)}`);
        await element.hover();
        break;
      }

      case "assertText": {
        const element = await findElement(page, action.selector, defaultTimeout);
        if (!element) return { ...base, status: "failed", error: `Element not found for assertText: ${describeSelector(action.selector)}`, duration: Date.now() - start, timestamp: new Date().toISOString() };
        const text = await element.evaluate((el: Element) => el.textContent ?? "");
        const matches = action.exact ? text.trim() === action.expected : text.toLowerCase().includes(action.expected.toLowerCase());
        if (!matches) return { ...base, status: "failed", error: `Text assertion failed. Expected "${action.expected}" but got "${text.trim()}"`, actualText: text.trim(), duration: Date.now() - start, timestamp: new Date().toISOString() };
        return { ...base, status: "passed", actualText: text.trim(), duration: Date.now() - start, timestamp: new Date().toISOString() };
      }

      case "assertVisible": {
        const element = await findElement(page, action.selector, defaultTimeout);
        if (!element) return { ...base, status: "failed", error: `Element not found for assertVisible: ${describeSelector(action.selector)}`, duration: Date.now() - start, timestamp: new Date().toISOString() };
        const isVisible = await element.isIntersectingViewport();
        if (!isVisible) return { ...base, status: "failed", error: `Element is not visible: ${describeSelector(action.selector)}`, duration: Date.now() - start, timestamp: new Date().toISOString() };
        return { ...base, status: "passed", duration: Date.now() - start, timestamp: new Date().toISOString() };
      }

      case "assertUrl": {
        const currentUrl = page.url();
        if (action.exact) {
          if (currentUrl !== action.expected) return { ...base, status: "failed", error: `URL assertion failed. Expected "${action.expected}" but got "${currentUrl}"`, actualUrl: currentUrl, duration: Date.now() - start, timestamp: new Date().toISOString() };
        } else {
          const pattern = action.expected.replace(/\*/g, ".*");
          const regex = new RegExp(`^${pattern}$`);
          if (!regex.test(currentUrl) && !currentUrl.includes(action.expected.replace(/\/$/, ""))) {
            return { ...base, status: "failed", error: `URL assertion failed. Expected pattern "${action.expected}" but got "${currentUrl}"`, actualUrl: currentUrl, duration: Date.now() - start, timestamp: new Date().toISOString() };
          }
        }
        return { ...base, status: "passed", actualUrl: currentUrl, duration: Date.now() - start, timestamp: new Date().toISOString() };
      }

      case "readText": {
        const element = await findElement(page, action.selector, defaultTimeout);
        if (!element) return { ...base, status: "failed", duration: Date.now() - start, timestamp: new Date().toISOString() };
        const text = await element.evaluate((el: Element) => el.textContent ?? "");
        return { ...base, status: "passed", actualText: text.trim(), duration: Date.now() - start, timestamp: new Date().toISOString() };
      }

      default:
        return { ...base, status: "error", error: `Unknown action type: ${(action as TestAction).type}`, duration: Date.now() - start, timestamp: new Date().toISOString() };
    }

    return { ...base, status: "passed", duration: Date.now() - start, timestamp: new Date().toISOString() };
  } catch (error) {
    let failureScreenshot: string | undefined;
    try {
      const buf = await page.screenshot({ type: "png" });
      failureScreenshot = buf.toString("base64");
    } catch { /* Can't screenshot */ }

    return {
      ...base,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      screenshot: failureScreenshot,
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }
}

// ── Element Finder (same as test-executor.ts) ──────────────────

async function findElement(page: Page, selector: Selector, timeout: number): Promise<import("puppeteer-core").ElementHandle<Element> | null> {
  const cssSelector = selectorToCss(selector);
  try {
    await page.waitForSelector(cssSelector, { timeout: Math.min(timeout, 5000) });
  } catch {
    if (selector.strategy !== "css") {
      const altSelector = await tryAlternativeSelectors(page, selector, 3000);
      if (altSelector) return altSelector;
    }
    return null;
  }
  return page.$(cssSelector);
}

function selectorToCss(selector: Selector): string {
  switch (selector.strategy) {
    case "css": return selector.value;
    case "testId": return `[data-testid="${selector.value}"]`;
    case "placeholder": return `[placeholder="${selector.value}"]`;
    case "label": return `label:has-text("${selector.value}") + input, label:has-text("${selector.value}") ~ input, input[aria-label="${selector.value}"]`;
    case "role": {
      const roleMatch = selector.value.match(/^(\w+)(?:\[name=['"]([^'"]+)['"]\])?$/);
      if (roleMatch) {
        const [, role, name] = roleMatch;
        if (name) return `[role="${role}"][aria-label="${name}"], [role="${role}"][name="${name}"]`;
        return `[role="${role}"]`;
      }
      return `[role="${selector.value}"]`;
    }
    case "text": return `text="${selector.value}"`;
    default: return selector.value;
  }
}

async function tryAlternativeSelectors(page: Page, selector: Selector, timeout: number): Promise<import("puppeteer-core").ElementHandle<Element> | null> {
  if (selector.strategy === "text") {
    const xpath = `//button[contains(text(), '${selector.value}')] | //a[contains(text(), '${selector.value}')] | //*[contains(text(), '${selector.value}')]`;
    try {
      await page.waitForXPath(xpath, { timeout });
      const elements = await page.$x(xpath);
      return (elements[0] as import("puppeteer-core").ElementHandle<Element>) ?? null;
    } catch { return null; }
  }
  if (selector.strategy === "label") {
    const xpath = `//input[@aria-label='${selector.value}'] | //input[@id=//label[contains(text(),'${selector.value}')]/@for]`;
    try {
      await page.waitForXPath(xpath, { timeout });
      const elements = await page.$x(xpath);
      return (elements[0] as import("puppeteer-core").ElementHandle<Element>) ?? null;
    } catch { return null; }
  }
  return null;
}

function describeSelector(selector: Selector): string {
  return `${selector.strategy}:"${selector.value}"`;
}

function computeSummary(steps: StepResult[]): { total: number; passed: number; failed: number; skipped: number; errors: number } {
  let passed = 0, failed = 0, skipped = 0, errors = 0;
  for (const step of steps) {
    switch (step.status) {
      case "passed": passed++; break;
      case "failed": failed++; break;
      case "skipped": skipped++; break;
      case "error": errors++; break;
    }
  }
  return { total: steps.length, passed, failed, skipped, errors };
}
