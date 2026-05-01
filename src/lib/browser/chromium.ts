import chromium from "@sparticuz/chromium";
import puppeteer, { Browser, Page } from "puppeteer-core";

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
  waitFor?: number; // ms to wait for page load
  fullPage?: boolean;
  selector?: string; // wait for specific selector
}

/**
 * Launch a headless Chromium browser on serverless (Vercel) or local
 *
 * Strategy:
 * 1. On Vercel: use @sparticuz/chromium (serverless-optimized Chromium binary)
 * 2. Local dev: try to find a local Chrome/Chromium installation
 * 3. Fallback: use @sparticuz/chromium even locally
 */
export async function launchBrowser(): Promise<Browser> {
  const isVercel = !!process.env.VERCEL;

  console.log(`[Chromium] Launching browser (Vercel: ${isVercel}, Node: ${process.version})`);

  if (isVercel) {
    return launchVercelBrowser();
  }

  return launchLocalBrowser();
}

/**
 * Launch Chromium on Vercel serverless using @sparticuz/chromium
 */
async function launchVercelBrowser(): Promise<Browser> {
  try {
    const executablePath = await chromium.executablePath();
    console.log(`[Chromium] Vercel executable path: ${executablePath ? 'resolved' : 'missing'}`);

    if (!executablePath) {
      throw new Error("Chromium executable path not found — @sparticuz/chromium may not be bundled correctly");
    }

    const browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--hide-scrollbars",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    console.log(`[Chromium] Browser launched successfully on Vercel`);
    return browser;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Chromium] Vercel launch failed: ${message}`);

    // Provide a helpful error message
    throw new Error(
      `Chromium launch failed on Vercel: ${message}. ` +
      `This usually means the @sparticuz/chromium binary was not bundled correctly. ` +
      `Ensure the function has enough memory (2048MB+) and maxDuration (60s+).`
    );
  }
}

/**
 * Launch Chromium locally — try local installations first, then fall back to @sparticuz/chromium
 */
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
        console.log(`[Chromium] Found local browser at: ${path}`);
        break;
      }
    } catch {
      // Skip
    }
  }

  if (!executablePath) {
    // Fall back to @sparticuz/chromium even locally
    console.log(`[Chromium] No local browser found, trying @sparticuz/chromium`);
    try {
      executablePath = await chromium.executablePath();
    } catch (err) {
      console.warn(`[Chromium] @sparticuz/chromium fallback failed:`, err);
    }
  }

  if (!executablePath) {
    throw new Error(
      "No Chromium/Chrome browser found. Install Chrome or ensure @sparticuz/chromium is available."
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

  console.log(`[Chromium] Local browser launched successfully`);
  return browser;
}

/**
 * Check if a Chromium browser is available for launch
 * Returns diagnostics about the browser environment
 */
export async function checkBrowserAvailability(): Promise<{
  available: boolean;
  isVercel: boolean;
  nodeVersion: string;
  executablePath: string | null;
  error?: string;
}> {
  const isVercel = !!process.env.VERCEL;

  try {
    const executablePath = await chromium.executablePath();
    return {
      available: !!executablePath,
      isVercel,
      nodeVersion: process.version,
      executablePath: executablePath ?? null,
    };
  } catch (error) {
    return {
      available: false,
      isVercel,
      nodeVersion: process.version,
      executablePath: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

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

  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width, height });

    // Set a reasonable user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Navigate
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for specific selector or a settling period
    if (selector) {
      await page.waitForSelector(selector, { timeout: 10000 });
    } else if (waitFor > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitFor));
    }

    // Extract page info
    const title = await page.title();

    // Get all links on the page
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href]"))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => href.startsWith("http"))
        .slice(0, 50); // Limit to 50 links
    });

    // Get trimmed HTML (first 50000 chars to avoid massive responses)
    const html = await page.evaluate(() => {
      return document.documentElement.outerHTML.substring(0, 50000);
    });

    // Take screenshot
    const screenshotBuffer = await page.screenshot({
      type: "png",
      fullPage,
    });

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
    if (browser) {
      await browser.close();
    }
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
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();

    for (const url of urls) {
      const page = await browser.newPage();
      try {
        await page.setViewport({
          width: options.width ?? 1280,
          height: options.height ?? 720,
        });

        await page.setUserAgent(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );

        await page.goto(url, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

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
          viewport: {
            width: options.width ?? 1280,
            height: options.height ?? 720,
          },
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
    if (browser) {
      await browser.close();
    }
  }

  return results;
}
