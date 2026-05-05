/**
 * POST /api/intelligence/auto-heal
 *
 * Intelligence-to-Action Loop: Triggers self-healing based on flakiness predictions.
 * Finds flaky tests (from FlakinessReport), triggers selector repair via the self-heal engine,
 * uses flakiness hints (failCluster) to prioritize repair candidates.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, maxRepairs } = body as {
      projectId: string;
      maxRepairs?: number;
    };

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    const maxRepairsLimit = Math.min(maxRepairs || 10, 50);

    // Find the project
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { user: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Find flaky tests in the project via FlakinessReport
    const flakyReports = await db.flakinessReport.findMany({
      where: {
        testCase: {
          feature: { projectId },
        },
        classification: { in: ["flaky", "failing"] },
      },
      include: {
        testCase: {
          include: {
            feature: true,
            selectorRepairs: {
              where: { status: { in: ["pending", "approved"] } },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { flakinessScore: "desc" },
      take: maxRepairsLimit,
    });

    if (flakyReports.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No flaky tests found in this project",
        repairsAttempted: 0,
        repairs: [],
      });
    }

    // Prioritize by failCluster (selector-related failures first)
    // Use the primaryIndicator from the FlakinessReport as priority hint
    const prioritizedReports = [...flakyReports].sort((a, b) => {
      const priorityOrder: Record<string, number> = {
        selector: 0,
        timeout: 1,
        assertion: 2,
        resource: 3,
        external: 4,
        unknown: 5,
      };
      const aCluster = a.primaryIndicator || "unknown";
      const bCluster = b.primaryIndicator || "unknown";
      return (priorityOrder[aCluster] ?? 5) - (priorityOrder[bCluster] ?? 5);
    });

    const repairs: Array<{
      testCaseId: string;
      testCaseName: string;
      flakinessScore: number;
      classification: string;
      repairStatus: "attempted" | "skipped_existing" | "skipped_no_selector" | "created";
      repairId?: string;
      oldSelector?: string;
      newSelector?: string;
      confidence?: number;
    }> = [];

    for (const report of prioritizedReports) {
      const testCase = report.testCase;

      // Skip if there's already a pending/approved repair
      if (testCase.selectorRepairs.length > 0) {
        repairs.push({
          testCaseId: testCase.id,
          testCaseName: testCase.name,
          flakinessScore: report.flakinessScore,
          classification: report.classification,
          repairStatus: "skipped_existing",
        });
        continue;
      }

      // Skip if the test case has no selector to repair
      if (!testCase.selector) {
        repairs.push({
          testCaseId: testCase.id,
          testCaseName: testCase.name,
          flakinessScore: report.flakinessScore,
          classification: report.classification,
          repairStatus: "skipped_no_selector",
        });
        continue;
      }

      // Create a selector repair record (the actual repair will be picked up by the self-heal engine)
      const suggestedSelector = generateHeuristicRepair(testCase.selector);

      const selectorRepair = await db.selectorRepair.create({
        data: {
          testCaseId: testCase.id,
          oldSelector: testCase.selector,
          newSelector: suggestedSelector,
          confidence: 0.6, // Heuristic confidence
          status: "pending",
          domSnapshot: {
            flakinessScore: report.flakinessScore,
            classification: report.classification,
            primaryIndicator: report.primaryIndicator,
            source: "auto-heal-from-flakiness",
          },
        },
      });

      repairs.push({
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        flakinessScore: report.flakinessScore,
        classification: report.classification,
        repairStatus: "created",
        repairId: selectorRepair.id,
        oldSelector: testCase.selector,
        newSelector: suggestedSelector,
        confidence: selectorRepair.confidence,
      });
    }

    const attemptedCount = repairs.filter(
      (r) => r.repairStatus === "created"
    ).length;
    const skippedCount = repairs.filter(
      (r) => r.repairStatus !== "created"
    ).length;

    // Create audit log entry
    await createAuditLog({
      action: "intelligence.auto_heal",
      resource: "project",
      resourceId: projectId,
      resourceType: "project",
      userId: project.userId,
      userEmail: project.user?.email || undefined,
      userName: project.user?.name || undefined,
      metadata: {
        flakyTestsFound: flakyReports.length,
        repairsCreated: attemptedCount,
        repairsSkipped: skippedCount,
        maxRepairsLimit,
      },
      severity: attemptedCount > 0 ? "warning" : "info",
      teamId: project.teamId || undefined,
    });

    return NextResponse.json({
      success: true,
      flakyTestsFound: flakyReports.length,
      repairsAttempted: attemptedCount,
      repairsSkipped: skippedCount,
      repairs,
    });
  } catch (error) {
    console.error("[intelligence/auto-heal] Error:", error);
    return NextResponse.json(
      { error: "Failed to trigger auto-heal from flakiness" },
      { status: 500 }
    );
  }
}

/**
 * Generate a heuristic repair suggestion for a broken selector.
 * Tries alternative selector strategies based on the original.
 */
function generateHeuristicRepair(originalSelector: string): string {
  // If it's a CSS selector with an ID, try a data-testid alternative
  if (originalSelector.startsWith("#")) {
    const id = originalSelector.slice(1);
    return `[data-testid="${id}"], #${id}`;
  }

  // If it's a class selector, try more specific alternatives
  if (originalSelector.startsWith(".")) {
    const className = originalSelector.slice(1);
    return `[data-testid*="${className}"], .${className}, [class*="${className}"]`;
  }

  // If it contains a data-testid, add fallback
  if (originalSelector.includes("[data-testid")) {
    return `${originalSelector}, [aria-label]`;
  }

  // Default: add broader fallback selectors
  return `${originalSelector}, [data-testid], [aria-label]`;
}
