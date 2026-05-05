/**
 * Probato Media Verifier Agent (M21 + M22)
 *
 * Verifies media assets on web pages for health and correctness:
 * - Image checks: broken images, hidden images, distorted images, missing alt text
 * - Video checks: missing sources, load failures, playback issues, no audio track
 * - Audio checks: broken audio elements, playback errors, missing sources,
 *   volume/mute issues, format validation, duration checks
 * - Whisper transcription: audio content verification via ASR (z-ai-web-dev-sdk)
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

export interface AudioCheckResult {
  src: string;           // Audio source URL
  status: "ok" | "broken" | "no_source" | "load_failed" | "playback_error" | "muted" | "format_error";
  readyState: number;    // 0=HAVE_NOTHING ... 4=HAVE_ENOUGH_DATA
  duration: number;      // -1 if unknown, in seconds
  volume: number;        // 0.0 - 1.0
  muted: boolean;        // Whether audio is muted
  error?: string;        // MediaError message
  format?: string;       // Detected format (e.g. "audio/mpeg")
  networkState: number;  // 0=NETWORK_EMPTY, 1=NETWORK_IDLE, 2=NETWORK_LOADING, 3=NETWORK_NO_SOURCE
  cssHidden: boolean;    // Whether the audio element or its container is hidden
  transcription?: string; // Whisper transcription result
  transcriptionConfidence?: number; // 0.0 - 1.0 confidence score
  transcriptionError?: string; // Error if transcription failed
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
  checkAudio?: boolean;    // default true (M22)
  captureFrames?: boolean; // default false (expensive — captures video frames)
  maxFrames?: number;      // default 5, max 10
  transcribeAudio?: boolean; // default false (M22 — uses Whisper ASR, expensive)
  maxTranscriptions?: number; // default 3, max 5 (limit audio files to transcribe)
}

export interface MediaVerificationResult {
  imageChecks: ImageCheckResult[];
  videoChecks: VideoCheckResult[];
  audioChecks: AudioCheckResult[]; // M22
  overallScore: number;
  imageScore: number;
  videoScore: number;
  audioScore: number; // 0-100 (populated in M22)
  summary: {
    totalImages: number;
    brokenImages: number;
    hiddenImages: number;
    distortedImages: number;
    totalVideos: number;
    errorVideos: number;
    noSourceVideos: number;
    totalAudio: number; // M22
    brokenAudio: number; // M22
    mutedAudio: number; // M22
    transcribedAudio: number; // M22
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

function calculateAudioScore(checks: AudioCheckResult[]): number {
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
    const creditCheck = await checkCredits(input.userId, "media_verification");
    if (!creditCheck.hasCredits) {
      return {
        imageChecks: [],
        videoChecks: [],
        audioChecks: [],
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
          totalAudio: 0,
          brokenAudio: 0,
          mutedAudio: 0,
          transcribedAudio: 0,
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
    let audioChecks: AudioCheckResult[] = [];
    let audioSourceUrls: string[] = []; // Collected for Whisper transcription
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

      // Extra wait for lazy-loaded images/videos/audio
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

      // 6. Run audio checks (M22)
      const shouldCheckAudio = input.checkAudio !== false;
      if (shouldCheckAudio) {
        const transcribe = input.transcribeAudio === true;
        const maxTranscriptions = Math.min(Math.max(input.maxTranscriptions ?? 3, 1), 5);
        const audioResult = await performAudioChecks(page, transcribe, maxTranscriptions);
        audioChecks = audioResult.checks;
        audioSourceUrls = audioResult.sourceUrls;
      }

      await page.close();
    } finally {
      await cleanupBrowser(managed);
    }

    // 7. Try LLM analysis for deeper insights (3-tier strategy)
    try {
      const llmResult = await callLLMForMediaAnalysis(
        input.url,
        imageChecks,
        videoChecks,
        audioChecks
      );
      if (llmResult.extraImageChecks.length > 0) {
        imageChecks = [...imageChecks, ...llmResult.extraImageChecks];
      }
      if (llmResult.extraVideoChecks.length > 0) {
        videoChecks = [...videoChecks, ...llmResult.extraVideoChecks];
      }
      if (llmResult.extraAudioChecks.length > 0) {
        audioChecks = [...audioChecks, ...llmResult.extraAudioChecks];
      }
      if (llmResult.extraImageChecks.length > 0 || llmResult.extraVideoChecks.length > 0 || llmResult.extraAudioChecks.length > 0) {
        llmUsed = true;
      }
    } catch (error) {
      console.warn("[Media-Verifier] LLM failed, using rule-based findings only:", error);
    }

    // 8. Run Whisper transcription for audio sources (if enabled)
    if (input.transcribeAudio && audioSourceUrls.length > 0) {
      const maxTranscribe = Math.min(Math.max(input.maxTranscriptions ?? 3, 1), 5);
      const urlsToTranscribe = audioSourceUrls.slice(0, maxTranscribe);
      
      for (const audioUrl of urlsToTranscribe) {
        try {
          const transcription = await transcribeAudioViaWhisper(audioUrl);
          const matchingCheck = audioChecks.find((c) => c.src === audioUrl);
          if (matchingCheck) {
            matchingCheck.transcription = transcription.text;
            matchingCheck.transcriptionConfidence = transcription.confidence;
            matchingCheck.transcriptionError = transcription.error;
            // If transcription is empty but audio has duration, flag it
            if (!transcription.error && (!transcription.text || transcription.text.trim().length === 0) && matchingCheck.duration > 0) {
              matchingCheck.severity = "medium";
              matchingCheck.description += " — Whisper transcription returned empty result (possible silent audio or speech recognition failure)";
            }
            llmUsed = true;
          }
        } catch (transcriptionError) {
          console.warn("[Media-Verifier] Whisper transcription failed for", audioUrl, transcriptionError);
          const matchingCheck = audioChecks.find((c) => c.src === audioUrl);
          if (matchingCheck) {
            matchingCheck.transcriptionError = transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError);
          }
        }
      }
    }

    // 9. Calculate scores
    const iScore = calculateImageScore(imageChecks);
    const vScore = calculateVideoScore(videoChecks);
    const aScore = calculateAudioScore(audioChecks);

    // overallScore = average of all category scores, only counting categories that had elements
    const scores: number[] = [];
    if (imageChecks.length > 0) scores.push(iScore);
    if (videoChecks.length > 0) scores.push(vScore);
    if (audioChecks.length > 0) scores.push(aScore);
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
      totalAudio: audioChecks.length,
      brokenAudio: audioChecks.filter((c) => c.status === "broken" || c.status === "load_failed" || c.status === "playback_error" || c.status === "format_error").length,
      mutedAudio: audioChecks.filter((c) => c.status === "muted").length,
      transcribedAudio: audioChecks.filter((c) => c.transcription && c.transcription.trim().length > 0).length,
    };

    // 10. Deduct credits
    try {
      await deductCredits(
        input.userId,
        "media_verification",
        `Media verification for ${input.url}`,
        undefined,
        undefined
      );
    } catch (creditError) {
      console.warn("[Media-Verifier] Credit deduction failed:", creditError);
    }

    // 11. Persist to DB
    let verificationId: string | undefined;
    try {
      const verification = await db.mediaVerification.create({
        data: {
          status: "completed",
          url: input.url,
          overallScore,
          imageScore: iScore,
          videoScore: vScore,
          audioScore: aScore,
          imageChecks: imageChecks as any,
          videoChecks: videoChecks as any,
          audioChecks: audioChecks as any,
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

    // 12. Dispatch notification if critical/high findings
    const criticalOrHigh = [
      ...imageChecks.filter((c) => c.severity === "critical" || c.severity === "high"),
      ...videoChecks.filter((c) => c.severity === "critical" || c.severity === "high"),
      ...audioChecks.filter((c) => c.severity === "critical" || c.severity === "high"),
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
            totalAudio: summary.totalAudio,
          },
        });
      } catch (notifError) {
        console.warn("[Media-Verifier] Notification dispatch failed:", notifError);
      }
    }

    // 13. Return result
    return {
      imageChecks,
      videoChecks,
      audioChecks,
      overallScore,
      imageScore: iScore,
      videoScore: vScore,
      audioScore: aScore,
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
      audioChecks: [],
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
        totalAudio: 0,
        brokenAudio: 0,
        mutedAudio: 0,
        transcribedAudio: 0,
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

// ── Audio Checks (M22) ──────────────────────────────────────────

/**
 * Perform comprehensive audio checks on the page.
 * Checks <audio> elements for sources, load state, playback errors,
 * volume/mute state, format validation, and CSS visibility.
 * Also detects embedded audio (Web Audio API context usage).
 *
 * Returns both the check results and a list of audio source URLs
 * that are candidates for Whisper transcription.
 */
async function performAudioChecks(
  page: Page,
  _transcribe: boolean,
  _maxTranscriptions: number
): Promise<{ checks: AudioCheckResult[]; sourceUrls: string[] }> {
  const results: AudioCheckResult[] = [];
  const sourceUrls: string[] = [];

  // 1. Gather all <audio> element information from the page
  const audioInfos = await page.evaluate(() => {
    const infos: Array<{
      src: string;
      sourceUrls: string[];
      readyState: number;
      duration: number;
      volume: number;
      muted: boolean;
      errorMessage: string | null;
      errorCode: number | null;
      networkState: number;
      currentSrc: string;
      format: string;
      cssHidden: boolean;
      preload: string;
      autoplay: boolean;
      loop: boolean;
      index: number;
    }> = [];

    const audios = Array.from(document.querySelectorAll("audio"));

    audios.forEach((audio, index) => {
      const src = audio.src || audio.getAttribute("src") || "";
      const sourceElements = Array.from(audio.querySelectorAll("source"));
      const sourceUrls = sourceElements
        .map((s) => s.src || s.getAttribute("src") || "")
        .filter(Boolean);

      const readyState = audio.readyState;
      const duration = isNaN(audio.duration) ? -1 : audio.duration;
      const error = audio.error;
      const networkState = audio.networkState;

      // Detect format from type attribute or currentSrc
      let format = "";
      const currentSource = audio.querySelector("source");
      if (currentSource?.type) {
        format = currentSource.type;
      } else if (audio.currentSrc) {
        // Try to infer from URL extension
        const ext = audio.currentSrc.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "";
        const mimeMap: Record<string, string> = {
          mp3: "audio/mpeg", mpeg: "audio/mpeg",
          wav: "audio/wav", wave: "audio/wav",
          ogg: "audio/ogg", oga: "audio/ogg",
          opus: "audio/opus",
          flac: "audio/flac",
          aac: "audio/aac", m4a: "audio/mp4",
          webm: "audio/webm",
        };
        format = mimeMap[ext] || `audio/${ext}`;
      }

      // Check CSS visibility (audio elements are often hidden but that's expected)
      // Check if parent is hidden which might mean the audio can't be controlled
      const computedStyle = getComputedStyle(audio);
      const displayNone = computedStyle.display === "none";
      const visibilityHidden = computedStyle.visibility === "hidden";
      const opacityZero = parseFloat(computedStyle.opacity) === 0;
      const cssHidden = displayNone || visibilityHidden || opacityZero;

      infos.push({
        src,
        sourceUrls,
        readyState,
        duration,
        volume: audio.volume,
        muted: audio.muted,
        errorMessage: error ? error.message : null,
        errorCode: error ? error.code : null,
        networkState,
        currentSrc: audio.currentSrc || "",
        format,
        cssHidden,
        preload: audio.preload,
        autoplay: audio.autoplay,
        loop: audio.loop,
        index,
      });
    });

    return infos;
  });

  // 2. Process each audio element and determine status/severity
  for (const info of audioInfos) {
    let status: AudioCheckResult["status"] = "ok";
    let severity: AudioCheckResult["severity"] = "info";
    let description = "";
    let error: string | undefined;

    const allSources = [info.src, ...info.sourceUrls, info.currentSrc].filter(Boolean);
    const primarySrc = info.currentSrc || info.src || info.sourceUrls[0] || "";

    // No source at all
    if (allSources.length === 0) {
      status = "no_source";
      severity = "critical";
      description = "Audio element has no src attribute and no <source> children";
      error = "No media source found for audio element";
    }
    // Load failed (readyState=0 and error present or NETWORK_NO_SOURCE)
    else if (info.readyState === 0 && info.errorMessage) {
      status = "load_failed";
      severity = "critical";
      description = `Audio failed to load: ${info.errorMessage}`;
      error = info.errorMessage;
    }
    // Network state = NETWORK_NO_SOURCE (3) means no suitable source found
    else if (info.networkState === 3) {
      status = "no_source";
      severity = "critical";
      description = "Audio element has no suitable source (networkState=NETWORK_NO_SOURCE)";
      error = "No suitable audio source found by the browser";
    }
    // Load failed with readyState=0 but no error message (likely 404 or timeout)
    else if (info.readyState === 0 && allSources.length > 0) {
      status = "broken";
      severity = "high";
      description = `Audio element failed to load any data (readyState=0) for source: "${primarySrc}"`;
      error = "Audio readyState is HAVE_NOTHING — no data loaded";
    }
    // Playback error (error code 1=MEDIA_ERR_ABORTED, 2=MEDIA_ERR_NETWORK, 3=MEDIA_ERR_DECODE, 4=MEDIA_ERR_SRC_NOT_SUPPORTED)
    else if (info.errorMessage && info.readyState > 0) {
      status = "playback_error";
      if (info.errorCode === 3) {
        severity = "critical";
        description = `Audio decoding error: ${info.errorMessage}`;
      } else if (info.errorCode === 4) {
        status = "format_error";
        severity = "critical";
        description = `Audio format not supported: ${info.errorMessage}`;
      } else {
        severity = "high";
        description = `Audio playback error (code ${info.errorCode}): ${info.errorMessage}`;
      }
      error = info.errorMessage;
    }
    // Duration is 0 or unknown despite partial loading
    else if ((info.duration === 0 || info.duration === -1) && info.readyState > 0) {
      status = "broken";
      severity = "high";
      description = "Audio duration is 0 or unknown despite partial loading";
      error = "Audio duration reported as 0 or NaN";
    }
    // Muted audio (informational — may be intentional)
    else if (info.muted && info.readyState >= 1) {
      status = "muted";
      severity = "low";
      description = `Audio is muted (volume=${info.volume.toFixed(2)}) — may be intentional`;
    }
    // Volume is 0 but not muted (likely a bug)
    else if (info.volume === 0 && !info.muted && info.readyState >= 1) {
      status = "muted";
      severity = "medium";
      description = "Audio volume is set to 0 but not muted — audio will be inaudible";
    }
    // Format check — flag uncommon formats
    else if (info.format && info.readyState >= 1) {
      const supportedFormats = [
        "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg",
        "audio/webm", "audio/aac", "audio/mp4", "audio/flac", "audio/opus",
      ];
      if (!supportedFormats.some((f) => info.format.startsWith(f.split(";")[0]))) {
        severity = "info";
        description = `Audio uses uncommon format: "${info.format}" — may not play in all browsers`;
      }
    }

    // If everything is fine, give a clean description
    if (status === "ok" && !description) {
      const durationStr = info.duration > 0 ? ` (${info.duration.toFixed(1)}s)` : "";
      description = `Audio OK: "${primarySrc}"${durationStr}`;
    }

    // Collect source URL for potential Whisper transcription
    if (primarySrc && (info.readyState >= 1 || info.duration > 0)) {
      sourceUrls.push(primarySrc);
    }

    results.push({
      src: primarySrc,
      status,
      readyState: info.readyState,
      duration: info.duration,
      volume: info.volume,
      muted: info.muted,
      error,
      format: info.format || undefined,
      networkState: info.networkState,
      cssHidden: info.cssHidden,
      severity,
      description,
    });
  }

  // 3. Check for embedded audio via Web Audio API
  const webAudioInfo = await page.evaluate(() => {
    const findings: Array<{
      type: string;
      description: string;
      severity: string;
    }> = [];

    // Check if Web Audio API is being used
    // We can detect AudioContext usage by looking for window.AudioContext or webkitAudioContext
    // and checking if any instances are active (hard to do from page context, so we note it)

    // Look for <embed> or <object> with audio content
    const embeds = Array.from(document.querySelectorAll('embed[type^="audio"], object[type^="audio"]'));
    for (const embed of embeds) {
      findings.push({
        type: "embed_audio",
        description: `Embedded audio found via <${embed.tagName.toLowerCase()}> element — may not be playable in all browsers`,
        severity: "info",
      });
    }

    // Look for iframe-based audio players (SoundCloud, Spotify embeds, etc.)
    const audioIframes = Array.from(document.querySelectorAll("iframe")).filter((iframe) => {
      const src = iframe.src || iframe.getAttribute("src") || "";
      return src.includes("soundcloud.com") || src.includes("spotify.com") ||
        src.includes("open.spotify.com") || src.includes("audioboom.com") ||
        src.includes("podbean.com") || src.includes("buzzsprout.com");
    });

    for (const iframe of audioIframes) {
      const src = iframe.src || iframe.getAttribute("src") || "";
      findings.push({
        type: "iframe_audio",
        description: `Third-party audio player embedded via iframe: "${src.substring(0, 80)}" — content cannot be verified by media checker`,
        severity: "info",
      });
    }

    return findings;
  });

  // Add Web Audio / embedded findings as info-level checks
  for (const finding of webAudioInfo) {
    results.push({
      src: finding.type === "iframe_audio" ? "iframe-embed" : "embed",
      status: "ok",
      readyState: 0,
      duration: -1,
      volume: 1,
      muted: false,
      networkState: 0,
      cssHidden: false,
      severity: finding.severity as AudioCheckResult["severity"],
      description: finding.description,
    });
  }

  return { checks: results, sourceUrls };
}

// ── Whisper Transcription (M22) ─────────────────────────────────

interface WhisperTranscriptionResult {
  text: string;
  confidence: number; // 0.0 - 1.0
  error?: string;
}

/**
 * Transcribe an audio file using Whisper ASR.
 *
 * Strategy 1: Use z-ai-web-dev-sdk ASR endpoint (if available)
 * Strategy 2: Use external Whisper-compatible API
 * Strategy 3: Skip transcription (return empty result)
 */
async function transcribeAudioViaWhisper(
  audioUrl: string
): Promise<WhisperTranscriptionResult> {
  // First, fetch the audio file to get its content
  let audioBuffer: Buffer;
  let audioBase64: string;
  let mimeType = "audio/mpeg"; // default assumption

  try {
    const audioResponse = await fetch(audioUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(15000), // 15s timeout for audio fetch
    });

    if (!audioResponse.ok) {
      return {
        text: "",
        confidence: 0,
        error: `Failed to fetch audio: HTTP ${audioResponse.status}`,
      };
    }

    // Detect MIME type from response headers
    const contentType = audioResponse.headers.get("content-type");
    if (contentType?.startsWith("audio/")) {
      mimeType = contentType.split(";")[0];
    } else {
      // Try to infer from URL
      const ext = audioUrl.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "";
      const mimeMap: Record<string, string> = {
        mp3: "audio/mpeg", mpeg: "audio/mpeg",
        wav: "audio/wav", ogg: "audio/ogg",
        webm: "audio/webm", flac: "audio/flac",
        m4a: "audio/mp4", aac: "audio/aac",
        opus: "audio/opus",
      };
      mimeType = mimeMap[ext] || "audio/mpeg";
    }

    const arrayBuffer = await audioResponse.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuffer);
    audioBase64 = audioBuffer.toString("base64");

    // Limit: skip files larger than 25MB (Whisper API limit)
    if (audioBuffer.length > 25 * 1024 * 1024) {
      return {
        text: "",
        confidence: 0,
        error: "Audio file too large for transcription (>25MB)",
      };
    }
  } catch (fetchError) {
    return {
      text: "",
      confidence: 0,
      error: `Failed to fetch audio file: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
    };
  }

  // Strategy 1: Try z-ai-web-dev-sdk ASR
  try {
    const zai = await ZAI.create();
    // Use the functions.invoke for ASR — cast to any to bypass typed function map
    // The z-ai SDK supports "asr" as a function name but it may not be in the type map
    const asrResult = await (zai.functions as any).invoke("asr", {
      audio: audioBase64,
      format: mimeType,
    });

    if (asrResult && typeof asrResult === "object") {
      const result = asrResult as any;
      return {
        text: result.text || result.transcription || "",
        confidence: result.confidence || result.score || 0.8,
      };
    }
  } catch (sdkError) {
    console.warn("[Media-Verifier] z-ai ASR failed:", sdkError);
  }

  // Strategy 2: Try external Whisper-compatible API
  const whisperApiUrl = process.env.WHISPER_API_URL || process.env.LLM_API_URL;
  const whisperApiKey = process.env.WHISPER_API_KEY || process.env.LLM_API_KEY;

  if (whisperApiUrl && whisperApiKey) {
    try {
      // OpenAI Whisper API format: multipart/form-data with file and model
      const formData = new FormData();
      const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
      formData.append("file", audioBlob, `audio.${mimeType.split("/")[1] || "mp3"}`);
      formData.append("model", process.env.WHISPER_MODEL || "whisper-1");

      const response = await fetch(`${whisperApiUrl}/audio/transcriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whisperApiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(30000), // 30s timeout for transcription
      });

      if (response.ok) {
        const data = await response.json();
        return {
          text: data.text || "",
          confidence: 0.85, // Whisper doesn't return confidence, use default
        };
      }
    } catch (apiError) {
      console.warn("[Media-Verifier] External Whisper API failed:", apiError);
    }
  }

  // Strategy 3: Use LLM chat completions as a fallback for audio description
  // (Can't actually transcribe, but can note the audio exists)
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an audio analysis assistant. Given an audio file URL and its metadata, provide a brief note about what might be in the audio. Respond with JSON: {\"note\": \"...\", \"confidence\": 0.0}",
        },
        {
          role: "user",
          content: `Audio file at ${audioUrl} (${mimeType}, ${audioBuffer.length} bytes). Cannot transcribe directly. Note that automated transcription was not available.`,
        },
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    try {
      const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || "{}");
      return {
        text: `[Transcription unavailable] ${parsed.note || ""}`,
        confidence: 0,
        error: "Automated transcription was not available — ASR service unreachable",
      };
    } catch {
      // JSON parse failed, return generic message
    }
  } catch {
    // LLM also failed
  }

  return {
    text: "",
    confidence: 0,
    error: "All transcription strategies failed — audio could not be transcribed",
  };
}

// ── LLM-Based Analysis ────────────────────────────────────────────

interface LLMAnalysisResult {
  extraImageChecks: ImageCheckResult[];
  extraVideoChecks: VideoCheckResult[];
  extraAudioChecks: AudioCheckResult[];
}

async function callLLMForMediaAnalysis(
  url: string,
  imageChecks: ImageCheckResult[],
  videoChecks: VideoCheckResult[],
  audioChecks: AudioCheckResult[]
): Promise<LLMAnalysisResult> {
  const prompt = buildMediaPrompt(url, imageChecks, videoChecks, audioChecks);

  // Strategy 1: Try z-ai-web-dev-sdk
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert web media analyst. Analyze media verification findings and provide additional insights about image, video, and audio health on web pages. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
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
                "You are an expert web media analyst. Analyze media verification findings and provide additional insights about image, video, and audio health on web pages. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
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
  return { extraImageChecks: [], extraVideoChecks: [], extraAudioChecks: [] };
}

function buildMediaPrompt(
  url: string,
  imageChecks: ImageCheckResult[],
  videoChecks: VideoCheckResult[],
  audioChecks: AudioCheckResult[]
): string {
  const imageSummary = imageChecks
    .filter((c) => c.status !== "ok")
    .map((c) => `- [${c.severity}] ${c.status}: ${c.description}`)
    .join("\n");

  const videoSummary = videoChecks
    .filter((c) => c.status !== "ok")
    .map((c) => `- [${c.severity}] ${c.status}: ${c.description}`)
    .join("\n");

  const audioSummary = audioChecks
    .filter((c) => c.status !== "ok")
    .map((c) => `- [${c.severity}] ${c.status}: ${c.description}`)
    .join("\n");

  return `Analyze the following media verification results for ${url}:

Image findings (${imageChecks.length} total):
${imageSummary || "No image issues found."}

Video findings (${videoChecks.length} total):
${videoSummary || "No video issues found."}

Audio findings (${audioChecks.length} total):
${audioSummary || "No audio issues found."}

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
  ],
  "audioChecks": [
    {
      "src": "URL or description",
      "status": "broken|no_source|load_failed|playback_error|muted|format_error",
      "severity": "critical|high|medium|low|info",
      "description": "Human-readable description"
    }
  ]
}

Rules:
- Only add findings that are genuinely new and not covered by existing findings
- Focus on high-impact media health issues (broken assets, rendering problems, audio issues)
- Consider accessibility implications (missing alt text, no captions, no audio transcript)
- Consider performance implications (unoptimized images, huge video/audio files)
- Consider audio-specific issues (autoplay without controls, inaccessible audio players)
- Provide actionable descriptions
- Return ONLY the JSON, no markdown or explanation`;
}

function parseMediaResponse(content: string): LLMAnalysisResult {
  const result: LLMAnalysisResult = { extraImageChecks: [], extraVideoChecks: [], extraAudioChecks: [] };

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

    // Parse audio checks from LLM (M22)
    const audioChecks = parsed.audioChecks ?? [];
    for (const ac of audioChecks) {
      result.extraAudioChecks.push({
        src: String(ac.src ?? ""),
        status: isValidAudioStatus(ac.status) ? ac.status : "broken",
        readyState: 0,
        duration: -1,
        volume: 1,
        muted: false,
        error: String(ac.description ?? ""),
        networkState: 0,
        cssHidden: false,
        severity: isValidSeverity(ac.severity) ? ac.severity : "info",
        description: String(ac.description ?? ""),
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

function isValidAudioStatus(s: string): s is AudioCheckResult["status"] {
  return ["ok", "broken", "no_source", "load_failed", "playback_error", "muted", "format_error"].includes(s);
}
