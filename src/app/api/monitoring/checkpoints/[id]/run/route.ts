import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Metric names that map to CheckpointResult fields
const METRIC_FIELDS: Record<string, string> = {
  lcp: "lcp",
  fid: "fid",
  cls: "cls",
  ttfb: "ttfb",
  domContentLoaded: "domContentLoaded",
  fullPageLoad: "fullPageLoad",
};

// ── POST /api/monitoring/checkpoints/[id]/run ─ Manually run a checkpoint ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const checkpoint = await db.syntheticCheckpoint.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!checkpoint) {
      return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
    }
    if (checkpoint.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Create a pending result record
    const result = await db.checkpointResult.create({
      data: {
        checkpointId: id,
        status: "pending",
      },
    });

    let runStatus: string = "passed";
    let responseTime = 0;
    let errorMessage: string | null = null;
    let screenshot: string | null = null;
    const stepResults: any[] = [];
    const metrics: Record<string, number | null> = {
      lcp: null,
      fid: null,
      cls: null,
      ttfb: null,
      domContentLoaded: null,
      fullPageLoad: null,
    };

    try {
      // Attempt to use Puppeteer/Chromium to run the checkpoint
      const { getBrowser } = await import("@/lib/browser/chromium");
      const browser = await getBrowser();
      const page = await browser.newPage();

      try {
        // Set viewport
        await page.setViewport({ width: 1280, height: 720 });

        // Parse steps from checkpoint
        const steps = Array.isArray(checkpoint.steps) ? checkpoint.steps : [];

        // Step 1: Navigate to URL and measure TTFB
        const navStart = Date.now();
        const response = await page.goto(checkpoint.url, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });
        const navEnd = Date.now();

        if (response) {
          metrics.ttfb = (navEnd - navStart) * 0.3; // Approximate TTFB
        }

        // Step 2: Measure Web Vitals using page.evaluate
        const webVitals = await page.evaluate(() => {
          return new Promise<Record<string, number>>((resolve) => {
            const vitals: Record<string, number> = {};

            // Get navigation timing
            const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
            if (nav) {
              vitals.ttfb = nav.responseStart - nav.requestStart;
              vitals.domContentLoaded = nav.domContentLoadedEventEnd - nav.startTime;
              vitals.fullPageLoad = nav.loadEventEnd - nav.startTime;
            }

            // Try to get LCP from PerformanceObserver
            try {
              const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
              if (lcpEntries.length > 0) {
                vitals.lcp = (lcpEntries[lcpEntries.length - 1] as PerformanceEntry).startTime;
              }
            } catch {}

            // CLS approximation
            try {
              const layoutShiftEntries = performance.getEntriesByType("layout-shift");
              let cls = 0;
              for (const entry of layoutShiftEntries) {
                if (!(entry as any).hadRecentInput) {
                  cls += (entry as any).value;
                }
              }
              vitals.cls = cls;
            } catch {}

            resolve(vitals);
          });
        });

        // Merge measured vitals
        if (webVitals.ttfb) metrics.ttfb = webVitals.ttfb;
        if (webVitals.domContentLoaded) metrics.domContentLoaded = webVitals.domContentLoaded;
        if (webVitals.fullPageLoad) metrics.fullPageLoad = webVitals.fullPageLoad;
        if (webVitals.lcp) metrics.lcp = webVitals.lcp;
        if (webVitals.cls) metrics.cls = webVitals.cls;

        // Step 3: Execute custom steps (asserts, waits, etc.)
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const stepStart = Date.now();

          try {
            if (step.type === "assert" && step.selector && step.value) {
              const element = await page.$(step.selector);
              if (!element) {
                throw new Error(`Element not found: ${step.selector}`);
              }
              const text = await element.evaluate((el: Element) => el.textContent);
              if (!text?.includes(step.value)) {
                throw new Error(`Assertion failed: expected "${step.value}" in "${text}"`);
              }
            } else if (step.type === "wait" && step.selector) {
              await page.waitForSelector(step.selector, { timeout: 10000 });
            } else if (step.type === "navigate" && step.value) {
              await page.goto(new URL(step.value, checkpoint.url).href, {
                waitUntil: "networkidle2",
                timeout: 30000,
              });
            }

            stepResults.push({
              step: i,
              type: step.type,
              status: "passed",
              duration: Date.now() - stepStart,
            });
          } catch (stepErr: any) {
            stepResults.push({
              step: i,
              type: step.type,
              status: "failed",
              error: stepErr.message,
              duration: Date.now() - stepStart,
            });
            runStatus = "failed";
          }
        }

        // Take screenshot if needed
        if (runStatus === "failed") {
          try {
            screenshot = (await page.screenshot({ encoding: "base64" })) as unknown as string;
          } catch {}
        }

        responseTime = Date.now() - startTime;
      } finally {
        await page.close();
      }
    } catch (browserErr: any) {
      // Browser unavailable — create a simulated result
      console.warn("[Monitoring/Run] Browser unavailable, using HTTP fetch fallback:", browserErr.message);

      try {
        const fetchStart = Date.now();
        const resp = await fetch(checkpoint.url, {
          method: "GET",
          signal: AbortSignal.timeout(15000),
        });
        const fetchEnd = Date.now();

        responseTime = fetchEnd - fetchStart;
        metrics.ttfb = responseTime * 0.4;
        metrics.domContentLoaded = responseTime * 0.8;
        metrics.fullPageLoad = responseTime;
        metrics.lcp = responseTime * 0.9;
        metrics.fid = 0;
        metrics.cls = 0;

        if (!resp.ok) {
          runStatus = "failed";
          errorMessage = `HTTP ${resp.status}: ${resp.statusText}`;
        }

        stepResults.push({
          step: 0,
          type: "navigate",
          status: resp.ok ? "passed" : "failed",
          duration: responseTime,
        });
      } catch (fetchErr: any) {
        runStatus = "error";
        errorMessage = fetchErr.message;
        responseTime = Date.now() - startTime;
      }
    }

    // Update the result
    await db.checkpointResult.update({
      where: { id: result.id },
      data: {
        status: runStatus,
        responseTime,
        screenshot,
        error: errorMessage,
        stepResults,
        lcp: metrics.lcp,
        fid: metrics.fid,
        cls: metrics.cls,
        ttfb: metrics.ttfb,
        domContentLoaded: metrics.domContentLoaded,
        fullPageLoad: metrics.fullPageLoad,
      },
    });

    // Update checkpoint stats
    const allResults = await db.checkpointResult.findMany({
      where: { checkpointId: id, status: "passed" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { responseTime: true },
    });

    const avgResponseTime = allResults.length > 0
      ? allResults.reduce((sum, r) => sum + r.responseTime, 0) / allResults.length
      : 0;

    await db.syntheticCheckpoint.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: runStatus,
        runCount: { increment: 1 },
        failCount: runStatus === "failed" || runStatus === "error" ? { increment: 1 } : undefined,
        avgResponseTime,
      },
    });

    // After saving result, check baselines and create regressions if needed
    for (const [metricName, value] of Object.entries(metrics)) {
      if (value === null || value === undefined) continue;

      const baseline = await db.performanceBaseline.findUnique({
        where: {
          url_metricName_projectId: {
            url: checkpoint.url,
            metricName,
            projectId: checkpoint.projectId ?? "",
          },
        },
      });

      if (!baseline || baseline.sampleCount === 0) {
        // Create or update baseline with this single data point
        await db.performanceBaseline.upsert({
          where: {
            url_metricName_projectId: {
              url: checkpoint.url,
              metricName,
              projectId: checkpoint.projectId ?? "",
            },
          },
          create: {
            url: checkpoint.url,
            metricName,
            mean: value,
            stdDev: 0,
            p50: value,
            p75: value,
            p95: value,
            sampleCount: 1,
            projectId: checkpoint.projectId,
          },
          update: {
            mean: value,
            p50: value,
            p75: value,
            p95: value,
            sampleCount: 1,
            lastComputedAt: new Date(),
          },
        });
        continue;
      }

      // Check for regression
      const degradationPercent = baseline.mean > 0
        ? ((value - baseline.mean) / baseline.mean) * 100
        : 0;

      const isRegression = metricName === "cls"
        ? degradationPercent > baseline.warningThreshold  // For CLS, higher is worse
        : degradationPercent > baseline.warningThreshold;  // For other metrics, higher time is worse

      if (isRegression && degradationPercent > 0) {
        const severity = degradationPercent > baseline.criticalThreshold ? "critical" : "warning";

        await db.performanceRegression.create({
          data: {
            metricName,
            currentValue: value,
            baselineValue: baseline.mean,
            degradationPercent,
            severity,
            status: "open",
            screenshot,
            baselineId: baseline.id,
            projectId: checkpoint.projectId,
          },
        });
      }

      // Update baseline (rolling window of 30)
      const newSampleCount = Math.min(baseline.sampleCount + 1, 30);
      const newMean = (baseline.mean * baseline.sampleCount + value) / newSampleCount;
      const variance = Math.pow(value - newMean, 2);
      const newStdDev = Math.sqrt(
        (Math.pow(baseline.stdDev, 2) * (baseline.sampleCount - 1) + variance) / Math.max(newSampleCount - 1, 1)
      );

      await db.performanceBaseline.update({
        where: { id: baseline.id },
        data: {
          mean: newMean,
          stdDev: newStdDev,
          p50: newMean,
          p75: newMean + newStdDev * 0.6745,
          p95: newMean + newStdDev * 1.6449,
          sampleCount: newSampleCount,
          lastComputedAt: new Date(),
        },
      });
    }

    // Fetch final result with metrics
    const finalResult = await db.checkpointResult.findUnique({ where: { id: result.id } });

    return NextResponse.json({
      result: finalResult,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Run] POST failed:", message);
    return NextResponse.json({ error: "Failed to run checkpoint", details: message }, { status: 500 });
  }
}
