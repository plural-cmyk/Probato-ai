/**
 * Probato Browser Manager
 *
 * Connects to a remote browser via WebSocket (Browserless, Chrome remote, etc.)
 * or falls back to local/@sparticuz/chromium.
 *
 * Priority:
 * 1. BROWSER_WS_ENDPOINT env → connect to remote Chrome (Browserless, etc.)
 * 2. BROWSERLESS_TOKEN env → auto-construct Browserless WebSocket URL
 * 3. On Vercel → try @sparticuz/chromium (often fails on Hobby plan)
 * 4. Local dev → try local Chrome/Chromium installation
 */

import puppeteer, { Browser, Page } from "puppeteer-core";

// ── Types ──────────────────────────────────────────────────────────

export interface BrowseResult {
  url: string;
  title: string;
  screenshot: string; // base64 PNG
  viewport: { width: number; height: number };
  timestamp: string;
  links: string[];
  html: string; // trimmed page HTML
}

export interface BrowseOptions {
  url: string;
  width?: number;
  height?: number;
  waitFor?: number;
  fullPage?: boolean;
  selector?: string;
}

export interface BrowserDiagnostics {
  available: boolean;
  mode: "remote-ws" | "browserless" | "sparticuz" | "local" | "unavailable";
  isVercel: boolean;
  nodeVersion: string;
  wsEndpoint?: string;
  error?: string;
}

// ── Browser Launch ─────────────────────────────────────────────────

/**
 * Launch or connect to a browser.
 *
 * Strategy (in order of priority):
 * 1. BROWSER_WS_ENDPOINT → generic WebSocket URL (works with any remote Chrome)
 * 2. BROWSERLESS_TOKEN → auto-build Browserless WebSocket URL
 * 3. On Vercel without remote → try @sparticuz/chromium
 * 4. Local dev → try local Chrome/Chromium
 */
export async function launchBrowser(): Promise<Browser> {
  const wsEndpoint = getBrowserWSEndpoint();

  if (wsEndpoint) {
    return connectRemoteBrowser(wsEndpoint);
  }

  const isVercel = !!process.env.VERCEL;
  console.log(`[Browser] No remote endpoint, falling back (Vercel: ${isVercel})`);

  if (isVercel) {
    return launchSparticuzBrowser();
  }

  return launchLocalBrowser();
}

// ── Remote Browser Connection ──────────────────────────────────────

/**
 * Get the WebSocket endpoint from environment variables.
 * Returns null if no remote browser is configured.
 */
function getBrowserWSEndpoint(): string | null {
  // Priority 1: Direct WebSocket endpoint
  const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;
  if (wsEndpoint) {
    console.log(`[Browser] Using BROWSER_WS_ENDPOINT`);
    return wsEndpoint;
  }

  // Priority 2: Browserless token → construct WebSocket URL
  const browserlessToken = process.env.BROWSERLESS_TOKEN;
  if (browserlessToken) {
    const browserlessHost = process.env.BROWSERLESS_HOST || "chrome.browserless.io";
    const url = `wss://${browserlessHost}?token=${browserlessToken}&--disable-web-security=true`;
    console.log(`[Browser] Using Browserless (${browserlessHost})`);
    return url;
  }

  return null;
}

/**
 * Connect to a remote Chrome instance via WebSocket.
 * Works with Browserless, Chrome Remote Desktop, or any WebSocket-based browser service.
 */
async function connectRemoteBrowser(wsEndpoint: string): Promise<Browser> {
  try {
    console.log(`[Browser] Connecting to remote browser: ${maskUrl(wsEndpoint)}`);

    const browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
      ignoreHTTPSErrors: true,
      defaultViewport: { width: 1280, height: 720 },
    });

    console.log(`[Browser] Connected to remote browser successfully`);
    return browser;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Browser] Remote connection failed: ${message}`);
    throw new Error(
      `Failed to connect to remote browser: ${message}. ` +
      `Check your BROWSER_WS_ENDPOINT or BROWSERLESS_TOKEN.`
    );
  }
}

/**
 * Mask the token in URLs for logging
 */
function maskUrl(url: string): string {
  return url.replace(/token=[^&]+/, "token=***");
}

// ── @sparticuz/chromium (Vercel Fallback) ─────────────────────────

async function launchSparticuzBrowser(): Promise<Browser> {
  try {
    const chromium = await import("@sparticuz/chromium");
    const chromMod = chromium.default ?? chromium;
    const executablePath = await chromMod.executablePath();

    console.log(`[Browser] Sparticuz executable path: ${executablePath ? "resolved" : "missing"}`);

    if (!executablePath) {
      throw new Error("Sparticuz Chromium binary not found — set BROWSERLESS_TOKEN for remote browser");
    }

    const browser = await puppeteer.launch({
      args: [
        ...chromMod.args,
        "--hide-scrollbars",
        "--disable-web-security",
      ],
      defaultViewport: chromMod.defaultViewport,
      executablePath,
      headless: chromMod.headless,
      ignoreHTTPSErrors: true,
    });

    console.log(`[Browser] Sparticuz Chromium launched`);
    return browser;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Browser] Sparticuz launch failed: ${message}`);
    throw new Error(
      `Chromium launch failed on Vercel: ${message}. ` +
      `Set BROWSERLESS_TOKEN in your Vercel env vars to use a remote browser service. ` +
      `Free tier at https://www.browserless.io/`
    );
  }
}

// ── Local Browser ──────────────────────────────────────────────────

async function launchLocalBrowser(): Promise<Browser> {
  let executablePath: string | undefined;
  const possiblePaths = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ];

  const fs = await import("fs");
  for (const path of possiblePaths) {
    try {
      if (fs.existsSync(path)) {
        executablePath = path;
        console.log(`[Browser] Found local browser at: ${path}`);
        break;
      }
    } catch {
      // Skip
    }
  }

  if (!executablePath) {
    // Try @sparticuz/chromium as local fallback
    try {
      const chromium = await import("@sparticuz/chromium");
      const chromMod = chromium.default ?? chromium;
      executablePath = await chromMod.executablePath();
    } catch {
      // Not available
    }
  }

  if (!executablePath) {
    throw new Error(
      "No browser found. Set BROWSERLESS_TOKEN for remote browser, or install Chrome locally."
    );
  }

  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
      "--hide-scrollbars",
    ],
    defaultViewport: { width: 1280, height: 720 },
    executablePath,
    headless: true,
  });

  console.log(`[Browser] Local browser launched`);
  return browser;
}

// ── Diagnostics ────────────────────────────────────────────────────

/**
 * Check browser availability and return diagnostics.
 * Used by /api/browser/check for troubleshooting.
 */
export async function checkBrowserAvailability(): Promise<BrowserDiagnostics> {
  const isVercel = !!process.env.VERCEL;
  const wsEndpoint = getBrowserWSEndpoint();

  // If we have a remote endpoint, try a quick connection test
  if (wsEndpoint) {
    try {
      const browser = await puppeteer.connect({
        browserWSEndpoint: wsEndpoint,
        ignoreHTTPSErrors: true,
      });
      // Quick check: can we open a page?
      const page = await browser.newPage();
      await page.close();
      // Disconnect (don't close — we connected, not launched)
      browser.disconnect();

      return {
        available: true,
        mode: process.env.BROWSER_WS_ENDPOINT ? "remote-ws" : "browserless",
        isVercel,
        nodeVersion: process.version,
        wsEndpoint: maskUrl(wsEndpoint),
      };
    } catch (error) {
      return {
        available: false,
        mode: process.env.BROWSER_WS_ENDPOINT ? "remote-ws" : "browserless",
        isVercel,
        nodeVersion: process.version,
        wsEndpoint: maskUrl(wsEndpoint),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Check Sparticuz
  try {
    const chromium = await import("@sparticuz/chromium");
    const chromMod = chromium.default ?? chromium;
    const executablePath = await chromMod.executablePath();

    return {
      available: !!executablePath,
      mode: "sparticuz",
      isVercel,
      nodeVersion: process.version,
    };
  } catch (error) {
    return {
      available: false,
      mode: "unavailable",
      isVercel,
      nodeVersion: process.version,
      error: "No remote browser configured and Sparticuz Chromium unavailable. Set BROWSERLESS_TOKEN.",
    };
  }
}

// ── Browse Page ────────────────────────────────────────────────────

/**
 * Navigate to a URL, wait for it to load, take a screenshot
 */
export async function browsePage(options: BrowseOptions): Promise<BrowseResult> {
  const {
    url,
    width = 1280,
    height = 720,
    waitFor = 3000,
    fullPage = false,
    selector,
  } = options;

  const managed = await getBrowserInstance();

  try {
    const page = await managed.browser.newPage();

    await page.setViewport({ width, height });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    if (selector) {
      await page.waitForSelector(selector, { timeout: 10000 });
    } else if (waitFor > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitFor));
    }

    const title = await page.title();
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href]"))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => href.startsWith("http"))
        .slice(0, 50);
    });
    const html = await page.evaluate(() => {
      return document.documentElement.outerHTML.substring(0, 50000);
    });
    const screenshotBuffer = await page.screenshot({ type: "png", fullPage });

    await page.close();

    return {
      url,
      title,
      screenshot: screenshotBuffer.toString("base64"),
      viewport: { width, height },
      timestamp: new Date().toISOString(),
      links,
      html,
    };
  } finally {
    await cleanupBrowser(managed);
  }
}

/**
 * Navigate through multiple pages sequentially
 */
export async function browseMultiplePages(
  urls: string[],
  options: Omit<BrowseOptions, "url"> = {}
): Promise<BrowseResult[]> {
  const results: BrowseResult[] = [];
  const managed = await getBrowserInstance();

  try {
    for (const url of urls) {
      const page = await managed.browser.newPage();
      try {
        await page.setViewport({
          width: options.width ?? 1280,
          height: options.height ?? 720,
        });
        await page.setUserAgent(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

        if (options.waitFor && options.waitFor > 0) {
          await new Promise((resolve) => setTimeout(resolve, options.waitFor));
        }

        const title = await page.title();
        const links = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("a[href]"))
            .map((a) => (a as HTMLAnchorElement).href)
            .filter((href) => href.startsWith("http"))
            .slice(0, 50);
        });
        const screenshotBuffer = await page.screenshot({
          type: "png",
          fullPage: options.fullPage ?? false,
        });

        results.push({
          url,
          title,
          screenshot: screenshotBuffer.toString("base64"),
          viewport: { width: options.width ?? 1280, height: options.height ?? 720 },
          timestamp: new Date().toISOString(),
          links,
          html: "",
        });
      } catch (error) {
        results.push({
          url,
          title: `Error: ${error}`,
          screenshot: "",
          viewport: { width: 1280, height: 720 },
          timestamp: new Date().toISOString(),
          links: [],
          html: "",
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await cleanupBrowser(managed);
  }

  return results;
}

// ── Browser Instance Manager (exported for test-executor) ─────────

export interface ManagedBrowser {
  browser: Browser;
  isRemote: boolean; // true = connected via WebSocket, false = launched locally
}

/**
 * Get a browser instance with metadata about whether it's remote or local.
 * Use this with cleanupBrowser() for proper resource management.
 */
export async function getBrowserInstance(): Promise<ManagedBrowser> {
  const wsEndpoint = getBrowserWSEndpoint();
  if (wsEndpoint) {
    const browser = await connectRemoteBrowser(wsEndpoint);
    return { browser, isRemote: true };
  }
  const browser = await launchBrowser();
  return { browser, isRemote: false };
}

/**
 * Clean up browser: disconnect if remote, close if local.
 * Always safe to call — catches and ignores errors.
 */
export async function cleanupBrowser(managed: ManagedBrowser): Promise<void> {
  try {
    if (managed.isRemote) {
      managed.browser.disconnect();
      console.log(`[Browser] Disconnected from remote browser`);
    } else {
      await managed.browser.close();
      console.log(`[Browser] Closed local browser`);
    }
  } catch {
    // Ignore cleanup errors
  }
}
