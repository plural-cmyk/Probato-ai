import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── GET /api/reports ─ Get test report for a project ─────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const format = searchParams.get("format") ?? "summary";

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    // Get project with all related data
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        features: {
          orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
          include: { testCases: true },
        },
        testRuns: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { results: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Compute statistics
    const totalFeatures = project.features.length;
    const featuresByType: Record<string, number> = {};
    const featuresByPriority: Record<number, number> = {};

    for (const feature of project.features) {
      featuresByType[feature.type] = (featuresByType[feature.type] ?? 0) + 1;
      featuresByPriority[feature.priority] = (featuresByPriority[feature.priority] ?? 0) + 1;
    }

    const totalTestCases = project.features.reduce(
      (sum, f) => sum + f.testCases.length,
      0
    );
    const autoHealedTestCases = project.features.reduce(
      (sum, f) => sum + f.testCases.filter((tc) => tc.autoHealed).length,
      0
    );

    const totalRuns = project.testRuns.length;
    const passedRuns = project.testRuns.filter((r) => r.status === "passed").length;
    const failedRuns = project.testRuns.filter((r) => r.status === "failed" || r.status === "error").length;
    const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;

    // Compute trend data (last 10 runs)
    const recentRuns = project.testRuns.slice(0, 10).reverse();
    const trend = recentRuns.map((run) => {
      const passCount = run.results.filter((r) => r.status === "passed").length;
      const failCount = run.results.filter((r) => r.status === "failed").length;
      const avgDuration = run.results.length > 0
        ? Math.round(run.results.reduce((sum, r) => sum + (r.duration ?? 0), 0) / run.results.length)
        : 0;

      return {
        date: run.createdAt,
        status: run.status,
        passed: passCount,
        failed: failCount,
        total: run.results.length,
        avgDuration,
      };
    });

    // Compute per-feature test results
    const featureResults = project.features.map((feature) => {
      const featureRuns = project.testRuns.filter((run) =>
        run.results.some((r) => r.featureName === feature.name)
      );
      const featurePassed = featureRuns.filter((r) =>
        r.results.every((r) => r.featureName !== feature.name || r.status === "passed")
      ).length;

      return {
        id: feature.id,
        name: feature.name,
        type: feature.type,
        priority: feature.priority,
        testCaseCount: feature.testCases.length,
        autoHealed: feature.testCases.some((tc) => tc.autoHealed),
        runCount: featureRuns.length,
        passCount: featurePassed,
        failCount: featureRuns.length - featurePassed,
      };
    });

    const report = {
      project: {
        id: project.id,
        name: project.name,
        repoUrl: project.repoUrl,
        status: project.status,
        createdAt: project.createdAt,
        lastRunAt: project.lastRunAt,
      },
      summary: {
        totalFeatures,
        featuresByType,
        featuresByPriority,
        totalTestCases,
        autoHealedTestCases,
        totalRuns,
        passedRuns,
        failedRuns,
        passRate,
      },
      trend,
      featureResults,
    };

    if (format === "csv") {
      // Export as CSV
      const csvLines: string[] = [
        "Feature,Type,Priority,Test Cases,Auto-Healed,Runs,Passed,Failed",
        ...featureResults.map((f) =>
          `"${f.name}",${f.type},${f.priority},${f.testCaseCount},${f.autoHealed},${f.runCount},${f.passCount},${f.failCount}`
        ),
      ];
      return new NextResponse(csvLines.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${project.name}-report.csv"`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Reports] Failed:", message);
    return NextResponse.json({ error: "Report generation failed", details: message }, { status: 500 });
  }
}
