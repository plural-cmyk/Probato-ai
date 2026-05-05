import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/monitoring/dashboard ─ Aggregated monitoring dashboard data ──

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's checkpoints
    const checkpoints = await db.syntheticCheckpoint.findMany({
      where: { userId },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { results: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get baselines for user's projects
    const baselines = await db.performanceBaseline.findMany({
      where: {
        OR: [
          { project: { userId } },
          { projectId: null },
        ],
      },
      include: {
        project: { select: { id: true, name: true } },
      },
      orderBy: { lastComputedAt: "desc" },
    });

    // Get open regressions
    const openRegressions = await db.performanceRegression.findMany({
      where: {
        status: { in: ["open", "warning"] },
        OR: [
          { project: { userId } },
          { projectId: null },
        ],
      },
      include: {
        baseline: { select: { id: true, url: true, metricName: true, mean: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Compute summary stats
    const totalCheckpoints = checkpoints.length;
    const enabledCheckpoints = checkpoints.filter(c => c.enabled).length;
    const criticalCheckpoints = checkpoints.filter(c => c.severity === "critical").length;

    // Recent results (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentResults = await db.checkpointResult.findMany({
      where: {
        checkpoint: { userId },
        createdAt: { gte: oneDayAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const passedRecent = recentResults.filter(r => r.status === "passed").length;
    const failedRecent = recentResults.filter(r => r.status === "failed").length;
    const errorRecent = recentResults.filter(r => r.status === "error").length;

    // Regressions summary
    const openWarning = openRegressions.filter(r => r.severity === "warning").length;
    const openCritical = openRegressions.filter(r => r.severity === "critical").length;

    // Average Web Vitals across recent passed results
    const passedWithMetrics = recentResults.filter(
      r => r.status === "passed" && r.lcp !== null
    );
    const avgLCP = passedWithMetrics.length > 0
      ? passedWithMetrics.reduce((s, r) => s + (r.lcp ?? 0), 0) / passedWithMetrics.length
      : null;
    const avgFID = passedWithMetrics.length > 0
      ? passedWithMetrics.reduce((s, r) => s + (r.fid ?? 0), 0) / passedWithMetrics.length
      : null;
    const avgCLS = passedWithMetrics.length > 0
      ? passedWithMetrics.reduce((s, r) => s + (r.cls ?? 0), 0) / passedWithMetrics.length
      : null;
    const avgTTFB = passedWithMetrics.length > 0
      ? passedWithMetrics.reduce((s, r) => s + (r.ttfb ?? 0), 0) / passedWithMetrics.length
      : null;

    return NextResponse.json({
      summary: {
        totalCheckpoints,
        enabledCheckpoints,
        criticalCheckpoints,
        recentResults: {
          total: recentResults.length,
          passed: passedRecent,
          failed: failedRecent,
          error: errorRecent,
        },
        regressions: {
          openWarning,
          openCritical,
          total: openRegressions.length,
        },
        avgWebVitals: {
          lcp: avgLCP ? Math.round(avgLCP) : null,
          fid: avgFID ? Math.round(avgFID * 100) / 100 : null,
          cls: avgCLS ? Math.round(avgCLS * 1000) / 1000 : null,
          ttfb: avgTTFB ? Math.round(avgTTFB) : null,
        },
      },
      checkpoints,
      baselines,
      openRegressions: openRegressions.map(({ screenshot, ...rest }) => ({
        ...rest,
        hasScreenshot: !!screenshot,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Monitoring/Dashboard] GET failed:", message);
    return NextResponse.json({ error: "Failed to fetch monitoring dashboard", details: message }, { status: 500 });
  }
}
