/**
 * Probato Visual Regression Engine
 *
 * Core image comparison engine for visual regression testing.
 * Uses Sharp (already installed) for pixel-level image comparison.
 *
 * Capabilities:
 * - Compare two PNG screenshots pixel-by-pixel
 * - Generate diff images highlighting differences (red overlay)
 * - Configurable per-pixel threshold (anti-aliasing tolerance)
 * - Return mismatch percentage and pixel counts
 * - Handle different image sizes (resize before comparison)
 */

import sharp from "sharp";

// ── Types ──────────────────────────────────────────────────────────

export interface CompareOptions {
  /** Per-pixel difference threshold (0-1). Pixels with difference below this are ignored. Default: 0.1 */
  threshold?: number;
  /** Diff image highlight color as [R, G, B]. Default: [255, 0, 0] (red) */
  diffColor?: [number, number, number];
  /** Maximum allowed mismatch percentage (0-100). If exceeded, comparison "fails". Default: 0 (any difference) */
  maxMismatchPercent?: number;
}

export interface CompareResult {
  /** Whether the images match within the maxMismatchPercent threshold */
  match: boolean;
  /** Percentage of pixels that differ (0-100) */
  mismatchPercent: number;
  /** Raw number of pixels that differ */
  mismatchPixels: number;
  /** Total number of pixels compared */
  totalPixels: number;
  /** Width of the compared images (after normalization) */
  width: number;
  /** Height of the compared images (after normalization) */
  height: number;
  /** Base64-encoded PNG of the diff image (red highlights on transparent overlay) */
  diffImageBase64: string;
}

// ── Main Comparison Function ──────────────────────────────────────

/**
 * Compare two base64-encoded PNG screenshots pixel-by-pixel.
 *
 * Process:
 * 1. Decode both images from base64
 * 2. Resize to match dimensions (use the baseline's dimensions)
 * 3. Extract raw pixel data (RGBA)
 * 4. Compare each pixel, marking differences above threshold
 * 5. Generate a diff image highlighting changed pixels
 * 6. Return mismatch statistics and diff image
 */
export async function compareScreenshots(
  baselineBase64: string,
  currentBase64: string,
  options: CompareOptions = {}
): Promise<CompareResult> {
  const threshold = options.threshold ?? 0.1;
  const diffColor = options.diffColor ?? [255, 0, 0];
  const maxMismatchPercent = options.maxMismatchPercent ?? 0;

  // Decode base64 to buffers
  const baselineBuffer = Buffer.from(baselineBase64, "base64");
  const currentBuffer = Buffer.from(currentBase64, "base64");

  // Get metadata for both images
  const baselineMeta = await sharp(baselineBuffer).metadata();
  const currentMeta = await sharp(currentBuffer).metadata();

  // Use baseline dimensions as the reference size
  const width = baselineMeta.width ?? 1280;
  const height = baselineMeta.height ?? 720;

  // Resize both images to the same dimensions and ensure RGBA format
  const baselineRaw = await sharp(baselineBuffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const currentRaw = await sharp(currentBuffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const totalPixels = width * height;
  const channels = 4; // RGBA
  let mismatchPixels = 0;

  // Create diff image buffer (same size, RGBA)
  const diffBuffer = Buffer.alloc(totalPixels * channels);

  // Compare pixel by pixel
  for (let i = 0; i < totalPixels; i++) {
    const offset = i * channels;
    const bR = baselineRaw[offset];
    const bG = baselineRaw[offset + 1];
    const bB = baselineRaw[offset + 2];
    const bA = baselineRaw[offset + 3];

    const cR = currentRaw[offset];
    const cG = currentRaw[offset + 1];
    const cB = currentRaw[offset + 2];
    const cA = currentRaw[offset + 3];

    // Calculate per-pixel difference (0-1 scale)
    const diff = pixelDifference(bR, bG, bB, bA, cR, cG, cB, cA);

    if (diff > threshold) {
      mismatchPixels++;
      // Mark this pixel in the diff image with the highlight color
      diffBuffer[offset] = diffColor[0];     // R
      diffBuffer[offset + 1] = diffColor[1]; // G
      diffBuffer[offset + 2] = diffColor[2]; // B
      diffBuffer[offset + 3] = 200;          // Semi-transparent
    } else {
      // No difference — make pixel transparent
      diffBuffer[offset] = 0;
      diffBuffer[offset + 1] = 0;
      diffBuffer[offset + 2] = 0;
      diffBuffer[offset + 3] = 0;
    }
  }

  // Encode diff image to PNG
  const diffPng = await sharp(diffBuffer, {
    raw: { width, height, channels },
  })
    .png()
    .toBuffer();

  const mismatchPercent = totalPixels > 0
    ? (mismatchPixels / totalPixels) * 100
    : 0;

  return {
    match: mismatchPercent <= maxMismatchPercent,
    mismatchPercent: Math.round(mismatchPercent * 100) / 100, // Round to 2 decimal places
    mismatchPixels,
    totalPixels,
    width,
    height,
    diffImageBase64: diffPng.toString("base64"),
  };
}

// ── Composite Diff Image ──────────────────────────────────────────

/**
 * Create a composite image showing the baseline, current, and diff side by side.
 * Useful for visual review in the dashboard.
 */
export async function createCompositeDiff(
  baselineBase64: string,
  currentBase64: string,
  diffImageBase64: string
): Promise<string> {
  const baselineBuffer = Buffer.from(baselineBase64, "base64");
  const currentBuffer = Buffer.from(currentBase64, "base64");
  const diffBuffer = Buffer.from(diffImageBase64, "base64");

  const baselineMeta = await sharp(baselineBuffer).metadata();
  const width = baselineMeta.width ?? 1280;
  const height = baselineMeta.height ?? 720;

  // Resize all to same dimensions
  const resizedBaseline = await sharp(baselineBuffer)
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();

  const resizedCurrent = await sharp(currentBuffer)
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();

  const resizedDiff = await sharp(diffBuffer)
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();

  // Create composite: diff overlay on current screenshot
  const composite = await sharp(resizedCurrent)
    .composite([
      {
        input: resizedDiff,
        blend: "over",
      },
    ])
    .png()
    .toBuffer();

  return composite.toString("base64");
}

// ── Helper: Capture Screenshot for Visual Regression ──────────────

/**
 * Capture a screenshot from a URL using Puppeteer, designed for visual regression.
 * Returns a full-page or element-specific screenshot as base64 PNG.
 */
export async function captureForVisualRegression(params: {
  url: string;
  selector?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  fullPage?: boolean;
  waitForSelector?: string;
  waitMs?: number;
}): Promise<string> {
  // Dynamic import to avoid loading puppeteer in test environments
  const { getBrowserInstance, cleanupBrowser } = await import("@/lib/browser/chromium");

  const {
    url,
    selector,
    viewportWidth = 1280,
    viewportHeight = 720,
    fullPage = false,
    waitForSelector: waitSelector,
    waitMs = 2000,
  } = params;

  let managed: Awaited<ReturnType<typeof getBrowserInstance>> | null = null;

  try {
    managed = await getBrowserInstance();
    const page = await managed.browser.newPage();

    await page.setViewport({ width: viewportWidth, height: viewportHeight });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for specific selector if provided
    if (waitSelector) {
      await page.waitForSelector(waitSelector, { timeout: 10000 }).catch(() => {});
    }

    // Brief settle time for rendering
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    let screenshotBuffer: Buffer;

    if (selector) {
      // Element-specific screenshot
      const element = await page.$(selector);
      if (!element) {
        throw new Error(`Element not found for visual capture: ${selector}`);
      }
      screenshotBuffer = await element.screenshot({ type: "png" }) as Buffer;
    } else {
      // Full page or viewport screenshot
      screenshotBuffer = await page.screenshot({
        type: "png",
        fullPage,
      }) as Buffer;
    }

    return screenshotBuffer.toString("base64");
  } finally {
    if (managed) {
      await cleanupBrowser(managed);
    }
  }
}

// ── Pixel Difference Calculation ──────────────────────────────────

/**
 * Calculate the difference between two pixels (0-1 scale).
 * Uses Euclidean distance in RGBA space, normalized to 0-1.
 */
function pixelDifference(
  bR: number, bG: number, bB: number, bA: number,
  cR: number, cG: number, cB: number, cA: number
): number {
  const dR = Math.abs(bR - cR) / 255;
  const dG = Math.abs(bG - cG) / 255;
  const dB = Math.abs(bB - cB) / 255;
  const dA = Math.abs(bA - cA) / 255;

  // Weighted average: RGB channels have more weight than alpha
  const diff = (dR * 0.3 + dG * 0.59 + dB * 0.11) * 0.85 + dA * 0.15;
  return diff;
}

// ── Utility: Generate a blank placeholder image ───────────────────

/**
 * Generate a blank white PNG of the given dimensions.
 * Useful for creating placeholder baselines or test images.
 */
export async function generateBlankImage(
  width: number = 1280,
  height: number = 720
): Promise<string> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  return buffer.toString("base64");
}

// ── Utility: Get image dimensions from base64 ─────────────────────

/**
 * Get the dimensions of a base64-encoded PNG image.
 */
export async function getImageDimensions(
  imageBase64: string
): Promise<{ width: number; height: number }> {
  const buffer = Buffer.from(imageBase64, "base64");
  const meta = await sharp(buffer).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

// ── Utility: Resize a base64 image ────────────────────────────────

/**
 * Resize a base64-encoded PNG image to the given dimensions.
 */
export async function resizeImage(
  imageBase64: string,
  width: number,
  height: number
): Promise<string> {
  const buffer = Buffer.from(imageBase64, "base64");
  const resized = await sharp(buffer)
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
  return resized.toString("base64");
}
