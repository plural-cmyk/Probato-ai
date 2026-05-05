/**
 * GET /api/integration/audit-summary
 *
 * Compliance-to-Audit Trail: Aggregated audit summary across all Phase 6 actions.
 * Query params: teamId, dateRange (7d, 30d, 90d), category
 * Returns aggregated counts by action type, severity breakdown, top actors, timeline
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const dateRange = searchParams.get("dateRange") || "30d";
    const category = searchParams.get("category");

    // Calculate date filter
    const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const days = daysMap[dateRange] || 30;
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Build where clause
    const where: any = {
      createdAt: { gte: sinceDate },
    };

    if (teamId) {
      where.teamId = teamId;
    }

    // Category filter: map Phase 6 category to action prefixes
    if (category) {
      const categoryPrefixes: Record<string, string[]> = {
        intelligence: ["intelligence.", "flakiness."],
        self_heal: ["self_heal.", "auto-heal", "selector_repair."],
        monitoring: ["monitoring.", "checkpoint.", "performance."],
        sso: ["sso.", "auth.sso"],
        plugins: ["plugin.", "marketplace."],
        general: [],
      };

      const prefixes = categoryPrefixes[category];
      if (prefixes && prefixes.length > 0) {
        where.action = {
          in: prefixes,
        };
      } else if (category !== "general") {
        // If unknown category, return empty
        return NextResponse.json({
          success: true,
          dateRange,
          sinceDate: sinceDate.toISOString(),
          totalActions: 0,
          byActionType: {},
          bySeverity: {},
          topActors: [],
          timeline: [],
          categories: [],
        });
      }
    }

    // Fetch audit logs
    const auditLogs = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 1000, // Limit for performance
      select: {
        id: true,
        action: true,
        resource: true,
        severity: true,
        userId: true,
        userEmail: true,
        userName: true,
        teamId: true,
        createdAt: true,
        metadata: true,
      },
    });

    // Aggregate by action type
    const byActionType: Record<string, number> = {};
    for (const log of auditLogs) {
      const prefix = log.action.split(".")[0];
      byActionType[prefix] = (byActionType[prefix] || 0) + 1;
    }

    // Aggregate by severity
    const bySeverity: Record<string, number> = {};
    for (const log of auditLogs) {
      bySeverity[log.severity] = (bySeverity[log.severity] || 0) + 1;
    }

    // Top actors (by action count)
    const actorCounts: Record<string, { name: string; email: string; count: number }> = {};
    for (const log of auditLogs) {
      const actorKey = log.userId || "system";
      if (!actorCounts[actorKey]) {
        actorCounts[actorKey] = {
          name: log.userName || "System",
          email: log.userEmail || "",
          count: 0,
        };
      }
      actorCounts[actorKey].count++;
    }
    const topActors = Object.entries(actorCounts)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Timeline: group by day
    const timelineMap: Record<string, { date: string; count: number; severities: Record<string, number> }> = {};
    for (const log of auditLogs) {
      const dateKey = log.createdAt.toISOString().split("T")[0];
      if (!timelineMap[dateKey]) {
        timelineMap[dateKey] = {
          date: dateKey,
          count: 0,
          severities: {},
        };
      }
      timelineMap[dateKey].count++;
      timelineMap[dateKey].severities[log.severity] =
        (timelineMap[dateKey].severities[log.severity] || 0) + 1;
    }
    const timeline = Object.values(timelineMap).sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    // Categorize into Phase 6 buckets
    const categoryMapping: Record<string, string> = {
      intelligence: "intelligence",
      flakiness: "intelligence",
      "auto-heal": "self_heal",
      self_heal: "self_heal",
      selector_repair: "self_heal",
      monitoring: "monitoring",
      checkpoint: "monitoring",
      performance: "monitoring",
      sso: "sso",
      auth: "sso",
      plugin: "plugins",
      marketplace: "plugins",
    };

    const categories: Array<{
      category: string;
      count: number;
      severities: Record<string, number>;
    }> = [];
    const catMap: Record<string, { count: number; severities: Record<string, number> }> = {};

    for (const log of auditLogs) {
      const prefix = log.action.split(".")[0];
      const cat = categoryMapping[prefix] || "general";
      if (!catMap[cat]) {
        catMap[cat] = { count: 0, severities: {} };
      }
      catMap[cat].count++;
      catMap[cat].severities[log.severity] =
        (catMap[cat].severities[log.severity] || 0) + 1;
    }

    for (const [cat, data] of Object.entries(catMap)) {
      categories.push({ category: cat, ...data });
    }
    categories.sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      dateRange,
      sinceDate: sinceDate.toISOString(),
      totalActions: auditLogs.length,
      byActionType,
      bySeverity,
      topActors,
      timeline,
      categories,
    });
  } catch (error) {
    console.error("[audit-summary] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate audit summary" },
      { status: 500 }
    );
  }
}
