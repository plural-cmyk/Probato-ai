/**
 * Probato Test Executor Agent
 * 
 * The core agent that executes a sequence of browser actions against a web app.
 * Built on Puppeteer + @sparticuz/chromium (serverless-compatible).
 * 
 * Capabilities:
 * - Navigate to URLs
 * - Click buttons/links by selector, text, or role
 * - Fill form fields, select options, check/uncheck boxes
 * - Submit forms
 * - Wait for elements, navigation, or timeouts
 * - Take screenshots at any step
 * - Assert text, visibility, URLs
 * - Read text content from elements
 */

import { Browser, Page, ElementHandle } from "puppeteer-core";
import { getBrowserInstance, cleanupBrowser, ManagedBrowser, DEFAULT_ACTION_TIMEOUT } from "@/lib/browser/chromium";
import {
  TestAction,
  TestRunConfig,
  TestRunResult,
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

// ── Main Entry Point ────────────────────────────────────────────

/**
 * Execute a test run: launch browser, run actions sequentially, capture results
 */
export async function executeTestRun(config: TestRunConfig): Promise<TestRunResult> {
  const startTime = Date.now();
  const steps: StepResult[] = [];
  const screenshots: string[] = [];
  const maxSteps = config.maxSteps ?? 50;
  const screenshotEveryStep = config.screenshotEveryStep ?? true;

  let managed: ManagedBrowser | null = null;

  try {
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

    // Set short default timeout for Vercel serverless compatibility
    const actionTimeout = Math.min(config.timeout ?? DEFAULT_ACTION_TIMEOUT, DEFAULT_ACTION_TIMEOUT);
    page.setDefaultTimeout(actionTimeout);
    page.setDefaultNavigationTimeout(actionTimeout);

    // Execute each action
    for (let i = 0; i < Math.min(config.actions.length, maxSteps); i++) {
      const action = config.actions[i];
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

        // Collect screenshots
        if (result.screenshot) {
          screenshots.push(result.screenshot);
        }

        // Capture current URL for context
        result.actualUrl = page.url();

        steps.push(result);

        // Stop on failure (don't continue after a failed step)
        if (result.status === "failed" || result.status === "error") {
          // Skip remaining actions
          for (let j = i + 1; j < config.actions.length; j++) {
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
        // Catch unexpected errors that escape executeAction
        steps.push({
          action,
          status: "error",
          error: unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError),
          duration: Date.now() - stepStart,
          timestamp: new Date().toISOString(),
        });

        // Skip remaining
        for (let j = i + 1; j < config.actions.length; j++) {
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
    // Browser launch or page creation failed
    const errorMessage = browserError instanceof Error ? browserError.message : String(browserError);
    console.error(`[Test Executor] Browser error: ${errorMessage}`);

    return {
      status: "error",
      steps: config.actions.map((action) => ({
        action,
        status: "skipped" as StepStatus,
        duration: 0,
        timestamp: new Date().toISOString(),
      })),
      error: errorMessage,
      startedAt: new Date(startTime).toISOString(),
      endedAt: new Date().toISOString(),
      duration: Date.now() - startTime,
      summary: { total: config.actions.length, passed: 0, failed: 0, skipped: config.actions.length, errors: 1 },
      screenshots: [],
    };
  } finally {
    if (managed) {
      await cleanupBrowser(managed);
    }
  }

  const endTime = Date.now();
  const summary = computeSummary(steps);

  return {
    status: summary.failed > 0 || summary.errors > 0
      ? summary.errors > 0 ? "error" : "failed"
      : "passed",
    steps,
    startedAt: new Date(startTime).toISOString(),
    endedAt: new Date(endTime).toISOString(),
    duration: endTime - startTime,
    summary,
    screenshots,
  };
}

// ── Action Executor ─────────────────────────────────────────────

async function executeAction(
  page: Page,
  action: TestAction,
  defaultTimeout: number
): Promise<StepResult> {
  const start = Date.now();

  const base: Omit<StepResult, "status" | "duration" | "timestamp"> = {
    action,
  };

  try {
    switch (action.type) {
      case "navigate":
        await executeNavigate(page, action, defaultTimeout);
        break;

      case "click":
        await executeClick(page, action, defaultTimeout);
        break;

      case "fill":
        await executeFill(page, action, defaultTimeout);
        break;

      case "select":
        await executeSelect(page, action, defaultTimeout);
        break;

      case "check":
        await executeCheck(page, action, defaultTimeout);
        break;

      case "uncheck":
        await executeUncheck(page, action, defaultTimeout);
        break;

      case "submit":
        await executeSubmit(page, action, defaultTimeout);
        break;

      case "press":
        await executePress(page, action, defaultTimeout);
        break;

      case "wait":
        await new Promise((resolve) => setTimeout(resolve, action.ms));
        break;

      case "waitForSelector":
        await executeWaitForSelector(page, action, defaultTimeout);
        break;

      case "waitForNavigation":
        await page.waitForNavigation({
          timeout: action.timeout ?? defaultTimeout,
          waitUntil: "domcontentloaded", // Faster for Vercel
        });
        break;

      case "screenshot": {
        const buf = await page.screenshot({
          type: "png",
          fullPage: action.fullPage ?? false,
        });
        return {
          ...base,
          status: "passed",
          screenshot: buf.toString("base64"),
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      case "scroll":
        await executeScroll(page, action);
        break;

      case "hover":
        await executeHover(page, action, defaultTimeout);
        break;

      case "assertText": {
        const textResult = await executeAssertText(page, action, defaultTimeout);
        return {
          ...base,
          ...textResult,
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      case "assertVisible": {
        const visResult = await executeAssertVisible(page, action, defaultTimeout);
        return {
          ...base,
          ...visResult,
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      case "assertUrl": {
        const urlResult = executeAssertUrl(page, action);
        return {
          ...base,
          ...urlResult,
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      case "readText": {
        const readResult = await executeReadText(page, action, defaultTimeout);
        return {
          ...base,
          ...readResult,
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
      }

      default:
        return {
          ...base,
          status: "error",
          error: `Unknown action type: ${(action as TestAction).type}`,
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
    }

    return {
      ...base,
      status: "passed",
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    // Take failure screenshot
    let failureScreenshot: string | undefined;
    try {
      const buf = await page.screenshot({ type: "png" });
      failureScreenshot = buf.toString("base64");
    } catch {
      // Can't screenshot, that's fine
    }

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

// ── Individual Action Implementations ────────────────────────────

async function executeNavigate(page: Page, action: NavigateAction, timeout: number): Promise<void> {
  await page.goto(action.url, {
    waitUntil: "domcontentloaded", // Faster than networkidle2 for Vercel
    timeout,
  });
}

async function executeClick(page: Page, action: ClickAction, timeout: number): Promise<void> {
  const element = await findElement(page, action.selector, timeout);
  if (!element) {
    throw new Error(`Element not found for click: ${describeSelector(action.selector)}`);
  }
  await element.click();
  // Brief settle time after click (short for Vercel)
  await page.waitForNetworkIdle({ timeout: 2000 }).catch(() => {});
}

async function executeFill(page: Page, action: FillAction, timeout: number): Promise<void> {
  const element = await findElement(page, action.selector, timeout);
  if (!element) {
    throw new Error(`Element not found for fill: ${describeSelector(action.selector)}`);
  }

  // Clear existing value
  if (action.clear !== false) {
    await element.click({ clickCount: 3 }); // Triple-click to select all
    await element.press("Backspace");
  }

  await element.type(action.value, { delay: 10 }); // Fast typing for Vercel
}

async function executeSelect(page: Page, action: SelectAction, timeout: number): Promise<void> {
  const element = await findElement(page, action.selector, timeout);
  if (!element) {
    throw new Error(`Element not found for select: ${describeSelector(action.selector)}`);
  }
  await element.select(action.value);
}

async function executeCheck(page: Page, action: CheckAction, timeout: number): Promise<void> {
  const element = await findElement(page, action.selector, timeout);
  if (!element) {
    throw new Error(`Element not found for check: ${describeSelector(action.selector)}`);
  }
  const isChecked = await element.getProperty("checked").then((p) => p?.jsonValue());
  if (!isChecked) {
    await element.click();
  }
}

async function executeUncheck(page: Page, action: UncheckAction, timeout: number): Promise<void> {
  const element = await findElement(page, action.selector, timeout);
  if (!element) {
    throw new Error(`Element not found for uncheck: ${describeSelector(action.selector)}`);
  }
  const isChecked = await element.getProperty("checked").then((p) => p?.jsonValue());
  if (isChecked) {
    await element.click();
  }
}

async function executeSubmit(page: Page, action: SubmitAction, timeout: number): Promise<void> {
  const element = await findElement(page, action.selector, timeout);
  if (!element) {
    throw new Error(`Form element not found for submit: ${describeSelector(action.selector)}`);
  }

  // Submit the form — either by calling form.submit() or clicking a submit button
  const tagName = await element.getProperty("tagName").then((p) => p?.jsonValue());
  if (tagName === "FORM") {
    await page.evaluate((el: HTMLFormElement) => el.submit(), element);
  } else {
    await element.click();
  }

  // Wait for navigation after submit (short for Vercel)
  await page.waitForNavigation({ timeout: 3000, waitUntil: "domcontentloaded" }).catch(() => {});
}

async function executePress(page: Page, action: PressAction, timeout: number): Promise<void> {
  if (action.selector) {
    const element = await findElement(page, action.selector, timeout);
    if (!element) {
      throw new Error(`Element not found for press: ${describeSelector(action.selector)}`);
    }
    await element.press(action.key);
  } else {
    await page.keyboard.press(action.key);
  }
}

async function executeWaitForSelector(
  page: Page,
  action: WaitForSelectorAction,
  defaultTimeout: number
): Promise<void> {
  const cssSelector = selectorToCss(action.selector);
  await page.waitForSelector(cssSelector, {
    timeout: action.timeout ?? defaultTimeout,
  });
}

async function executeScroll(page: Page, action: ScrollAction): Promise<void> {
  const amount = action.amount ?? 300;
  const direction = action.direction === "down" ? 1 : -1;
  await page.evaluate((scrollAmount: number) => {
    window.scrollBy(0, scrollAmount);
  }, amount * direction);
}

async function executeHover(page: Page, action: HoverAction, timeout: number): Promise<void> {
  const element = await findElement(page, action.selector, timeout);
  if (!element) {
    throw new Error(`Element not found for hover: ${describeSelector(action.selector)}`);
  }
  await element.hover();
}

async function executeAssertText(
  page: Page,
  action: AssertTextAction,
  timeout: number
): Promise<Pick<StepResult, "status" | "error" | "actualText">> {
  const element = await findElement(page, action.selector, timeout);
  if (!element) {
    return {
      status: "failed",
      error: `Element not found for assertText: ${describeSelector(action.selector)}`,
    };
  }

  const text = await element.evaluate((el: Element) => el.textContent ?? "");
  const matches = action.exact
    ? text.trim() === action.expected
    : text.toLowerCase().includes(action.expected.toLowerCase());

  if (!matches) {
    return {
      status: "failed",
      error: `Text assertion failed. Expected "${action.expected}" but got "${text.trim()}"`,
      actualText: text.trim(),
    };
  }

  return {
    status: "passed",
    actualText: text.trim(),
  };
}

async function executeAssertVisible(
  page: Page,
  action: AssertVisibleAction,
  timeout: number
): Promise<Pick<StepResult, "status" | "error">> {
  const element = await findElement(page, action.selector, timeout);
  if (!element) {
    return {
      status: "failed",
      error: `Element not found for assertVisible: ${describeSelector(action.selector)}`,
    };
  }

  const isVisible = await element.isIntersectingViewport();
  if (!isVisible) {
    return {
      status: "failed",
      error: `Element is not visible: ${describeSelector(action.selector)}`,
    };
  }

  return { status: "passed" };
}

function executeAssertUrl(
  page: Page,
  action: AssertUrlAction
): Pick<StepResult, "status" | "error" | "actualUrl"> {
  const currentUrl = page.url();

  if (action.exact) {
    if (currentUrl !== action.expected) {
      return {
        status: "failed",
        error: `URL assertion failed. Expected "${action.expected}" but got "${currentUrl}"`,
        actualUrl: currentUrl,
      };
    }
  } else {
    // Support wildcard matching
    const pattern = action.expected.replace(/\*/g, ".*");
    const regex = new RegExp(`^${pattern}$`);
    if (!regex.test(currentUrl)) {
      // Also try simple includes
      if (!currentUrl.includes(action.expected.replace(/\/$/, ""))) {
        return {
          status: "failed",
          error: `URL assertion failed. Expected pattern "${action.expected}" but got "${currentUrl}"`,
          actualUrl: currentUrl,
        };
      }
    }
  }

  return { status: "passed", actualUrl: currentUrl };
}

async function executeReadText(
  page: Page,
  action: ReadTextAction,
  timeout: number
): Promise<Pick<StepResult, "status" | "actualText">> {
  const element = await findElement(page, action.selector, timeout);
  if (!element) {
    return {
      status: "failed" as StepStatus,
      actualText: undefined,
    } as Pick<StepResult, "status" | "actualText">;
  }

  const text = await element.evaluate((el: Element) => el.textContent ?? "");
  return {
    status: "passed",
    actualText: text.trim(),
  };
}

// ── Element Finder ──────────────────────────────────────────────

/**
 * Find a DOM element using various selector strategies.
 * Falls back through multiple strategies for robustness.
 */
async function findElement(
  page: Page,
  selector: Selector,
  timeout: number
): Promise<ElementHandle<Element> | null> {
  const cssSelector = selectorToCss(selector);

  // Wait for the element to appear
  try {
    await page.waitForSelector(cssSelector, { timeout: Math.min(timeout, 5000) });
  } catch {
    // Element didn't appear with primary selector — try alternatives
    if (selector.strategy !== "css") {
      const altSelector = await tryAlternativeSelectors(page, selector, 3000);
      if (altSelector) return altSelector;
    }
    return null;
  }

  return page.$(cssSelector);
}

/**
 * Convert any Selector to a CSS selector string
 */
function selectorToCss(selector: Selector): string {
  switch (selector.strategy) {
    case "css":
      return selector.value;
    case "testId":
      return `[data-testid="${selector.value}"]`;
    case "placeholder":
      return `[placeholder="${selector.value}"]`;
    case "label":
      // Find input associated with a label
      return `label:has-text("${selector.value}") + input, label:has-text("${selector.value}") ~ input, input[aria-label="${selector.value}"]`;
    case "role":
      // Parse "role[name='value']" format
      const roleMatch = selector.value.match(/^(\w+)(?:\[name=['"]([^'"]+)['"]\])?$/);
      if (roleMatch) {
        const [, role, name] = roleMatch;
        if (name) {
          return `[role="${role}"][aria-label="${name}"], [role="${role}"][name="${name}"]`;
        }
        return `[role="${role}"]`;
      }
      return `[role="${selector.value}"]`;
    case "text":
      // XPath-based text search — will be handled in tryAlternativeSelectors
      // For CSS, we try common patterns
      return `text="${selector.value}"`; // Puppeteer supports text= selector
    default:
      return selector.value;
  }
}

/**
 * Try alternative selector strategies when the primary one fails
 */
async function tryAlternativeSelectors(
  page: Page,
  selector: Selector,
  timeout: number
): Promise<ElementHandle<Element> | null> {
  // For text-based selectors, use XPath
  if (selector.strategy === "text") {
    const xpath = `//button[contains(text(), '${selector.value}')] | //a[contains(text(), '${selector.value}')] | //*[contains(text(), '${selector.value}')]`;
    try {
      await page.waitForXPath(xpath, { timeout });
      const elements = await page.$x(xpath);
      return (elements[0] as ElementHandle<Element>) ?? null;
    } catch {
      return null;
    }
  }

  // For label selectors, try XPath
  if (selector.strategy === "label") {
    const xpath = `//input[@aria-label='${selector.value}'] | //input[@id=//label[contains(text(),'${selector.value}')]/@for]`;
    try {
      await page.waitForXPath(xpath, { timeout });
      const elements = await page.$x(xpath);
      return (elements[0] as ElementHandle<Element>) ?? null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Human-readable description of a selector
 */
function describeSelector(selector: Selector): string {
  return `${selector.strategy}:"${selector.value}"`;
}

// ── Summary Computation ─────────────────────────────────────────

function computeSummary(steps: StepResult[]): TestRunResult["summary"] {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errors = 0;

  for (const step of steps) {
    switch (step.status) {
      case "passed": passed++; break;
      case "failed": failed++; break;
      case "skipped": skipped++; break;
      case "error": errors++; break;
    }
  }

  return {
    total: steps.length,
    passed,
    failed,
    skipped,
    errors,
  };
}
