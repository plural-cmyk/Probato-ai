import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getProjectExecutionOrder,
  getProjectImpactAnalysis,
  buildDependencyGraph,
} from "@/lib/agent/dependency-graph";

export const dynamic = "force-dynamic";

// ── GET /api/test-order ─ Get test execution order for a project ──

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const includeImpact = searchParams.get("impact") === "true";

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    // Verify the project exists and belongs to the user
    const project = await db.project.findFirst({
      where: { id: projectId, userId: session.user.id },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check if project has features
    const featureCount = await db.feature.count({ where: { projectId } });
    if (featureCount === 0) {
      return NextResponse.json({
        projectId,
        executionOrder: {
          levels: [],
          totalFeatures: 0,
          maxDepth: 0,
          parallelGroups: [],
        },
        cycles: [],
        cycleCount: 0,
        impactAnalysis: [],
        message: "No features found for this project. Run discovery first.",
      });
    }

    // Build dependency graph and compute execution order
    let graph, order;
    try {
      const result = await getProjectExecutionOrder(projectId);
      graph = result.graph;
      order = result;
    } catch (graphError) {
      const msg = graphError instanceof Error ? graphError.message : String(graphError);
      console.error("[Test Order] Dependency graph build failed:", msg);
      // Fallback: return features in simple order without dependency resolution
      const features = await db.feature.findMany({
        where: { projectId },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      });
      return NextResponse.json({
        projectId,
        executionOrder: {
          levels: [features.map((f) => ({ id: f.id, name: f.name, type: f.type, priority: f.priority }))],
          totalFeatures: features.length,
          maxDepth: 1,
          parallelGroups: [features.map((f) => f.id)],
          cycleCount: 0,
        },
        cycles: [],
        cycleCount: 0,
        warning: `Dependency graph could not be built (${msg}). Showing features in priority order.`,
      });
    }

    // Build node details for the response
    const nodeDetails = new Map<string, { name: string; type: string; priority: number }>();
    for (const [id, node] of graph.nodes) {
      nodeDetails.set(id, { name: node.name, type: node.type, priority: node.priority });
    }

    const response: Record<string, unknown> = {
      projectId,
      executionOrder: {
        levels: order.levels.map((level) =>
          level.map((id) => ({ id, ...(nodeDetails.get(id) ?? { name: "Unknown", type: "unknown", priority: 0 }) }))
        ),
        totalFeatures: order.totalFeatures,
        maxDepth: order.maxDepth,
        parallelGroups: order.parallelGroups.map((group) =>
          group.map((id) => ({ id, ...(nodeDetails.get(id) ?? { name: "Unknown", type: "unknown", priority: 0 }) }))
        ),
        cycleCount: graph.cycles.length,
      },
      cycles: graph.cycles,
      cycleCount: graph.cycles.length,
    };

    // Include impact analysis if requested
    if (includeImpact) {
      try {
        const impact = await getProjectImpactAnalysis(projectId);
        response.impactAnalysis = impact;
      } catch (impactError) {
        console.warn("[Test Order] Impact analysis failed, skipping:", impactError);
        response.impactAnalysis = [];
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Test Order] Failed:", message, error instanceof Error ? error.stack : "");
    return NextResponse.json({ error: "Failed to compute test order", details: message }, { status: 500 });
  }
}
