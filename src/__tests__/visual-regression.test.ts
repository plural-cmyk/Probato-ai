/**
 * Visual Regression Engine Tests
 *
 * Tests for the pixel-level image comparison engine using Sharp.
 * Tests cover: comparison logic, threshold handling, diff image generation,
 * utility functions, and edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  compareScreenshots,
  createCompositeDiff,
  generateBlankImage,
  getImageDimensions,
  resizeImage,
} from "@/lib/visual/compare";
import sharp from "sharp";

// ── Test Helpers ──────────────────────────────────────────────────

/**
 * Generate a solid-color PNG image of the given dimensions.
 * Returns a base64-encoded string.
 */
async function createSolidImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a: number = 255
): Promise<string> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r, g, b, alpha: a / 255 },
    },
  })
    .png()
    .toBuffer();

  return buffer.toString("base64");
}

// ── Comparison Tests ──────────────────────────────────────────────

describe("Visual Comparison Engine", () => {
  describe("compareScreenshots", () => {
    it("should return 0% mismatch for identical images", async () => {
      const image = await createSolidImage(100, 100, 255, 0, 0);
      const result = await compareScreenshots(image, image);

      expect(result.match).toBe(true);
      expect(result.mismatchPercent).toBe(0);
      expect(result.mismatchPixels).toBe(0);
      expect(result.totalPixels).toBe(100 * 100);
    });

    it("should detect 100% mismatch between completely different images", async () => {
      const redImage = await createSolidImage(50, 50, 255, 0, 0);
      const blueImage = await createSolidImage(50, 50, 0, 0, 255);
      const result = await compareScreenshots(redImage, blueImage);

      expect(result.match).toBe(false);
      expect(result.mismatchPercent).toBe(100);
      expect(result.mismatchPixels).toBe(50 * 50);
    });

    it("should respect the threshold parameter", async () => {
      // Create two slightly different images (small color difference)
      const image1 = await createSolidImage(100, 100, 100, 100, 100);
      const image2 = await createSolidImage(100, 100, 105, 105, 105);

      // With a very low threshold (0.01), should detect differences
      const strictResult = await compareScreenshots(image1, image2, {
        threshold: 0.01,
      });
      expect(strictResult.mismatchPercent).toBeGreaterThan(0);

      // With a high threshold (0.5), should ignore small differences
      const lenientResult = await compareScreenshots(image1, image2, {
        threshold: 0.5,
      });
      expect(lenientResult.mismatchPercent).toBe(0);
      expect(lenientResult.mismatchPixels).toBe(0);
    });

    it("should respect maxMismatchPercent", async () => {
      const redImage = await createSolidImage(100, 100, 255, 0, 0);
      const blueImage = await createSolidImage(100, 100, 0, 0, 255);

      // With 100% allowed mismatch, should match
      const result100 = await compareScreenshots(redImage, blueImage, {
        maxMismatchPercent: 100,
      });
      expect(result100.match).toBe(true);

      // With 0% allowed mismatch, should not match
      const result0 = await compareScreenshots(redImage, blueImage, {
        maxMismatchPercent: 0,
      });
      expect(result0.match).toBe(false);
    });

    it("should generate a diff image", async () => {
      const redImage = await createSolidImage(50, 50, 255, 0, 0);
      const blueImage = await createSolidImage(50, 50, 0, 0, 255);
      const result = await compareScreenshots(redImage, blueImage);

      expect(result.diffImageBase64).toBeTruthy();
      // Diff image should be a valid PNG
      const diffBuffer = Buffer.from(result.diffImageBase64, "base64");
      const meta = await sharp(diffBuffer).metadata();
      expect(meta.width).toBe(50);
      expect(meta.height).toBe(50);
      expect(meta.format).toBe("png");
    });

    it("should produce a transparent diff for identical images", async () => {
      const image = await createSolidImage(30, 30, 128, 128, 128);
      const result = await compareScreenshots(image, image);

      // The diff image should have all transparent pixels (no red)
      const diffBuffer = Buffer.from(result.diffImageBase64, "base64");
      const raw = await sharp(diffBuffer).ensureAlpha().raw().toBuffer();
      // Check that alpha channel is 0 for all pixels (transparent)
      let allTransparent = true;
      for (let i = 3; i < raw.length; i += 4) {
        if (raw[i] !== 0) {
          allTransparent = false;
          break;
        }
      }
      expect(allTransparent).toBe(true);
    });

    it("should produce red pixels in diff for different images", async () => {
      const redImage = await createSolidImage(30, 30, 255, 0, 0);
      const blueImage = await createSolidImage(30, 30, 0, 0, 255);
      const result = await compareScreenshots(redImage, blueImage, {
        diffColor: [255, 0, 0],
      });

      const diffBuffer = Buffer.from(result.diffImageBase64, "base64");
      const raw = await sharp(diffBuffer).ensureAlpha().raw().toBuffer();
      // Check that some pixels have the red diff color with non-zero alpha
      let hasRedDiff = false;
      for (let i = 0; i < raw.length; i += 4) {
        if (raw[i + 3] > 0 && raw[i] === 255) {
          hasRedDiff = true;
          break;
        }
      }
      expect(hasRedDiff).toBe(true);
    });

    it("should handle images of different sizes by resizing to baseline", async () => {
      const smallImage = await createSolidImage(50, 50, 255, 0, 0);
      const largeImage = await createSolidImage(200, 200, 255, 0, 0);
      const result = await compareScreenshots(smallImage, largeImage);

      // Both should be resized to the baseline dimensions (50x50)
      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
      expect(result.totalPixels).toBe(50 * 50);
      // Same color after resize, so should match
      expect(result.mismatchPercent).toBe(0);
    });

    it("should use custom diff color when specified", async () => {
      const redImage = await createSolidImage(20, 20, 255, 0, 0);
      const blueImage = await createSolidImage(20, 20, 0, 0, 255);
      const result = await compareScreenshots(redImage, blueImage, {
        diffColor: [0, 255, 0], // Green diff
      });

      const diffBuffer = Buffer.from(result.diffImageBase64, "base64");
      const raw = await sharp(diffBuffer).ensureAlpha().raw().toBuffer();
      // Check that some pixels have green diff color
      let hasGreenDiff = false;
      for (let i = 0; i < raw.length; i += 4) {
        if (raw[i + 3] > 0 && raw[i + 1] === 255) {
          hasGreenDiff = true;
          break;
        }
      }
      expect(hasGreenDiff).toBe(true);
    });

    it("should round mismatch percent to 2 decimal places", async () => {
      const image1 = await createSolidImage(100, 100, 100, 100, 100);
      const image2 = await createSolidImage(100, 100, 200, 100, 100);
      const result = await compareScreenshots(image1, image2);

      // Verify rounding
      const decimalPart = result.mismatchPercent.toString().split(".")[1];
      if (decimalPart) {
        expect(decimalPart.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe("createCompositeDiff", () => {
    it("should return a valid base64 PNG", async () => {
      const image = await createSolidImage(50, 50, 128, 128, 128);
      // Create a diff image (all transparent)
      const diffBuffer = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();

      const composite = await createCompositeDiff(
        image,
        image,
        diffBuffer.toString("base64")
      );

      expect(composite).toBeTruthy();
      const compositeBuffer = Buffer.from(composite, "base64");
      const meta = await sharp(compositeBuffer).metadata();
      expect(meta.format).toBe("png");
    });
  });

  describe("generateBlankImage", () => {
    it("should generate a white PNG of the specified dimensions", async () => {
      const base64 = await generateBlankImage(640, 480);
      expect(base64).toBeTruthy();

      const buffer = Buffer.from(base64, "base64");
      const meta = await sharp(buffer).metadata();
      expect(meta.width).toBe(640);
      expect(meta.height).toBe(480);
      expect(meta.format).toBe("png");
    });

    it("should default to 1280x720 when no dimensions specified", async () => {
      const base64 = await generateBlankImage();
      const buffer = Buffer.from(base64, "base64");
      const meta = await sharp(buffer).metadata();
      expect(meta.width).toBe(1280);
      expect(meta.height).toBe(720);
    });
  });

  describe("getImageDimensions", () => {
    it("should return correct dimensions", async () => {
      const image = await createSolidImage(200, 150, 0, 0, 0);
      const dims = await getImageDimensions(image);
      expect(dims.width).toBe(200);
      expect(dims.height).toBe(150);
    });
  });

  describe("resizeImage", () => {
    it("should resize an image to the given dimensions", async () => {
      const image = await createSolidImage(200, 150, 128, 128, 128);
      const resized = await resizeImage(image, 100, 75);
      const dims = await getImageDimensions(resized);
      expect(dims.width).toBe(100);
      expect(dims.height).toBe(75);
    });
  });

  describe("Edge Cases", () => {
    it("should handle 1x1 pixel images", async () => {
      const image1 = await createSolidImage(1, 1, 0, 0, 0);
      const image2 = await createSolidImage(1, 1, 255, 255, 255);
      const result = await compareScreenshots(image1, image2);

      expect(result.totalPixels).toBe(1);
      expect(result.mismatchPercent).toBe(100);
      expect(result.mismatchPixels).toBe(1);
    });

    it("should handle very small differences below threshold", async () => {
      // 1 out of 255 difference in each channel — should be below 0.1 threshold
      const image1 = await createSolidImage(10, 10, 100, 100, 100);
      const image2 = await createSolidImage(10, 10, 101, 101, 101);
      const result = await compareScreenshots(image1, image2, {
        threshold: 0.1,
      });

      expect(result.mismatchPercent).toBe(0);
      expect(result.match).toBe(true);
    });

    it("should handle alpha channel differences", async () => {
      const image1 = await createSolidImage(50, 50, 128, 128, 128, 255);
      const image2 = await createSolidImage(50, 50, 128, 128, 128, 128);
      const result = await compareScreenshots(image1, image2, {
        threshold: 0.01,
      });

      // Alpha channel difference should be detected
      expect(result.mismatchPercent).toBeGreaterThan(0);
    });
  });
});
