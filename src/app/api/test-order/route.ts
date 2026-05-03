import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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

    // Build dependency graph and compute execution order
    const { graph, ...order } = await getProjectExecutionOrder(projectId);

    // Build node details for the response
    const nodeDetails = new Map<string, { name: string; type: string; priority: number }>();
    for (const [id, node] of graph.nodes) {
      nodeDetails.set(id, { name: node.name, type: node.type, priority: node.priority });
    }

    const response: Record<string, unknown> = {
      projectId,
      executionOrder: {
        levels: order.levels.map((level) =>
          level.map((id) => ({ id, ...nodeDetails.get(id) }))
        ),
        totalFeatures: order.totalFeatures,
        maxDepth: order.maxDepth,
        parallelGroups: order.parallelGroups.map((group) =>
          group.map((id) => ({ id, ...nodeDetails.get(id) }))
        ),
      },
      cycles: graph.cycles,
      cycleCount: graph.cycles.length,
    };

    // Include impact analysis if requested
    if (includeImpact) {
      const impact = await getProjectImpactAnalysis(projectId);
      response.impactAnalysis = impact;
    }

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Test Order] Failed:", message);
    return NextResponse.json({ error: "Failed to compute test order", details: message }, { status: 500 });
  }
}
