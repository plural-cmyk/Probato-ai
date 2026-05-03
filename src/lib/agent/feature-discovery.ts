/**
 * Probato Feature Discovery Agent
 *
 * Automatically discovers testable features from a live web application by:
 * 1. Visiting the URL and extracting DOM structure (forms, links, buttons, nav)
 * 2. Analyzing the page HTML with LLM for deeper understanding
 * 3. Persisting discovered features to the database
 * 4. Generating test action sequences from discovered features
 *
 * This agent bridges the gap between "I have a web app" and "I have test coverage".
 */

import { Browser, Page } from "puppeteer-core";
import { getBrowserInstance, cleanupBrowser, DEFAULT_ACTION_TIMEOUT } from "@/lib/browser/chromium";
import { analyzeCode } from "@/lib/llm/provider";
import { db } from "@/lib/db";
import {
  TestAction,
  sel,
  actions,
} from "./actions";

// ── Types ──────────────────────────────────────────────────────────

export interface DiscoveredElement {
  tag: string;
  selector: string;
  text?: string;
  type?: string;      // input type: text, email, password, etc.
  role?: string;      // ARIA role
  placeholder?: string;
  href?: string;       // for links
  action?: string;     // form action
  name?: string;       // input name attribute
  label?: string;      // associated label text
  testId?: string;     // data-testid
}

export interface DiscoveredForm {
  selector: string;
  action?: string;
  method?: string;
  inputs: DiscoveredElement[];
  submitButton?: DiscoveredElement;
}

export interface DiscoveredPage {
  url: string;
  title: string;
  forms: DiscoveredForm[];
  links: DiscoveredElement[];
  buttons: DiscoveredElement[];
  navigation: DiscoveredElement[];
  inputs: DiscoveredElement[];
  headings: { level: number; text: string; selector: string }[];
  images: { src: string; alt: string; selector: string }[];
  metaDescription?: string;
}

export interface DiscoveredFeature {
  name: string;
  type: "form" | "navigation" | "page" | "component" | "api-endpoint" | "route";
  description: string;
  selector?: string;
  route?: string;
  priority: number;
  dependencies: string[];
  suggestedActions: TestAction[];
}

export interface DiscoveryResult {
  page: DiscoveredPage;
  features: DiscoveredFeature[];
  persistedCount: number;
  duration: number;
  error?: string;
}

// ── Main Entry Point ──────────────────────────────────────────────

/**
 * Discover testable features from a live web URL.
 * Visits the page, extracts DOM structure, analyzes with LLM, persists features.
 */
export async function discoverFeatures(
  url: string,
  projectId: string,
  options?: {
    maxDepth?: number;      // How many links to follow (default: 0 = just this page)
    includeLLM?: boolean;   // Use LLM analysis on page HTML (default: true)
  }
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const { includeLLM = true, maxDepth = 0 } = options ?? {};

  let managed: Awaited<ReturnType<typeof getBrowserInstance>> | null = null;

  try {
    // 1. Launch browser and visit the page
    managed = await getBrowserInstance();
    const page = await managed.browser.newPage();

    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    page.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT);
    page.setDefaultNavigationTimeout(DEFAULT_ACTION_TIMEOUT);

    console.log(`[Discovery] Visiting ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: DEFAULT_ACTION_TIMEOUT });

    // Wait a moment for dynamic content
    await new Promise((r) => setTimeout(r, 1500));

    // 2. Extract DOM structure
    const discoveredPage = await extractPageStructure(page, url);

    // 3. Optionally follow links (limited depth)
    if (maxDepth > 0) {
      const internalLinks = discoveredPage.links
        .filter((l) => l.href && l.href.startsWith(url.replace(/\/$/, "")))
        .slice(0, maxDepth);

      for (const link of internalLinks) {
        try {
          console.log(`[Discovery] Following link: ${link.href}`);
          await page.goto(link.href, { waitUntil: "domcontentloaded", timeout: DEFAULT_ACTION_TIMEOUT });
          await new Promise((r) => setTimeout(r, 1000));
          const subPage = await extractPageStructure(page, link.href);
          // Merge sub-page discoveries into the main page
          discoveredPage.forms.push(...subPage.forms);
          discoveredPage.links.push(...subPage.links);
          discoveredPage.buttons.push(...subPage.buttons);
          discoveredPage.navigation.push(...subPage.navigation);
          discoveredPage.inputs.push(...subPage.inputs);
          discoveredPage.headings.push(...subPage.headings);
        } catch {
          // Skip unreachable links
        }
      }
    }

    // 4. LLM analysis of page HTML (if enabled)
    let llmFeatures: DiscoveredFeature[] = [];
    if (includeLLM) {
      try {
        console.log(`[Discovery] Running LLM analysis...`);
        const htmlSnippet = await page.evaluate(() => {
          return document.documentElement.outerHTML.substring(0, 30000);
        });
        const analysis = await analyzeCode(htmlSnippet, "page.html");

        // Convert LLM features to DiscoveredFeature format
        llmFeatures = analysis.features.map((f) => ({
          name: f.name,
          type: mapLLMFeatureType(f.type),
          description: f.description,
          priority: f.testPriority,
          dependencies: f.dependencies ?? [],
          suggestedActions: [], // Will be generated below
        }));

        // Also extract selectors from components
        for (const comp of analysis.components) {
          if (comp.selectors && comp.selectors.length > 0) {
            llmFeatures.push({
              name: comp.name,
              type: mapComponentType(comp.type),
              description: comp.description,
              selector: comp.selectors[0],
              priority: 2,
              dependencies: [],
              suggestedActions: [],
            });
          }
        }
      } catch (llmError) {
        console.warn(`[Discovery] LLM analysis failed, continuing with DOM extraction only:`, llmError);
      }
    }

    // 5. Build features from DOM structure
    const domFeatures = buildFeaturesFromDOM(discoveredPage);

    // 6. Merge and deduplicate features
    const allFeatures = deduplicateFeatures([...domFeatures, ...llmFeatures]);

    // 7. Generate suggested test actions for each feature
    for (const feature of allFeatures) {
      if (feature.suggestedActions.length === 0) {
        feature.suggestedActions = generateTestActions(feature, url, discoveredPage);
      }
    }

    // 8. Persist to database
    let persistedCount = 0;
    try {
      persistedCount = await persistFeatures(allFeatures, projectId);
    } catch (dbError) {
      console.warn(`[Discovery] Failed to persist features:`, dbError);
    }

    await page.close();

    return {
      page: discoveredPage,
      features: allFeatures,
      persistedCount,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Discovery] Failed: ${message}`);
    return {
      page: {
        url,
        title: "",
        forms: [],
        links: [],
        buttons: [],
        navigation: [],
        inputs: [],
        headings: [],
        images: [],
      },
      features: [],
      persistedCount: 0,
      duration: Date.now() - startTime,
      error: message,
    };
  } finally {
    if (managed) {
      await cleanupBrowser(managed);
    }
  }
}

// ── DOM Extraction ─────────────────────────────────────────────────

/**
 * Extract the full DOM structure of a page using browser evaluation.
 * Finds forms, links, buttons, navigation, inputs, headings, images.
 */
async function extractPageStructure(page: Page, url: string): Promise<DiscoveredPage> {
  return page.evaluate((pageUrl: string) => {
    const result: DiscoveredPage = {
      url: pageUrl,
      title: document.title || "",
      forms: [],
      links: [],
      buttons: [],
      navigation: [],
      inputs: [],
      headings: [],
      images: [],
      metaDescription: undefined,
    };

    // Meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      result.metaDescription = metaDesc.getAttribute("content") ?? undefined;
    }

    // Headings
    document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
      const level = parseInt(el.tagName[1]);
      const text = el.textContent?.trim() ?? "";
      if (text) {
        const id = el.id ? `#${el.id}` : "";
        const className = el.className && typeof el.className === "string"
          ? `.${el.className.trim().split(/\s+/).join(".")}`
          : "";
        result.headings.push({
          level,
          text,
          selector: `${el.tagName.toLowerCase()}${id}${className}`.substring(0, 100),
        });
      }
    });

    // Forms
    document.querySelectorAll("form").forEach((form) => {
      const formSelector = form.id ? `#${form.id}` : form.className ? `form.${form.className.trim().split(/\s+/)[0]}` : "form";
      const discoveredForm: DiscoveredForm = {
        selector: formSelector,
        action: form.action || undefined,
        method: form.method || undefined,
        inputs: [],
        submitButton: undefined,
      };

      // Form inputs
      form.querySelectorAll("input, textarea, select").forEach((input) => {
        const el = input as HTMLInputElement;
        const testId = el.getAttribute("data-testid");
        const label = findLabel(el);
        const selector = testId
          ? `[data-testid="${testId}"]`
          : el.id ? `#${el.id}`
          : el.name ? `${el.tagName.toLowerCase()}[name="${el.name}"]`
          : el.type ? `input[type="${el.type}"]`
          : el.tagName.toLowerCase();

        discoveredForm.inputs.push({
          tag: el.tagName.toLowerCase(),
          selector,
          type: el.type || undefined,
          name: el.name || undefined,
          placeholder: el.placeholder || undefined,
          label: label || undefined,
          testId: testId || undefined,
        });
      });

      // Submit button
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      if (submitBtn) {
        const btn = submitBtn as HTMLButtonElement;
        discoveredForm.submitButton = {
          tag: "button",
          selector: btn.id ? `#${btn.id}` : btn.getAttribute("data-testid") ? `[data-testid="${btn.getAttribute("data-testid")}"]` : "button[type=submit]",
          text: btn.textContent?.trim() || undefined,
          type: "submit",
        };
      }

      result.forms.push(discoveredForm);

      // Also add form inputs to the global inputs list
      result.inputs.push(...discoveredForm.inputs);
    });

    // Standalone inputs (not inside forms)
    document.querySelectorAll("input, textarea, select").forEach((input) => {
      if (input.closest("form")) return; // Already captured in form
      const el = input as HTMLInputElement;
      const testId = el.getAttribute("data-testid");
      result.inputs.push({
        tag: el.tagName.toLowerCase(),
        selector: testId ? `[data-testid="${testId}"]` : el.id ? `#${el.id}` : el.name ? `input[name="${el.name}"]` : `input[type="${el.type}"]`,
        type: el.type || undefined,
        placeholder: el.placeholder || undefined,
        testId: testId || undefined,
      });
    });

    // Links
    document.querySelectorAll("a[href]").forEach((a) => {
      const el = a as HTMLAnchorElement;
      if (!el.href || el.href === "#" || el.href.startsWith("javascript:")) return;
      result.links.push({
        tag: "a",
        selector: el.id ? `#${el.id}` : el.getAttribute("data-testid") ? `[data-testid="${el.getAttribute("data-testid")}"]` : `a[href="${el.getAttribute("href")}"]`,
        text: el.textContent?.trim().substring(0, 100) || undefined,
        href: el.href,
      });
    });

    // Buttons (not submit buttons in forms)
    document.querySelectorAll("button").forEach((btn) => {
      if (btn.closest("form") && (btn.type === "submit" || !btn.type)) return;
      const testId = btn.getAttribute("data-testid");
      result.buttons.push({
        tag: "button",
        selector: testId ? `[data-testid="${testId}"]` : btn.id ? `#${btn.id}` : `button:has-text("${btn.textContent?.trim().substring(0, 50)}")`,
        text: btn.textContent?.trim().substring(0, 100) || undefined,
        role: btn.getAttribute("role") || undefined,
        testId: testId || undefined,
      });
    });

    // Navigation elements
    document.querySelectorAll("nav, [role=navigation], header nav, .navbar, .navigation").forEach((nav) => {
      const links = nav.querySelectorAll("a");
      links.forEach((a) => {
        const el = a as HTMLAnchorElement;
        result.navigation.push({
          tag: "a",
          selector: el.id ? `#${el.id}` : `nav a[href="${el.getAttribute("href")}"]`,
          text: el.textContent?.trim().substring(0, 100) || undefined,
          href: el.href,
        });
      });
    });

    // Images
    document.querySelectorAll("img[src]").forEach((img) => {
      const el = img as HTMLImageElement;
      result.images.push({
        src: el.src,
        alt: el.alt || "",
        selector: el.id ? `#${el.id}` : el.className ? `img.${el.className.trim().split(/\s+/)[0]}` : "img",
      });
    });

    return result;

    // Helper: Find label for an input
    function findLabel(input: HTMLInputElement): string | null {
      // Check for wrapping label
      const parentLabel = input.closest("label");
      if (parentLabel) {
        return parentLabel.textContent?.trim() ?? null;
      }
      // Check for label with for= attribute
      if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) return label.textContent?.trim() ?? null;
      }
      // Check for aria-label
      const ariaLabel = input.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel;
      return null;
    }
  }, url);
}

// ── Feature Building ──────────────────────────────────────────────

/**
 * Build DiscoveredFeature objects from the extracted DOM structure.
 */
function buildFeaturesFromDOM(page: DiscoveredPage): DiscoveredFeature[] {
  const features: DiscoveredFeature[] = [];

  // Feature: The page itself
  features.push({
    name: page.title || `Page at ${new URL(page.url).pathname}`,
    type: "page",
    description: `Landing page: "${page.title}" at ${page.url}. Contains ${page.forms.length} form(s), ${page.links.length} link(s), ${page.buttons.length} button(s).`,
    route: page.url,
    priority: 1,
    dependencies: [],
    suggestedActions: [],
  });

  // Features: Forms
  for (let i = 0; i < page.forms.length; i++) {
    const form = page.forms[i];
    const inputNames = form.inputs.map((inp) => inp.label || inp.placeholder || inp.name || inp.type || "input").join(", ");
    features.push({
      name: form.submitButton?.text
        ? `Form: ${form.submitButton.text}`
        : `Form #${i + 1}`,
      type: "form",
      description: `Form with ${form.inputs.length} input(s): ${inputNames}. ${form.submitButton ? `Submit: "${form.submitButton.text}".` : "No submit button found."}`,
      selector: form.selector,
      priority: form.inputs.some((inp) => inp.type === "password") ? 1 : 2,
      dependencies: [],
      suggestedActions: [],
    });
  }

  // Features: Navigation
  if (page.navigation.length > 0) {
    features.push({
      name: "Navigation Menu",
      type: "navigation",
      description: `Navigation with ${page.navigation.length} link(s): ${page.navigation.slice(0, 5).map((n) => `"${n.text}"`).join(", ")}${page.navigation.length > 5 ? ` and ${page.navigation.length - 5} more` : ""}.`,
      selector: "nav",
      priority: 2,
      dependencies: [],
      suggestedActions: [],
    });
  }

  // Features: Standalone buttons (CTAs, actions)
  for (const btn of page.buttons.slice(0, 10)) {
    if (btn.text) {
      features.push({
        name: `Button: "${btn.text}"`,
        type: "component",
        description: `Interactive button labeled "${btn.text}"${btn.role ? ` with role="${btn.role}"` : ""}.`,
        selector: btn.selector,
        priority: 2,
        dependencies: [],
        suggestedActions: [],
      });
    }
  }

  // Features: Key links (external, internal)
  const uniqueDomains = new Set<string>();
  for (const link of page.links.slice(0, 20)) {
    try {
      const domain = new URL(link.href ?? "").hostname;
      if (!uniqueDomains.has(domain)) {
        uniqueDomains.add(domain);
      }
    } catch {
      // Skip invalid URLs
    }
  }

  if (uniqueDomains.size > 1) {
    features.push({
      name: "External Links",
      type: "navigation",
      description: `Page links to ${uniqueDomains.size} different domain(s): ${Array.from(uniqueDomains).slice(0, 5).join(", ")}.`,
      priority: 3,
      dependencies: [],
      suggestedActions: [],
    });
  }

  return features;
}

// ── Test Action Generation ────────────────────────────────────────

/**
 * Generate a sequence of TestActions from a discovered feature.
 * These are the actions the Test Executor would run to verify the feature.
 */
function generateTestActions(
  feature: DiscoveredFeature,
  baseUrl: string,
  page: DiscoveredPage
): TestAction[] {
  const actionList: TestAction[] = [];

  switch (feature.type) {
    case "page": {
      // Navigate + screenshot + assert page loaded
      actionList.push(actions.navigate(baseUrl, `Navigate to ${feature.name}`));
      actionList.push(actions.waitForSelector(sel.css("body"), 5000, "Wait for page body"));
      actionList.push(actions.screenshot(false, "Page loaded"));
      if (page.headings.length > 0) {
        const h1 = page.headings.find((h) => h.level === 1);
        if (h1) {
          actionList.push(actions.assertVisible(sel.css(h1.selector), `Verify heading "${h1.text}" is visible`));
        }
      }
      break;
    }

    case "form": {
      // Navigate + fill each input + screenshot + submit
      actionList.push(actions.navigate(baseUrl, `Navigate to page with form`));
      actionList.push(actions.waitForSelector(sel.css(feature.selector ?? "form"), 5000, "Wait for form"));

      const form = page.forms.find((f) => f.selector === feature.selector);
      if (form) {
        for (const input of form.inputs.slice(0, 5)) {
          const selector = input.testId
            ? sel.testId(input.testId)
            : input.name
            ? sel.css(input.selector)
            : sel.css(input.selector);

          const fillValue = guessFillValue(input);
          if (fillValue) {
            actionList.push(actions.fill(selector, fillValue, `Fill ${input.label || input.placeholder || input.name || input.type || "input"}`));
          }
        }
        actionList.push(actions.screenshot(false, "Form filled"));
        if (form.submitButton) {
          const submitSel = form.submitButton.testId
            ? sel.testId(form.submitButton.testId)
            : sel.css(form.submitButton.selector);
          actionList.push(actions.click(submitSel, `Click "${form.submitButton.text || "Submit"}"`));
          actionList.push(actions.wait(2000, "Wait for form response"));
        }
      }
      actionList.push(actions.screenshot(false, "After form submission"));
      break;
    }

    case "navigation": {
      // Navigate + verify nav exists + click first link + screenshot
      actionList.push(actions.navigate(baseUrl, `Navigate to page`));
      actionList.push(actions.waitForSelector(sel.css("nav, [role=navigation]"), 5000, "Wait for navigation"));
      actionList.push(actions.assertVisible(sel.css("nav, [role=navigation]"), "Verify navigation is visible"));
      if (page.navigation.length > 0) {
        const firstNav = page.navigation[0];
        if (firstNav.text) {
          actionList.push(actions.click(sel.text(firstNav.text), `Click nav link "${firstNav.text}"`));
          actionList.push(actions.wait(2000, "Wait for navigation"));
          actionList.push(actions.screenshot(false, "After navigation"));
        }
      }
      break;
    }

    case "component": {
      // Navigate + find element + screenshot
      actionList.push(actions.navigate(baseUrl, `Navigate to page`));
      actionList.push(actions.waitForSelector(sel.css("body"), 5000, "Wait for page"));
      if (feature.selector) {
        actionList.push(actions.assertVisible(sel.css(feature.selector), `Verify "${feature.name}" is visible`));
        actionList.push(actions.screenshot(false, `Component: ${feature.name}`));
      }
      break;
    }

    default: {
      actionList.push(actions.navigate(baseUrl, `Navigate to ${baseUrl}`));
      actionList.push(actions.screenshot(false, "Basic page check"));
      break;
    }
  }

  return actionList;
}

/**
 * Guess a reasonable test value for a form input based on its type/name/placeholder.
 */
function guessFillValue(input: DiscoveredElement): string | null {
  const type = input.type?.toLowerCase();
  const name = input.name?.toLowerCase() ?? "";
  const placeholder = input.placeholder?.toLowerCase() ?? "";
  const label = input.label?.toLowerCase() ?? "";

  if (type === "submit" || type === "button" || type === "reset" || type === "hidden" || type === "checkbox" || type === "radio" || type === "file") {
    return null;
  }

  if (type === "email" || name.includes("email") || placeholder.includes("email") || label.includes("email")) {
    return "test@example.com";
  }
  if (type === "password" || name.includes("password") || placeholder.includes("password") || label.includes("password")) {
    return "TestP@ss123";
  }
  if (type === "tel" || name.includes("phone") || placeholder.includes("phone")) {
    return "+1234567890";
  }
  if (type === "url" || name.includes("url") || name.includes("website")) {
    return "https://example.com";
  }
  if (type === "number") {
    return "42";
  }
  if (type === "search" || name.includes("search") || placeholder.includes("search")) {
    return "test query";
  }

  // Generic text input
  return "test input";
}

// ── Feature Persistence ────────────────────────────────────────────

/**
 * Persist discovered features to the database.
 * Updates existing features if they match by name + projectId.
 */
async function persistFeatures(
  features: DiscoveredFeature[],
  projectId: string
): Promise<number> {
  let count = 0;

  for (const feature of features) {
    try {
      // Check if feature already exists
      const existing = await db.feature.findFirst({
        where: { projectId, name: feature.name },
      });

      if (existing) {
        // Update
        await db.feature.update({
          where: { id: existing.id },
          data: {
            type: feature.type,
            description: feature.description,
            selector: feature.selector,
            route: feature.route,
            priority: feature.priority,
            dependencies: feature.dependencies,
          },
        });
      } else {
        // Create
        await db.feature.create({
          data: {
            name: feature.name,
            type: feature.type,
            description: feature.description,
            selector: feature.selector,
            route: feature.route,
            priority: feature.priority,
            dependencies: feature.dependencies,
            projectId,
          },
        });
      }
      count++;
    } catch (error) {
      console.warn(`[Discovery] Failed to persist feature "${feature.name}":`, error);
    }
  }

  return count;
}

// ── Helpers ──────────────────────────────────────────────────────

function mapLLMFeatureType(type: string): DiscoveredFeature["type"] {
  const mapping: Record<string, DiscoveredFeature["type"]> = {
    auth: "form",
    crud: "form",
    navigation: "navigation",
    form: "form",
    api: "api-endpoint",
    visualization: "component",
    realtime: "component",
    other: "component",
  };
  return mapping[type] ?? "component";
}

function mapComponentType(type: string): DiscoveredFeature["type"] {
  const mapping: Record<string, DiscoveredFeature["type"]> = {
    page: "page",
    component: "component",
    layout: "component",
    form: "form",
    api: "api-endpoint",
  };
  return mapping[type] ?? "component";
}

/**
 * Deduplicate features by name, keeping the one with higher priority (lower number).
 */
function deduplicateFeatures(features: DiscoveredFeature[]): DiscoveredFeature[] {
  const seen = new Map<string, DiscoveredFeature>();

  for (const feature of features) {
    const key = feature.name.toLowerCase().trim();
    const existing = seen.get(key);
    if (!existing || feature.priority < existing.priority) {
      seen.set(key, feature);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.priority - b.priority);
}

/**
 * Get features for a project from the database.
 */
export async function getProjectFeatures(projectId: string) {
  return db.feature.findMany({
    where: { projectId },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    include: { testCases: true },
  });
}

/**
 * Delete all features for a project (for re-discovery).
 */
export async function clearProjectFeatures(projectId: string) {
  // Delete test cases first (cascading should handle this, but be safe)
  const features = await db.feature.findMany({ where: { projectId }, select: { id: true } });
  for (const feature of features) {
    await db.testCase.deleteMany({ where: { featureId: feature.id } });
  }
  await db.feature.deleteMany({ where: { projectId } });
}
