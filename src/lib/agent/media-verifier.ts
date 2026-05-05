/**
 * Probato Media Verifier Agent (M21)
 *
 * Verifies media assets on web pages for health and correctness:
 * - Image checks: broken images, hidden images, distorted images, missing alt text
 * - Video checks: missing sources, load failures, playback issues, no audio track
 * - CSS background-image detection and validation
 * - <picture> element support
 * - Optional video frame capture with black-frame detection
 *
 * Uses the same 3-tier LLM strategy as security-scanner.ts:
 * 1. z-ai-web-dev-sdk (primary)
 * 2. External OpenAI-compatible API (fallback)
 * 3. Rule-based fallback (no LLM needed)
 *
 * Follows the same patterns: credit check/deduct, notification dispatch,
 * DB persistence, browser launch/cleanup.
 */

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { checkCredits, deductCredits } from "@/lib/billing/credits";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { getBrowserInstance, cleanupBrowser } from "@/lib/browser/chromium";
import type { Page } from "puppeteer-core";

// ── Types ──────────────────────────────────────────────────────────

export interface ImageCheckResult {
  src: string;           // Image source URL
  status: "ok" | "broken" | "hidden" | "distorted" | "error";
  httpStatus?: number;   // HTTP status code if checkable
  naturalWidth: number;  // Natural (intrinsic) width
  naturalHeight: number; // Natural (intrinsic) height
  displayWidth: number;  // Rendered display width
  displayHeight: number; // Rendered display height
  alt: string;           // Alt text (empty = accessibility issue)
  rendered: boolean;     // Whether image is visible in DOM
  cssHidden: boolean;    // display:none, visibility:hidden, opacity:0
  error?: string;        // Error message if broken
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;   // Human-readable description of the finding
}

export interface VideoCheckResult {
  src: string;
  status: "ok" | "error" | "no_source" | "load_failed" | "playback_failed";
  readyState: number;    // 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
  duration: number;      // -1 if unknown
  error?: string;        // MediaError message
  hasAudio: boolean;     // Whether video has audio track
  hasVideo: boolean;     // Whether video has video track
  frameCaptures: string[]; // Base64 screenshots at key timestamps (optional, max 5)
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
}

export interface MediaVerificationInput {
  projectId?: string;
  userId: string;
  url: string;
  testRunId?: string;
  checkImages?: boolean;   // default true
  checkVideos?: boolean;   // default true
  captureFrames?: boolean; // default false (expensive — captures video frames)
  maxFrames?: number;      // default 5, max 10
}

export interface MediaVerificationResult {
  imageChecks: ImageCheckResult[];
  videoChecks: VideoCheckResult[];
  overallScore: number;
  imageScore: number;
  videoScore: number;
  audioScore: number; // always 0 for M21
  summary: {
    totalImages: number;
    brokenImages: number;
    hiddenImages: number;
    distortedImages: number;
    totalVideos: number;
    errorVideos: number;
    noSourceVideos: number;
  };
  duration: number;
  llmUsed: boolean;
  error?: string;
}

// ── Score Calculation ─────────────────────────────────────────────

function calculateImageScore(checks: ImageCheckResult[]): number {
  if (checks.length === 0) return 100;
  let score = 100;
  for (const check of checks) {
    switch (check.severity) {
      case "critical": score -= 20; break;
      case "high": score -= 10; break;
      case "medium": score -= 5; break;
      case "low": score -= 2; break;
      case "info": score -= 0; break;
    }
  }
  return Math.max(0, Math.min(100, score));
}

function calculateVideoScore(checks: VideoCheckResult[]): number {
  if (checks.length === 0) return 100;
  let score = 100;
  for (const check of checks) {
    switch (check.severity) {
      case "critical": score -= 20; break;
      case "high": score -= 10; break;
      case "medium": score -= 5; break;
      case "low": score -= 2; break;
      case "info": score -= 0; break;
    }
  }
  return Math.max(0, Math.min(100, score));
}

// ── Main Entry Point ──────────────────────────────────────────────

export async function runMediaVerification(
  input: MediaVerificationInput
): Promise<MediaVerificationResult> {
  const startTime = Date.now();

  try {
    // 1. Check credits
    // TODO: Update to "media_verification" action type once billing plan supports it
    const creditCheck = await checkCredits(input.userId, "security_scan");
    if (!creditCheck.hasCredits) {
      return {
        imageChecks: [],
        videoChecks: [],
        overallScore: 0,
        imageScore: 0,
        videoScore: 0,
        audioScore: 0,
        summary: {
          totalImages: 0,
          brokenImages: 0,
          hiddenImages: 0,
          distortedImages: 0,
          totalVideos: 0,
          errorVideos: 0,
          noSourceVideos: 0,
        },
        duration: Date.now() - startTime,
        llmUsed: false,
        error: "Insufficient credits to run media verification",
      };
    }

    // 2. Launch browser
    const managed = await getBrowserInstance();
    let imageChecks: ImageCheckResult[] = [];
    let videoChecks: VideoCheckResult[] = [];
    let llmUsed = false;

    try {
      const page = await managed.browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // 3. Navigate to URL
      await page.goto(input.url, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });

      // Extra wait for lazy-loaded images/videos
      await new Promise((r) => setTimeout(r, 1500));

      // 4. Run image checks
      const shouldCheckImages = input.checkImages !== false;
      if (shouldCheckImages) {
        imageChecks = await performImageChecks(page);
      }

      // 5. Run video checks
      const shouldCheckVideos = input.checkVideos !== false;
      if (shouldCheckVideos) {
        const captureFrames = input.captureFrames === true;
        const maxFrames = Math.min(Math.max(input.maxFrames ?? 5, 1), 10);
        videoChecks = await performVideoChecks(page, captureFrames, maxFrames);
      }

      await page.close();
    } finally {
      await cleanupBrowser(managed);
    }

    // 6. Try LLM analysis for deeper insights (3-tier strategy)
    try {
      const llmResult = await callLLMForMediaAnalysis(
        input.url,
        imageChecks,
        videoChecks
      );
      if (llmResult.extraImageChecks.length > 0) {
        imageChecks = [...imageChecks, ...llmResult.extraImageChecks];
      }
      if (llmResult.extraVideoChecks.length > 0) {
        videoChecks = [...videoChecks, ...llmResult.extraVideoChecks];
      }
      if (llmResult.extraImageChecks.length > 0 || llmResult.extraVideoChecks.length > 0) {
        llmUsed = true;
      }
    } catch (error) {
      console.warn("[Media-Verifier] LLM failed, using rule-based findings only:", error);
    }

    // 7. Calculate scores
    const iScore = calculateImageScore(imageChecks);
    const vScore = calculateVideoScore(videoChecks);

    // overallScore = average of imageScore and videoScore, only counting categories that had elements
    const scores: number[] = [];
    if (imageChecks.length > 0) scores.push(iScore);
    if (videoChecks.length > 0) scores.push(vScore);
    const overallScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 100; // No media = perfect score

    // Build summary
    const summary = {
      totalImages: imageChecks.length,
      brokenImages: imageChecks.filter((c) => c.status === "broken").length,
      hiddenImages: imageChecks.filter((c) => c.status === "hidden").length,
      distortedImages: imageChecks.filter((c) => c.status === "distorted").length,
      totalVideos: videoChecks.length,
      errorVideos: videoChecks.filter((c) => c.status === "error" || c.status === "load_failed" || c.status === "playback_failed").length,
      noSourceVideos: videoChecks.filter((c) => c.status === "no_source").length,
    };

    // 8. Deduct credits
    try {
      await deductCredits(
        input.userId,
        "security_scan", // TODO: Update to "media_verification" once billing plan supports it
        `Media verification for ${input.url}`,
        undefined,
        undefined
      );
    } catch (creditError) {
      console.warn("[Media-Verifier] Credit deduction failed:", creditError);
    }

    // 9. Persist to DB
    let verificationId: string | undefined;
    try {
      const verification = await db.mediaVerification.create({
        data: {
          status: "completed",
          url: input.url,
          overallScore,
          imageScore: iScore,
          videoScore: vScore,
          audioScore: 0,
          imageChecks: imageChecks as any,
          videoChecks: videoChecks as any,
          audioChecks: [],
          summary: summary as any,
          llmUsed,
          duration: Date.now() - startTime,
          projectId: input.projectId ?? null,
          userId: input.userId,
          testRunId: input.testRunId ?? null,
        },
      });
      verificationId = verification.id;
    } catch (dbError) {
      console.warn("[Media-Verifier] Failed to persist verification:", dbError);
    }

    // 10. Dispatch notification if critical/high findings
    const criticalOrHigh = [
      ...imageChecks.filter((c) => c.severity === "critical" || c.severity === "high"),
      ...videoChecks.filter((c) => c.severity === "critical" || c.severity === "high"),
    ];

    if (criticalOrHigh.length > 0) {
      try {
        const criticalCount = criticalOrHigh.filter((c) => c.severity === "critical").length;
        const highCount = criticalOrHigh.filter((c) => c.severity === "high").length;

        await dispatchNotification({
          type: "media_issue",
          title: `Media issues found: ${input.url}`,
          message: `${criticalOrHigh.length} media issue(s) detected. ${criticalCount} critical, ${highCount} high severity.`,
          userId: input.userId,
          projectId: input.projectId,
          testRunId: input.testRunId,
          actionUrl: input.projectId
            ? `/dashboard/projects/${input.projectId}`
            : undefined,
          priority: criticalCount > 0 ? "critical" : "high",
          metadata: {
            verificationId,
            overallScore,
            criticalCount,
            highCount,
            totalImages: summary.totalImages,
            totalVideos: summary.totalVideos,
          },
        });
      } catch (notifError) {
        console.warn("[Media-Verifier] Notification dispatch failed:", notifError);
      }
    }

    // 11. Return result
    return {
      imageChecks,
      videoChecks,
      overallScore,
      imageScore: iScore,
      videoScore: vScore,
      audioScore: 0,
      summary,
      duration: Date.now() - startTime,
      llmUsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Media-Verifier] Failed:", message);

    // Try to persist as failed
    try {
      await db.mediaVerification.create({
        data: {
          status: "failed",
          url: input.url,
          overallScore: 0,
          imageScore: 0,
          videoScore: 0,
          audioScore: 0,
          imageChecks: [],
          videoChecks: [],
          audioChecks: [],
          summary: {},
          duration: Date.now() - startTime,
          error: message,
          projectId: input.projectId ?? null,
          userId: input.userId,
          testRunId: input.testRunId ?? null,
        },
      });
    } catch (dbError) {
      console.warn("[Media-Verifier] Failed to persist error state:", dbError);
    }

    return {
      imageChecks: [],
      videoChecks: [],
      overallScore: 0,
      imageScore: 0,
      videoScore: 0,
      audioScore: 0,
      summary: {
        totalImages: 0,
        brokenImages: 0,
        hiddenImages: 0,
        distortedImages: 0,
        totalVideos: 0,
        errorVideos: 0,
        noSourceVideos: 0,
      },
      duration: Date.now() - startTime,
      llmUsed: false,
      error: message,
    };
  }
}

// ── Image Checks ──────────────────────────────────────────────────

/**
 * Perform comprehensive image checks on the page.
 * Checks <img>, <picture>, and CSS background-images.
 */
async function performImageChecks(page: Page): Promise<ImageCheckResult[]> {
  const results: ImageCheckResult[] = [];

  // 1. Check all <img> elements
  const imgResults = await page.evaluate(() => {
    const checks: Array<{
      src: string;
      status: "ok" | "broken" | "hidden" | "distorted" | "error";
      naturalWidth: number;
      naturalHeight: number;
      displayWidth: number;
      displayHeight: number;
      alt: string;
      rendered: boolean;
      cssHidden: boolean;
      error?: string;
      severity: "critical" | "high" | "medium" | "low" | "info";
      description: string;
    }> = [];

    const images = Array.from(document.querySelectorAll("img"));

    for (const img of images) {
      const src = img.src || img.getAttribute("src") || "";
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const displayWidth = img.clientWidth;
      const displayHeight = img.clientHeight;
      const alt = img.alt || "";
      const complete = img.complete;

      // Check CSS visibility
      const computedStyle = getComputedStyle(img);
      const displayNone = computedStyle.display === "none";
      const visibilityHidden = computedStyle.visibility === "hidden";
      const opacityZero = parseFloat(computedStyle.opacity) === 0;
      const cssHidden = displayNone || visibilityHidden || opacityZero;
      const rendered = !cssHidden;

      // Determine status and severity
      let status: ImageCheckResult["status"] = "ok";
      let severity: ImageCheckResult["severity"] = "info";
      let description = "";
      let error: string | undefined;

      // Broken image: naturalWidth and naturalHeight are both 0 and complete is true
      // This indicates the image failed to load (404, 500, invalid src, etc.)
      if (naturalWidth === 0 && naturalHeight === 0 && complete) {
        status = "broken";
        severity = "critical";
        description = `Broken image: "${src}" failed to load (0×0 natural dimensions)`;
        error = "Image failed to load — natural dimensions are 0×0";
      }
      // Still loading
      else if (!complete && src) {
        status = "error";
        severity = "high";
        description = `Image still loading or failed: "${src}" (complete=false)`;
        error = "Image has not finished loading";
      }
      // Hidden via CSS
      else if (cssHidden && naturalWidth > 0) {
        status = "hidden";
        severity = "low";
        if (displayNone) {
          description = `Image is hidden via display:none: "${src}"`;
        } else if (visibilityHidden) {
          description = `Image is hidden via visibility:hidden: "${src}"`;
        } else {
          description = `Image is hidden via opacity:0: "${src}"`;
        }
      }
      // Distorted: aspect ratio mismatch between natural and display (>50% difference)
      else if (naturalWidth > 0 && naturalHeight > 0 && displayWidth > 0 && displayHeight > 0) {
        const naturalRatio = naturalWidth / naturalHeight;
        const displayRatio = displayWidth / displayHeight;
        const ratioDiff = Math.abs(naturalRatio - displayRatio) / naturalRatio;

        if (ratioDiff > 0.5) {
          status = "distorted";
          severity = "medium";
          description = `Distorted image: "${src}" — natural aspect ratio ${naturalRatio.toFixed(2)} vs display ${displayRatio.toFixed(2)} (diff: ${(ratioDiff * 100).toFixed(0)}%)`;
        }
      }

      // Missing alt text (accessibility concern) — info level, doesn't change status
      if (!alt && status === "ok" && src) {
        severity = "info";
        description = description
          ? `${description}; also missing alt text`
          : `Image missing alt text: "${src}"`;
      }

      // If everything is fine, mark as ok with no description needed
      if (status === "ok" && !description) {
        // Still record it as a passing check
        checks.push({
          src,
          status: "ok",
          naturalWidth,
          naturalHeight,
          displayWidth,
          displayHeight,
          alt,
          rendered,
          cssHidden,
          severity: "info",
          description: `Image OK: "${src}"`,
        });
      } else {
        checks.push({
          src,
          status,
          naturalWidth,
          naturalHeight,
          displayWidth,
          displayHeight,
          alt,
          rendered,
          cssHidden,
          error,
          severity,
          description,
        });
      }
    }

    return checks;
  });

  results.push(...imgResults);

  // 2. Check <picture> elements for fallback images
  const pictureResults = await page.evaluate(() => {
    const checks: Array<{
      src: string;
      status: "ok" | "broken" | "hidden" | "distorted" | "error";
      naturalWidth: number;
      naturalHeight: number;
      displayWidth: number;
      displayHeight: number;
      alt: string;
      rendered: boolean;
      cssHidden: boolean;
      error?: string;
      severity: "critical" | "high" | "medium" | "low" | "info";
      description: string;
    }> = [];

    const pictures = Array.from(document.querySelectorAll("picture"));

    for (const picture of pictures) {
      const img = picture.querySelector("img");
      const sources = Array.from(picture.querySelectorAll("source"));

      // If no <img> fallback inside <picture>, it's an issue
      if (!img) {
        checks.push({
          src: "",
          status: "broken",
          naturalWidth: 0,
          naturalHeight: 0,
          displayWidth: 0,
          displayHeight: 0,
          alt: "",
          rendered: false,
          cssHidden: false,
          error: "<picture> element missing <img> fallback",
          severity: "high",
          description: `<picture> element has no <img> fallback — will not display in browsers that don't support <picture>`,
        });
        continue;
      }

      // If <picture> has no <source> children, the <img> is directly used (acceptable)
      if (sources.length === 0) {
        // Already covered by <img> checks above, skip
        continue;
      }

      // Check that source elements have valid srcset
      for (const source of sources) {
        const srcset = source.getAttribute("srcset");
        if (!srcset) {
          checks.push({
            src: source.src || "",
            status: "broken",
            naturalWidth: 0,
            naturalHeight: 0,
            displayWidth: 0,
            displayHeight: 0,
            alt: img.alt || "",
            rendered: true,
            cssHidden: false,
            error: "<source> element missing srcset attribute",
            severity: "high",
            description: `<picture> <source> element missing srcset — this source will be ignored by the browser`,
          });
        }
      }
    }

    return checks;
  });

  results.push(...pictureResults);

  // 3. Check CSS background-images
  const bgImageResults = await page.evaluate(() => {
    const checks: Array<{
      src: string;
      status: "ok" | "broken" | "hidden" | "distorted" | "error";
      naturalWidth: number;
      naturalHeight: number;
      displayWidth: number;
      displayHeight: number;
      alt: string;
      rendered: boolean;
      cssHidden: boolean;
      error?: string;
      severity: "critical" | "high" | "medium" | "low" | "info";
      description: string;
    }> = [];

    // Find all elements with background-image that contain a url()
    const allElements = Array.from(document.querySelectorAll("*"));
    for (const el of allElements) {
      const style = getComputedStyle(el);
      const bgImage = style.backgroundImage;

      if (!bgImage || bgImage === "none") continue;

      // Extract URL from background-image: url("...")
      const urlMatches = bgImage.match(/url\(["']?([^"')]+)["']?\)/g);
      if (!urlMatches) continue;

      for (const match of urlMatches) {
        const urlMatch = match.match(/url\(["']?([^"')]+)["']?\)/);
        if (!urlMatch) continue;

        const src = urlMatch[1];

        // Check if element is visible
        const displayNone = style.display === "none";
        const visibilityHidden = style.visibility === "hidden";
        const opacityZero = parseFloat(style.opacity) === 0;
        const cssHidden = displayNone || visibilityHidden || opacityZero;

        if (cssHidden) {
          checks.push({
            src,
            status: "hidden",
            naturalWidth: 0,
            naturalHeight: 0,
            displayWidth: el.clientWidth,
            displayHeight: el.clientHeight,
            alt: "",
            rendered: false,
            cssHidden: true,
            severity: "low",
            description: `CSS background-image on hidden element: "${src}"`,
          });
        }
        // We can't easily verify if a CSS background-image loaded correctly
        // from the client side without attempting to load it in JS.
        // Just note its existence for LLM follow-up.
      }
    }

    return checks;
  });

  results.push(...bgImageResults);

  return results;
}

// ── Video Checks ──────────────────────────────────────────────────

/**
 * Perform comprehensive video checks on the page.
 * Checks <video> elements for sources, load state, playback readiness,
 * and optionally captures frames at key timestamps.
 */
async function performVideoChecks(
  page: Page,
  captureFrames: boolean,
  maxFrames: number
): Promise<VideoCheckResult[]> {
  const results: VideoCheckResult[] = [];

  // 1. Gather basic video information from the page
  const videoInfos = await page.evaluate(() => {
    const infos: Array<{
      src: string;
      sourceUrls: string[];
      readyState: number;
      duration: number;
      errorMessage: string | null;
      errorCode: number | null;
      hasAudio: boolean;
      hasVideo: boolean;
      width: number;
      height: number;
      index: number;
    }> = [];

    const videos = Array.from(document.querySelectorAll("video"));

    videos.forEach((video, index) => {
      const src = video.src || video.getAttribute("src") || "";
      const sourceElements = Array.from(video.querySelectorAll("source"));
      const sourceUrls = sourceElements
        .map((s) => s.src || s.getAttribute("src") || "")
        .filter(Boolean);

      const readyState = video.readyState;
      const duration = isNaN(video.duration) ? -1 : video.duration;
      const error = video.error;

      // Check audio/video tracks (may not be available in all browsers)
      let hasAudio = false;
      let hasVideo = false;

      try {
        // audioTracks and videoTracks are not widely supported but check anyway
        if (video.audioTracks) {
          for (let i = 0; i < video.audioTracks.length; i++) {
            if (video.audioTracks[i].enabled) {
              hasAudio = true;
              break;
            }
          }
        }
        if (video.videoTracks) {
          for (let i = 0; i < video.videoTracks.length; i++) {
            if (video.videoTracks[i].selected) {
              hasVideo = true;
              break;
            }
          }
        }
      } catch {
        // Track API not available — will rely on readyState
      }

      // If readyState >= 1, we know there's at least metadata loaded
      if (readyState >= 1) {
        hasVideo = true;
      }

      infos.push({
        src,
        sourceUrls,
        readyState,
        duration,
        errorMessage: error ? error.message : null,
        errorCode: error ? error.code : null,
        hasAudio,
        hasVideo,
        width: video.clientWidth,
        height: video.clientHeight,
        index,
      });
    });

    return infos;
  });

  // 2. Process each video and determine status/severity
  for (const info of videoInfos) {
    let status: VideoCheckResult["status"] = "ok";
    let severity: VideoCheckResult["severity"] = "info";
    let description = "";
    let error: string | undefined;

    const allSources = [info.src, ...info.sourceUrls].filter(Boolean);

    // No source at all
    if (allSources.length === 0) {
      status = "no_source";
      severity = "critical";
      description = "Video element has no src attribute and no <source> children";
      error = "No media source found for video element";
    }
    // Load failed (readyState=0 and error present)
    else if (info.readyState === 0 && info.errorMessage) {
      status = "load_failed";
      severity = "critical";
      description = `Video failed to load: ${info.errorMessage}`;
      error = info.errorMessage;
    }
    // Duration is 0 or NaN (likely broken or very short)
    else if (info.duration === 0 || info.duration === -1) {
      if (info.readyState === 0) {
        status = "load_failed";
        severity = "critical";
        description = "Video has no data loaded (readyState=0, duration unknown)";
        error = "Video readyState is HAVE_NOTHING — no data loaded";
      } else {
        status = "error";
        severity = "high";
        description = "Video duration is 0 or unknown despite partial loading";
        error = "Video duration reported as 0 or NaN";
      }
    }
    // Playback issues (readyState < 3 means not enough data for smooth playback)
    else if (info.readyState < 3 && info.readyState > 0) {
      status = "playback_failed";
      severity = "medium";
      description = `Video may not play smoothly (readyState=${info.readyState}, expected ≥3)`;
    }
    // No audio track (info level — may be intentional)
    else if (!info.hasAudio && info.hasVideo) {
      severity = "info";
      description = "Video has no audio track (may be intentional for muted/ambient video)";
    }

    // If everything is fine, give a clean description
    if (status === "ok" && !description) {
      description = `Video OK: "${info.src || info.sourceUrls[0] || "unknown"}" (${info.duration.toFixed(1)}s)`;
    }

    // 3. Frame capture (optional, expensive)
    let frameCaptures: string[] = [];
    if (captureFrames && info.duration > 0 && info.readyState >= 1) {
      try {
        frameCaptures = await captureVideoFrames(page, info.index, info.duration, maxFrames);
      } catch (frameError) {
        console.warn("[Media-Verifier] Frame capture failed for video index", info.index, frameError);
      }
    }

    results.push({
      src: info.src || info.sourceUrls[0] || "",
      status,
      readyState: info.readyState,
      duration: info.duration,
      error,
      hasAudio: info.hasAudio,
      hasVideo: info.hasVideo,
      frameCaptures,
      severity,
      description,
    });
  }

  return results;
}

/**
 * Capture frames from a video element at key timestamps.
 * Seeks the video to evenly spaced timestamps and takes screenshots.
 */
async function captureVideoFrames(
  page: Page,
  videoIndex: number,
  duration: number,
  maxFrames: number
): Promise<string[]> {
  const frames: string[] = [];
  const timestamps: number[] = [];

  // Calculate timestamps at 0%, 25%, 50%, 75%, 100% of duration (or fewer based on maxFrames)
  const frameCount = Math.min(maxFrames, 5);
  for (let i = 0; i < frameCount; i++) {
    const pct = frameCount === 1 ? 0.5 : i / (frameCount - 1);
    // Avoid seeking to exactly 0 or duration (can be problematic)
    const time = Math.max(0.1, Math.min(duration - 0.1, pct * duration));
    timestamps.push(time);
  }

  for (const time of timestamps) {
    try {
      // Seek the video to the target time
      await page.evaluate(
        ({ idx, t }) => {
          const video = document.querySelectorAll("video")[idx] as HTMLVideoElement;
          if (video) {
            video.currentTime = t;
          }
        },
        { idx: videoIndex, t: time }
      );

      // Wait for the seek to complete
      await page.waitForFunction(
        ({ idx, t }) => {
          const video = document.querySelectorAll("video")[idx] as HTMLVideoElement;
          return video && Math.abs(video.currentTime - t) < 0.5;
        },
        { idx: videoIndex, t: time },
        { timeout: 5000 }
      );

      // Small delay for the frame to render
      await new Promise((r) => setTimeout(r, 300));

      // Get video element bounding box for screenshot
      const videoEl = await page.$(`video:nth-of-type(${videoIndex + 1})`);
      if (!videoEl) continue;

      const boundingBox = await videoEl.boundingBox();
      if (!boundingBox) continue;

      // Take screenshot of the video element area
      const screenshot = await page.screenshot({
        clip: boundingBox,
        type: "png",
      });

      // Convert to base64
      const base64 = screenshot.toString("base64");

      // Check if frame is blank/black (all pixels near 0)
      // We do a simple check: if the screenshot is mostly one color, it's likely blank
      const isBlank = await page.evaluate(
        ({ idx }) => {
          const video = document.querySelectorAll("video")[idx] as HTMLVideoElement;
          if (!video) return true;
          const canvas = document.createElement("canvas");
          canvas.width = Math.min(video.videoWidth || 100, 50);
          canvas.height = Math.min(video.videoHeight || 100, 50);
          const ctx = canvas.getContext("2d");
          if (!ctx) return true;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let totalBrightness = 0;
          let pixelCount = 0;
          for (let i = 0; i < data.length; i += 4) {
            totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
            pixelCount++;
          }
          const avgBrightness = totalBrightness / pixelCount;
          return avgBrightness < 5; // Very dark = likely blank/black frame
        },
        { idx: videoIndex }
      );

      if (!isBlank) {
        frames.push(base64);
      }
    } catch (frameError) {
      console.warn(
        `[Media-Verifier] Failed to capture frame at ${time.toFixed(1)}s for video ${videoIndex}:`,
        frameError
      );
    }
  }

  return frames;
}

// ── LLM-Based Analysis ────────────────────────────────────────────

interface LLMAnalysisResult {
  extraImageChecks: ImageCheckResult[];
  extraVideoChecks: VideoCheckResult[];
}

async function callLLMForMediaAnalysis(
  url: string,
  imageChecks: ImageCheckResult[],
  videoChecks: VideoCheckResult[]
): Promise<LLMAnalysisResult> {
  const prompt = buildMediaPrompt(url, imageChecks, videoChecks);

  // Strategy 1: Try z-ai-web-dev-sdk
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert web media analyst. Analyze media verification findings and provide additional insights about image and video health on web pages. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    return parseMediaResponse(content);
  } catch (sdkError) {
    console.warn("[Media-Verifier] z-ai-web-dev-sdk failed:", sdkError);
  }

  // Strategy 2: Try external OpenAI-compatible API
  const externalUrl = process.env.LLM_API_URL;
  const externalKey = process.env.LLM_API_KEY;
  const externalModel = process.env.LLM_MODEL || "gpt-4o-mini";

  if (externalUrl && externalKey) {
    try {
      const response = await fetch(`${externalUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${externalKey}`,
        },
        body: JSON.stringify({
          model: externalModel,
          messages: [
            {
              role: "system",
              content:
                "You are an expert web media analyst. Analyze media verification findings and provide additional insights about image and video health on web pages. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content ?? "";
        return parseMediaResponse(content);
      }
    } catch (fetchError) {
      console.warn("[Media-Verifier] External API failed:", fetchError);
    }
  }

  // Strategy 3: Rule-based fallback — no additional findings
  return { extraImageChecks: [], extraVideoChecks: [] };
}

function buildMediaPrompt(
  url: string,
  imageChecks: ImageCheckResult[],
  videoChecks: VideoCheckResult[]
): string {
  const imageSummary = imageChecks
    .filter((c) => c.status !== "ok")
    .map((c) => `- [${c.severity}] ${c.status}: ${c.description}`)
    .join("\n");

  const videoSummary = videoChecks
    .filter((c) => c.status !== "ok")
    .map((c) => `- [${c.severity}] ${c.status}: ${c.description}`)
    .join("\n");

  return `Analyze the following media verification results for ${url}:

Image findings (${imageChecks.length} total):
${imageSummary || "No image issues found."}

Video findings (${videoChecks.length} total):
${videoSummary || "No video issues found."}

Return a JSON object with any additional media concerns or insights:
{
  "imageChecks": [
    {
      "src": "URL or description",
      "status": "broken|hidden|distorted|error",
      "severity": "critical|high|medium|low|info",
      "description": "Human-readable description"
    }
  ],
  "videoChecks": [
    {
      "src": "URL or description",
      "status": "error|no_source|load_failed|playback_failed",
      "severity": "critical|high|medium|low|info",
      "description": "Human-readable description"
    }
  ]
}

Rules:
- Only add findings that are genuinely new and not covered by existing findings
- Focus on high-impact media health issues (broken assets, rendering problems)
- Consider accessibility implications (missing alt text, no captions)
- Consider performance implications (unoptimized images, huge video files)
- Provide actionable descriptions
- Return ONLY the JSON, no markdown or explanation`;
}

function parseMediaResponse(content: string): LLMAnalysisResult {
  const result: LLMAnalysisResult = { extraImageChecks: [], extraVideoChecks: [] };

  try {
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return result;

    const parsed = JSON.parse(jsonMatch[0]);

    // Parse image checks from LLM
    const imageChecks = parsed.imageChecks ?? [];
    for (const ic of imageChecks) {
      result.extraImageChecks.push({
        src: String(ic.src ?? ""),
        status: isValidImageStatus(ic.status) ? ic.status : "error",
        naturalWidth: 0,
        naturalHeight: 0,
        displayWidth: 0,
        displayHeight: 0,
        alt: "",
        rendered: false,
        cssHidden: false,
        error: String(ic.description ?? ""),
        severity: isValidSeverity(ic.severity) ? ic.severity : "info",
        description: String(ic.description ?? ""),
      });
    }

    // Parse video checks from LLM
    const videoChecks = parsed.videoChecks ?? [];
    for (const vc of videoChecks) {
      result.extraVideoChecks.push({
        src: String(vc.src ?? ""),
        status: isValidVideoStatus(vc.status) ? vc.status : "error",
        readyState: 0,
        duration: -1,
        error: String(vc.description ?? ""),
        hasAudio: false,
        hasVideo: false,
        frameCaptures: [],
        severity: isValidSeverity(vc.severity) ? vc.severity : "info",
        description: String(vc.description ?? ""),
      });
    }
  } catch (parseError) {
    console.warn("[Media-Verifier] Failed to parse LLM response:", parseError);
  }

  return result;
}

function isValidSeverity(s: string): s is "critical" | "high" | "medium" | "low" | "info" {
  return ["critical", "high", "medium", "low", "info"].includes(s);
}

function isValidImageStatus(s: string): s is ImageCheckResult["status"] {
  return ["ok", "broken", "hidden", "distorted", "error"].includes(s);
}

function isValidVideoStatus(s: string): s is VideoCheckResult["status"] {
  return ["ok", "error", "no_source", "load_failed", "playback_failed"].includes(s);
}
