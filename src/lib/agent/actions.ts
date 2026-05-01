/**
 * Probato Test Executor — Action Types & Validators
 * 
 * Defines the action vocabulary the Test Executor Agent can perform.
 * Each action is a serializable instruction that maps to a Puppeteer operation.
 */

// ── Action Types ──────────────────────────────────────────────────

export type ActionType =
  | "navigate"
  | "click"
  | "fill"
  | "select"
  | "check"
  | "uncheck"
  | "submit"
  | "press"
  | "wait"
  | "waitForSelector"
  | "waitForNavigation"
  | "screenshot"
  | "scroll"
  | "hover"
  | "assertText"
  | "assertVisible"
  | "assertUrl"
  | "readText";

// ── Selector Strategy ────────────────────────────────────────────

export type SelectorStrategy =
  | "css"        // Standard CSS selector: "button.submit", "#login-btn"
  | "text"       // Find element by text content: "Sign In"
  | "role"       // ARIA role + name: "button[name='Submit']"
  | "testId"     // data-testid attribute: "login-btn" → [data-testid="login-btn"]
  | "label"      // Find input by label text: "Email"
  | "placeholder"; // Find input by placeholder: "Enter your email"

export interface Selector {
  strategy: SelectorStrategy;
  value: string;
}

// ── Base Action ──────────────────────────────────────────────────

export interface BaseAction {
  type: ActionType;
  label: string; // Human-readable description for the test log
}

// ── Concrete Action Definitions ──────────────────────────────────

export interface NavigateAction extends BaseAction {
  type: "navigate";
  url: string;
}

export interface ClickAction extends BaseAction {
  type: "click";
  selector: Selector;
}

export interface FillAction extends BaseAction {
  type: "fill";
  selector: Selector;
  value: string;
  clear?: boolean; // Clear field before typing (default: true)
}

export interface SelectAction extends BaseAction {
  type: "select";
  selector: Selector;
  value: string; // The option value to select
}

export interface CheckAction extends BaseAction {
  type: "check";
  selector: Selector;
}

export interface UncheckAction extends BaseAction {
  type: "uncheck";
  selector: Selector;
}

export interface SubmitAction extends BaseAction {
  type: "submit";
  selector: Selector; // The form element to submit
}

export interface PressAction extends BaseAction {
  type: "press";
  key: string; // "Enter", "Tab", "Escape", etc.
  selector?: Selector; // Optional: press on specific element
}

export interface WaitAction extends BaseAction {
  type: "wait";
  ms: number;
}

export interface WaitForSelectorAction extends BaseAction {
  type: "waitForSelector";
  selector: Selector;
  timeout?: number;
}

export interface WaitForNavigationAction extends BaseAction {
  type: "waitForNavigation";
  timeout?: number;
}

export interface ScreenshotAction extends BaseAction {
  type: "screenshot";
  fullPage?: boolean;
}

export interface ScrollAction extends BaseAction {
  type: "scroll";
  direction: "up" | "down";
  amount?: number; // pixels, default 300
}

export interface HoverAction extends BaseAction {
  type: "hover";
  selector: Selector;
}

export interface AssertTextAction extends BaseAction {
  type: "assertText";
  selector: Selector;
  expected: string;
  exact?: boolean; // Default: false (substring match)
}

export interface AssertVisibleAction extends BaseAction {
  type: "assertVisible";
  selector: Selector;
}

export interface AssertUrlAction extends BaseAction {
  type: "assertUrl";
  expected: string; // URL or pattern (supports * wildcard)
  exact?: boolean;
}

export interface ReadTextAction extends BaseAction {
  type: "readText";
  selector: Selector;
}

// ── Union Type ──────────────────────────────────────────────────

export type TestAction =
  | NavigateAction
  | ClickAction
  | FillAction
  | SelectAction
  | CheckAction
  | UncheckAction
  | SubmitAction
  | PressAction
  | WaitAction
  | WaitForSelectorAction
  | WaitForNavigationAction
  | ScreenshotAction
  | ScrollAction
  | HoverAction
  | AssertTextAction
  | AssertVisibleAction
  | AssertUrlAction
  | ReadTextAction;

// ── Step Result ─────────────────────────────────────────────────

export type StepStatus = "passed" | "failed" | "skipped" | "error";

export interface StepResult {
  action: TestAction;
  status: StepStatus;
  screenshot?: string; // base64 PNG
  actualText?: string; // Text read from the page
  actualUrl?: string;  // URL after the action
  error?: string;      // Error message if failed
  duration: number;    // milliseconds
  timestamp: string;
}

// ── Test Run Result ─────────────────────────────────────────────

export interface TestRunResult {
  status: StepStatus;
  steps: StepResult[];
  startedAt: string;
  endedAt: string;
  duration: number; // total ms
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
  };
  screenshots: string[]; // base64 PNGs for each step with screenshot
}

// ── Test Run Config ─────────────────────────────────────────────

export interface TestRunConfig {
  url: string;           // Target URL to test
  actions: TestAction[]; // Sequence of actions to execute
  viewport?: {
    width: number;
    height: number;
  };
  screenshotEveryStep?: boolean; // Capture screenshot after every action (default: true)
  maxSteps?: number;             // Safety limit (default: 50)
  timeout?: number;              // Per-action timeout in ms (default: 15000)
}

// ── Helper: Build selectors easily ──────────────────────────────

export const sel = {
  css: (value: string): Selector => ({ strategy: "css", value }),
  text: (value: string): Selector => ({ strategy: "text", value }),
  role: (value: string): Selector => ({ strategy: "role", value }),
  testId: (value: string): Selector => ({ strategy: "testId", value }),
  label: (value: string): Selector => ({ strategy: "label", value }),
  placeholder: (value: string): Selector => ({ strategy: "placeholder", value }),
};

// ── Helper: Build common action sequences ───────────────────────

export const actions = {
  navigate: (url: string, label?: string): NavigateAction => ({
    type: "navigate",
    url,
    label: label ?? `Navigate to ${url}`,
  }),

  click: (selector: Selector, label?: string): ClickAction => ({
    type: "click",
    selector,
    label: label ?? `Click ${selector.value}`,
  }),

  fill: (selector: Selector, value: string, label?: string): FillAction => ({
    type: "fill",
    selector,
    value,
    label: label ?? `Fill "${selector.value}" with "${value}"`,
  }),

  select: (selector: Selector, value: string, label?: string): SelectAction => ({
    type: "select",
    selector,
    value,
    label: label ?? `Select "${value}" in ${selector.value}`,
  }),

  check: (selector: Selector, label?: string): CheckAction => ({
    type: "check",
    selector,
    label: label ?? `Check ${selector.value}`,
  }),

  submit: (selector: Selector, label?: string): SubmitAction => ({
    type: "submit",
    selector,
    label: label ?? `Submit form ${selector.value}`,
  }),

  press: (key: string, label?: string, selector?: Selector): PressAction => ({
    type: "press",
    key,
    selector,
    label: label ?? `Press ${key}`,
  }),

  wait: (ms: number, label?: string): WaitAction => ({
    type: "wait",
    ms,
    label: label ?? `Wait ${ms}ms`,
  }),

  waitForSelector: (selector: Selector, timeout?: number, label?: string): WaitForSelectorAction => ({
    type: "waitForSelector",
    selector,
    timeout,
    label: label ?? `Wait for ${selector.value}`,
  }),

  waitForNavigation: (timeout?: number, label?: string): WaitForNavigationAction => ({
    type: "waitForNavigation",
    timeout,
    label: label ?? `Wait for navigation`,
  }),

  screenshot: (fullPage?: boolean, label?: string): ScreenshotAction => ({
    type: "screenshot",
    fullPage,
    label: label ?? "Take screenshot",
  }),

  scroll: (direction: "up" | "down", amount?: number, label?: string): ScrollAction => ({
    type: "scroll",
    direction,
    amount,
    label: label ?? `Scroll ${direction}`,
  }),

  hover: (selector: Selector, label?: string): HoverAction => ({
    type: "hover",
    selector,
    label: label ?? `Hover over ${selector.value}`,
  }),

  assertText: (selector: Selector, expected: string, exact?: boolean, label?: string): AssertTextAction => ({
    type: "assertText",
    selector,
    expected,
    exact,
    label: label ?? `Assert text "${expected}" in ${selector.value}`,
  }),

  assertVisible: (selector: Selector, label?: string): AssertVisibleAction => ({
    type: "assertVisible",
    selector,
    label: label ?? `Assert ${selector.value} is visible`,
  }),

  assertUrl: (expected: string, exact?: boolean, label?: string): AssertUrlAction => ({
    type: "assertUrl",
    expected,
    exact,
    label: label ?? `Assert URL is ${expected}`,
  }),

  readText: (selector: Selector, label?: string): ReadTextAction => ({
    type: "readText",
    selector,
    label: label ?? `Read text from ${selector.value}`,
  }),
};

// ── Login Test Template ─────────────────────────────────────────

/** Generate a standard login test action sequence */
export function loginTestActions(
  loginUrl: string,
  username: string,
  password: string,
  options?: {
    usernameSelector?: Selector;
    passwordSelector?: Selector;
    submitSelector?: Selector;
    successUrl?: string;
  }
): TestAction[] {
  return [
    actions.navigate(loginUrl, `Navigate to login page`),
    actions.waitForSelector(
      options?.usernameSelector ?? sel.placeholder("Email"),
      10000,
      "Wait for login form to load"
    ),
    actions.screenshot(false, "Login page loaded"),
    actions.fill(
      options?.usernameSelector ?? sel.placeholder("Email"),
      username,
      `Fill username: ${username}`
    ),
    actions.fill(
      options?.passwordSelector ?? sel.placeholder("Password"),
      password,
      "Fill password"
    ),
    actions.screenshot(false, "Credentials entered"),
    actions.click(
      options?.submitSelector ?? sel.css('button[type="submit"]'),
      "Click login button"
    ),
    actions.waitForNavigation(10000, "Wait for login to complete"),
    actions.screenshot(false, "After login"),
    ...(options?.successUrl
      ? [actions.assertUrl(options.successUrl, false, "Verify redirected after login")]
      : []),
  ];
}
