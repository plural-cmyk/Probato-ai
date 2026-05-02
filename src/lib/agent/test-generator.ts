/**
 * Probato Playwright Test Code Generator
 *
 * Converts discovered features and test actions into executable Playwright test code.
 * Generates standard Playwright Test (not Puppeteer) files that can be:
 * - Saved to disk and run with `npx playwright test`
 * - Stored in the TestCase.code field for versioning
 * - Modified manually by developers
 *
 * Generated tests use the Page Object Model pattern for maintainability.
 */

import {
  TestAction,
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
  sel,
} from "./actions";

// ── Types ──────────────────────────────────────────────────────────

export interface GeneratedTestCase {
  name: string;
  featureName: string;
  description: string;
  code: string;           // Full Playwright test file content
  selectors: string[];    // All selectors used (for auto-heal tracking)
  imports: string[];      // Required imports
  url: string;            // Target URL
}

export interface GeneratedTestSuite {
  projectName: string;
  url: string;
  testCases: GeneratedTestCase[];
  sharedSelectors: Record<string, string>;  // Named selector constants
  generatedAt: string;
}

// ── Main Entry Point ──────────────────────────────────────────────

/**
 * Generate a complete Playwright test file from a list of test actions.
 */
export function generatePlaywrightTest(
  name: string,
  featureName: string,
  url: string,
  actions: TestAction[],
  options?: {
    description?: string;
    baseUrl?: string;
    headless?: boolean;
    timeout?: number;
  }
): GeneratedTestCase {
  const {
    description = `Auto-generated test for ${featureName}`,
    baseUrl = url,
    headless = true,
    timeout = 30000,
  } = options ?? {};

  // Collect all selectors used
  const selectorsUsed: string[] = [];
  for (const action of actions) {
    if ("selector" in action && action.selector) {
      selectorsUsed.push(selectorToPlaywright(action.selector));
    }
  }

  // Generate test body lines
  const testLines: string[] = [];
  for (const action of actions) {
    testLines.push(...generateActionLines(action, "page"));
  }

  // Build the full file
  const code = buildTestFile({
    name,
    featureName,
    description,
    url,
    baseUrl,
    headless,
    timeout,
    testLines,
    selectorsUsed,
  });

  return {
    name,
    featureName,
    description,
    code,
    selectors: selectorsUsed,
    imports: ["@playwright/test"],
    url,
  };
}

/**
 * Generate a full test suite with multiple test cases from discovered features.
 */
export function generateTestSuite(
  projectName: string,
  url: string,
  features: {
    name: string;
    type: string;
    description?: string;
    selector?: string;
    suggestedActions: TestAction[];
  }[]
): GeneratedTestSuite {
  const testCases: GeneratedTestCase[] = [];
  const sharedSelectors: Record<string, string> = {};

  for (const feature of features) {
    const sanitizedName = sanitizeForFilename(feature.name);
    const testCase = generatePlaywrightTest(
      sanitizedName,
      feature.name,
      url,
      feature.suggestedActions,
      { description: feature.description }
    );
    testCases.push(testCase);

    // Collect shared selectors
    if (feature.selector) {
      sharedSelectors[sanitizedName] = feature.selector;
    }
  }

  return {
    projectName,
    url,
    testCases,
    sharedSelectors,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a combined test file with multiple test.describe blocks.
 */
export function generateCombinedTestFile(
  projectName: string,
  url: string,
  features: {
    name: string;
    type: string;
    description?: string;
    selector?: string;
    suggestedActions: TestAction[];
  }[]
): string {
  const suite = generateTestSuite(projectName, url, features);

  const lines: string[] = [];
  lines.push(`// Probato Auto-Generated Test Suite`);
  lines.push(`// Project: ${projectName}`);
  lines.push(`// Generated: ${suite.generatedAt}`);
  lines.push(`// Target: ${url}`);
  lines.push(``);
  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push(``);
  lines.push(`const BASE_URL = '${url}';`);
  lines.push(``);

  // Shared selectors
  if (Object.keys(suite.sharedSelectors).length > 0) {
    lines.push(`// Shared Selectors`);
    lines.push(`const selectors = {`);
    for (const [name, selector] of Object.entries(suite.sharedSelectors)) {
      lines.push(`  ${name}: '${escapeString(selector)}',`);
    }
    lines.push(`};`);
    lines.push(``);
  }

  // Generate each test case as a describe block
  for (const testCase of suite.testCases) {
    lines.push(`test.describe('${escapeString(testCase.featureName)}', () => {`);
    lines.push(`  // ${escapeString(testCase.description)}`);
    lines.push(``);
    lines.push(`  test('${escapeString(testCase.name)}', async ({ page }) => {`);
    lines.push(`    test.setTimeout(${30000});`);

    // Add test lines indented
    for (const line of testCase.code.split("\n")) {
      // Skip the file-level boilerplate, just keep the test body
      if (
        line.startsWith("//") ||
        line.startsWith("import") ||
        line.startsWith("const BASE_URL") ||
        line.startsWith("test.describe") ||
        line.startsWith("test(") ||
        line.trim() === "" && testCases.indexOf(testCase) > 0
      ) continue;
      lines.push(`    ${line}`);
    }

    lines.push(`  });`);
    lines.push(`});`);
    lines.push(``);
  }

  return lines.join("\n");
}

// ── Action Line Generators ────────────────────────────────────────

function generateActionLines(action: TestAction, pageVar: string): string[] {
  switch (action.type) {
    case "navigate":
      return generateNavigate(action as NavigateAction, pageVar);
    case "click":
      return generateClick(action as ClickAction, pageVar);
    case "fill":
      return generateFill(action as FillAction, pageVar);
    case "select":
      return generateSelect(action as SelectAction, pageVar);
    case "check":
      return generateCheck(action as CheckAction, pageVar);
    case "uncheck":
      return generateUncheck(action as UncheckAction, pageVar);
    case "submit":
      return generateSubmit(action as SubmitAction, pageVar);
    case "press":
      return generatePress(action as PressAction, pageVar);
    case "wait":
      return generateWait(action as WaitAction);
    case "waitForSelector":
      return generateWaitForSelector(action as WaitForSelectorAction, pageVar);
    case "waitForNavigation":
      return generateWaitForNavigation(action as WaitForNavigationAction, pageVar);
    case "screenshot":
      return generateScreenshot(action as ScreenshotAction, pageVar);
    case "scroll":
      return generateScroll(action as ScrollAction, pageVar);
    case "hover":
      return generateHover(action as HoverAction, pageVar);
    case "assertText":
      return generateAssertText(action as AssertTextAction, pageVar);
    case "assertVisible":
      return generateAssertVisible(action as AssertVisibleAction, pageVar);
    case "assertUrl":
      return generateAssertUrl(action as AssertUrlAction, pageVar);
    case "readText":
      return generateReadText(action as ReadTextAction, pageVar);
    default:
      return [`// Unknown action type: ${(action as TestAction).type}`];
  }
}

function generateNavigate(action: NavigateAction, pageVar: string): string[] {
  return [
    `// ${action.label || `Navigate to ${action.url}`}`,
    `await ${pageVar}.goto('${escapeString(action.url)}');`,
  ];
}

function generateClick(action: ClickAction, pageVar: string): string[] {
  const pwSelector = selectorToPlaywright(action.selector);
  return [
    `// ${action.label || `Click ${action.selector.value}`}`,
    `await ${pageVar}.locator('${escapeString(pwSelector)}').click();`,
  ];
}

function generateFill(action: FillAction, pageVar: string): string[] {
  const pwSelector = selectorToPlaywright(action.selector);
  const lines: string[] = [
    `// ${action.label || `Fill ${action.selector.value}`}`,
  ];
  if (action.clear !== false) {
    lines.push(`await ${pageVar}.locator('${escapeString(pwSelector)}').clear();`);
  }
  lines.push(`await ${pageVar}.locator('${escapeString(pwSelector)}').fill('${escapeString(action.value)}');`);
  return lines;
}

function generateSelect(action: SelectAction, pageVar: string): string[] {
  const pwSelector = selectorToPlaywright(action.selector);
  return [
    `// ${action.label || `Select ${action.value}`}`,
    `await ${pageVar}.locator('${escapeString(pwSelector)}').selectOption('${escapeString(action.value)}');`,
  ];
}

function generateCheck(action: CheckAction, pageVar: string): string[] {
  const pwSelector = selectorToPlaywright(action.selector);
  return [
    `// ${action.label || `Check ${action.selector.value}`}`,
    `await ${pageVar}.locator('${escapeString(pwSelector)}').check();`,
  ];
}

function generateUncheck(action: UncheckAction, pageVar: string): string[] {
  const pwSelector = selectorToPlaywright(action.selector);
  return [
    `// ${action.label || `Uncheck ${action.selector.value}`}`,
    `await ${pageVar}.locator('${escapeString(pwSelector)}').uncheck();`,
  ];
}

function generateSubmit(action: SubmitAction, pageVar: string): string[] {
  const pwSelector = selectorToPlaywright(action.selector);
  return [
    `// ${action.label || `Submit form`}`,
    `await ${pageVar}.locator('${escapeString(pwSelector)}').evaluate((el: HTMLFormElement) => el.submit());`,
  ];
}

function generatePress(action: PressAction, pageVar: string): string[] {
  if (action.selector) {
    const pwSelector = selectorToPlaywright(action.selector);
    return [
      `// ${action.label || `Press ${action.key}`}`,
      `await ${pageVar}.locator('${escapeString(pwSelector)}').press('${escapeString(action.key)}');`,
    ];
  }
  return [
    `// ${action.label || `Press ${action.key}`}`,
    `await ${pageVar}.keyboard.press('${escapeString(action.key)}');`,
  ];
}

function generateWait(action: WaitAction): string[] {
  return [
    `// ${action.label || `Wait ${action.ms}ms`}`,
    `await ${pageVar_name()}.waitForTimeout(${action.ms});`,
  ];
}

function generateWaitForSelector(action: WaitForSelectorAction, pageVar: string): string[] {
  const pwSelector = selectorToPlaywright(action.selector);
  const timeout = action.timeout ? `, { timeout: ${action.timeout} }` : "";
  return [
    `// ${action.label || `Wait for ${action.selector.value}`}`,
    `await ${pageVar}.locator('${escapeString(pwSelector)}').waitFor({ state: 'visible'${action.timeout ? `, timeout: ${action.timeout}` : ""} });`,
  ];
}

function generateWaitForNavigation(action: WaitForNavigationAction, pageVar: string): string[] {
  return [
    `// ${action.label || `Wait for navigation`}`,
    `await ${pageVar}.waitForURL('**/*', { timeout: ${action.timeout ?? 30000} });`,
  ];
}

function generateScreenshot(action: ScreenshotAction, pageVar: string): string[] {
  return [
    `// ${action.label || `Take screenshot`}`,
    `await ${pageVar}.screenshot({ path: 'screenshots/${sanitizeForFilename(action.label || "screenshot")}.png', fullPage: ${action.fullPage ?? false} });`,
  ];
}

function generateScroll(action: ScrollAction, pageVar: string): string[] {
  const direction = action.direction === "down" ? 1 : -1;
  const amount = action.amount ?? 300;
  return [
    `// ${action.label || `Scroll ${action.direction}`}`,
    `await ${pageVar}.evaluate(() => window.scrollBy(0, ${amount * direction}));`,
  ];
}

function generateHover(action: HoverAction, pageVar: string): string[] {
  const pwSelector = selectorToPlaywright(action.selector);
  return [
    `// ${action.label || `Hover over ${action.selector.value}`}`,
    `await ${pageVar}.locator('${escapeString(pwSelector)}').hover();`,
  ];
}

function generateAssertText(action: AssertTextAction, pageVar: string): string[] {
  const pwSelector = selectorToPlaywright(action.selector);
  if (action.exact) {
    return [
      `// ${action.label || `Assert text "${action.expected}"`}`,
      `await expect(${pageVar}.locator('${escapeString(pwSelector)}')).toHaveText('${escapeString(action.expected)}');`,
    ];
  }
  return [
    `// ${action.label || `Assert text contains "${action.expected}"`}`,
    `await expect(${pageVar}.locator('${escapeString(pwSelector)}')).toContainText('${escapeString(action.expected)}');`,
  ];
}

function generateAssertVisible(action: AssertVisibleAction, pageVar: string): string[] {
  const pwSelector = selectorToPlaywright(action.selector);
  return [
    `// ${action.label || `Assert ${action.selector.value} is visible`}`,
    `await expect(${pageVar}.locator('${escapeString(pwSelector)}')).toBeVisible();`,
  ];
}

function generateAssertUrl(action: AssertUrlAction, pageVar: string): string[] {
  if (action.exact) {
    return [
      `// ${action.label || `Assert URL`}`,
      `await expect(${pageVar}).toHaveURL('${escapeString(action.expected)}');`,
    ];
  }
  return [
    `// ${action.label || `Assert URL contains`}`,
    `await expect(${pageVar}).toHaveURL(/${escapeString(action.expected.replace(/\*/g, ".*"))}/);`,
  ];
}

function generateReadText(action: ReadTextAction, pageVar: string): string[] {
  const pwSelector = selectorToPlaywright(action.selector);
  return [
    `// ${action.label || `Read text from ${action.selector.value}`}`,
    `const text = await ${pageVar}.locator('${escapeString(pwSelector)}').textContent();`,
    `console.log('Read text:', text);`,
  ];
}

// ── Selector Conversion ───────────────────────────────────────────

/**
 * Convert our Selector type to a Playwright-compatible selector string.
 * Playwright supports CSS, XPath, text, and role-based selectors.
 */
function selectorToPlaywright(selector: Selector): string {
  switch (selector.strategy) {
    case "css":
      return selector.value;
    case "testId":
      // Playwright has built-in testId support
      return `data-testid=${selector.value}`;
    case "text":
      // Playwright text selector
      return `text="${selector.value}"`;
    case "role": {
      // Parse "role[name='value']" format
      const roleMatch = selector.value.match(/^(\w+)(?:\[name=['"]([^'"]+)['"]\])?$/);
      if (roleMatch) {
        const [, role, name] = roleMatch;
        if (name) {
          return `role=${role}[name="${name}"]`;
        }
        return `role=${role}`;
      }
      return `role=${selector.value}`;
    }
    case "label":
      return `text="${selector.value}"`;
    case "placeholder":
      return `[placeholder="${selector.value}"]`;
    default:
      return selector.value;
  }
}

// ── File Builder ──────────────────────────────────────────────────

function buildTestFile(opts: {
  name: string;
  featureName: string;
  description: string;
  url: string;
  baseUrl: string;
  headless: boolean;
  timeout: number;
  testLines: string[];
  selectorsUsed: string[];
}): string {
  const lines: string[] = [];

  // File header
  lines.push(`// Probato Auto-Generated Playwright Test`);
  lines.push(`// Feature: ${opts.featureName}`);
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push(`// Target: ${opts.url}`);
  lines.push(``);

  // Imports
  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push(``);

  // Config
  lines.push(`test.use({`);
  lines.push(`  baseURL: '${escapeString(opts.baseUrl)}',`);
  lines.push(`  actionTimeout: ${opts.timeout},`);
  lines.push(`});`);
  lines.push(``);

  // Test block
  lines.push(`test.describe('${escapeString(opts.featureName)}', () => {`);
  lines.push(`  /**`);
  lines.push(`   * ${escapeString(opts.description)}`);
  lines.push(`   */`);
  lines.push(`  test('${escapeString(opts.name)}', async ({ page }) => {`);

  // Test body
  for (const line of opts.testLines) {
    if (line.trim().startsWith("//")) {
      lines.push(`    ${line}`);
    } else if (line.trim() === "") {
      lines.push(``);
    } else {
      lines.push(`    ${line}`);
    }
  }

  lines.push(`  });`);
  lines.push(`});`);

  return lines.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────

function pageVar_name(): string {
  return "page";
}

function sanitizeForFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
}
