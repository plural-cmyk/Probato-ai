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
 */
export async function launchBrowser(): Promise<Browser> {
  const isVercel = !!process.env.VERCEL;

  if (isVercel) {
    // Serverless: use @sparticuz/chromium
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  // Local dev: try to find a local Chrome/Chromium installation
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
        break;
      }
    } catch {
      // Skip
    }
  }

  if (!executablePath) {
    // Fall back to @sparticuz/chromium even locally
    executablePath = await chromium.executablePath();
  }

  return puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
    ],
    defaultViewport: { width: 1280, height: 720 },
    executablePath,
    headless: true,
  });
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
