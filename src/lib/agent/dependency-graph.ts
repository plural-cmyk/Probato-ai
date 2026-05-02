/**
 * Probato Dependency Graph & Topological Sort
 *
 * Manages feature dependencies and determines the correct execution order
 * for running tests. Features may depend on other features (e.g., "Submit Order"
 * depends on "Add to Cart" which depends on "Browse Products").
 *
 * Provides:
 * - Dependency graph construction from Feature records
 * - Topological sort for test execution order
 * - Cycle detection (prevents infinite loops)
 * - Parallel group identification (independent features can run concurrently)
 * - Impact analysis (when a feature changes, what other features are affected?)
 */

import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────

export interface DependencyNode {
  id: string;
  name: string;
  type: string;
  priority: number;
  dependencies: string[];  // Feature IDs this node depends on
  dependents: string[];    // Feature IDs that depend on this node
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Array<{ from: string; to: string }>;
  cycles: string[][];       // Detected cycles (empty if graph is valid)
}

export interface ExecutionOrder {
  levels: string[][];       // Level 0 = no deps, Level 1 = depends on Level 0, etc.
  ordered: string[];        // Flat topological order
  parallelGroups: string[][]; // Features that can run in parallel
  totalFeatures: number;
  maxDepth: number;
}

export interface ImpactAnalysis {
  featureId: string;
  featureName: string;
  directlyAffected: string[];   // Direct dependents
  transitivelyAffected: string[]; // All downstream dependents
  totalAffected: number;
  riskLevel: "low" | "medium" | "high";
}

// ── Graph Construction ────────────────────────────────────────────

/**
 * Build a dependency graph from a project's features.
 */
export async function buildDependencyGraph(projectId: string): Promise<DependencyGraph> {
  const features = await db.feature.findMany({
    where: { projectId },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  const nodes = new Map<string, DependencyNode>();
  const edges: Array<{ from: string; to: string }> = [];

  // Create nodes
  for (const feature of features) {
    const deps = feature.dependencies as string[];
    nodes.set(feature.id, {
      id: feature.id,
      name: feature.name,
      type: feature.type,
      priority: feature.priority,
      dependencies: deps,
      dependents: [],
    });
  }

  // Build edges and populate dependents
  for (const [id, node] of nodes) {
    for (const depId of node.dependencies) {
      // Only add edge if the dependency exists in this project
      if (nodes.has(depId)) {
        edges.push({ from: id, to: depId });
        const depNode = nodes.get(depId);
        if (depNode && !depNode.dependents.includes(id)) {
          depNode.dependents.push(id);
        }
      }
    }
  }

  // Detect cycles
  const cycles = detectCycles(nodes, edges);

  return { nodes, edges, cycles };
}

/**
 * Build a dependency graph from feature name references (instead of IDs).
 * Useful when features reference each other by name (e.g., from LLM analysis).
 */
export async function buildDependencyGraphByName(projectId: string): Promise<DependencyGraph> {
  const features = await db.feature.findMany({
    where: { projectId },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  // Create name→ID mapping
  const nameToId = new Map<string, string>();
  for (const feature of features) {
    nameToId.set(feature.name.toLowerCase().trim(), feature.id);
  }

  const nodes = new Map<string, DependencyNode>();
  const edges: Array<{ from: string; to: string }> = [];

  // Create nodes
  for (const feature of features) {
    const deps = feature.dependencies as string[];
    nodes.set(feature.id, {
      id: feature.id,
      name: feature.name,
      type: feature.type,
      priority: feature.priority,
      dependencies: deps,
      dependents: [],
    });
  }

  // Resolve name-based dependencies to IDs
  for (const [id, node] of nodes) {
    const resolvedDeps: string[] = [];

    for (const depRef of node.dependencies) {
      // Try as ID first
      if (nodes.has(depRef)) {
        resolvedDeps.push(depRef);
        continue;
      }

      // Try as name
      const depId = nameToId.get(depRef.toLowerCase().trim());
      if (depId) {
        resolvedDeps.push(depId);
      }
    }

    // Update node with resolved deps
    node.dependencies = resolvedDeps;

    // Build edges
    for (const depId of resolvedDeps) {
      edges.push({ from: id, to: depId });
      const depNode = nodes.get(depId);
      if (depNode && !depNode.dependents.includes(id)) {
        depNode.dependents.push(id);
      }
    }
  }

  // Update features in DB with resolved dependency IDs
  for (const [id, node] of nodes) {
    if (node.dependencies.length > 0) {
      try {
        await db.feature.update({
          where: { id },
          data: { dependencies: node.dependencies },
        });
      } catch {
        // Skip if update fails
      }
    }
  }

  const cycles = detectCycles(nodes, edges);
  return { nodes, edges, cycles };
}

// ── Topological Sort ───────────────────────────────────────────────

/**
 * Compute the topological execution order for tests.
 * Features with no dependencies run first (level 0),
 * then features that depend on level 0 (level 1), etc.
 */
export function computeExecutionOrder(graph: DependencyGraph): ExecutionOrder {
  const { nodes } = graph;
  const levels: string[][] = [];
  const visited = new Set<string>();
  const inDegree = new Map<string, number>();

  // Compute in-degrees
  for (const [id, node] of nodes) {
    inDegree.set(id, node.dependencies.filter((depId) => nodes.has(depId)).length);
  }

  // Kahn's algorithm for topological sort
  let currentLevel: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      currentLevel.push(id);
    }
  }

  while (currentLevel.length > 0) {
    levels.push([...currentLevel]);

    const nextLevel: string[] = [];
    for (const id of currentLevel) {
      visited.add(id);
      const node = nodes.get(id);
      if (node) {
        for (const dependentId of node.dependents) {
          if (!visited.has(dependentId)) {
            const currentDegree = inDegree.get(dependentId) ?? 0;
            inDegree.set(dependentId, currentDegree - 1);
            if (currentDegree - 1 === 0) {
              nextLevel.push(dependentId);
            }
          }
        }
      }
    }
    currentLevel = nextLevel;
  }

  // Add any remaining nodes (part of cycles) at the end
  const remaining: string[] = [];
  for (const [id] of nodes) {
    if (!visited.has(id)) {
      remaining.push(id);
    }
  }
  if (remaining.length > 0) {
    levels.push(remaining);
  }

  // Build flat order
  const ordered = levels.flat();

  // Build parallel groups (features at the same level can run in parallel)
  const parallelGroups = levels.filter((level) => level.length > 0);

  return {
    levels,
    ordered,
    parallelGroups,
    totalFeatures: nodes.size,
    maxDepth: levels.length,
  };
}

/**
 * Get the execution order for a project, building the graph and sorting.
 */
export async function getProjectExecutionOrder(projectId: string): Promise<ExecutionOrder & { graph: DependencyGraph }> {
  const graph = await buildDependencyGraph(projectId);
  const order = computeExecutionOrder(graph);
  return { ...order, graph };
}

// ── Cycle Detection ────────────────────────────────────────────────

/**
 * Detect cycles in the dependency graph using DFS.
 * Returns an array of cycles, where each cycle is a list of feature IDs.
 */
function detectCycles(
  nodes: Map<string, DependencyNode>,
  _edges: Array<{ from: string; to: string }>
): string[][] {
  const cycles: string[][] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();

  // Initialize
  for (const [id] of nodes) {
    color.set(id, WHITE);
    parent.set(id, null);
  }

  // DFS
  for (const [id] of nodes) {
    if (color.get(id) === WHITE) {
      dfs(id, nodes, color, parent, cycles);
    }
  }

  return cycles;
}

function dfs(
  nodeId: string,
  nodes: Map<string, DependencyNode>,
  color: Map<string, number>,
  parent: Map<string, string | null>,
  cycles: string[][],
  path: string[] = []
): void {
  color.set(nodeId, GRAY);
  path.push(nodeId);

  const node = nodes.get(nodeId);
  if (node) {
    for (const depId of node.dependencies) {
      if (!nodes.has(depId)) continue;

      const depColor = color.get(depId);
      if (depColor === GRAY) {
        // Found a cycle — extract it from the path
        const cycleStart = path.indexOf(depId);
        if (cycleStart >= 0) {
          cycles.push(path.slice(cycleStart));
        }
      } else if (depColor === WHITE) {
        parent.set(depId, nodeId);
        dfs(depId, nodes, color, parent, cycles, path);
      }
    }
  }

  path.pop();
  color.set(nodeId, BLACK);
}

// ── Impact Analysis ───────────────────────────────────────────────

/**
 * Analyze the impact of changing a feature.
 * Identifies all features that would be affected if this feature's tests fail.
 */
export function analyzeImpact(
  graph: DependencyGraph,
  featureId: string
): ImpactAnalysis {
  const { nodes } = graph;
  const node = nodes.get(featureId);

  if (!node) {
    return {
      featureId,
      featureName: "Unknown",
      directlyAffected: [],
      transitivelyAffected: [],
      totalAffected: 0,
      riskLevel: "low",
    };
  }

  // BFS to find all transitive dependents
  const directlyAffected = [...node.dependents];
  const transitivelyAffected: string[] = [];
  const visited = new Set<string>([featureId, ...node.dependents]);

  const queue = [...node.dependents];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentNode = nodes.get(currentId);
    if (currentNode) {
      for (const depId of currentNode.dependents) {
        if (!visited.has(depId)) {
          visited.add(depId);
          transitivelyAffected.push(depId);
          queue.push(depId);
        }
      }
    }
  }

  const totalAffected = directlyAffected.length + transitivelyAffected.length;

  // Risk level
  let riskLevel: "low" | "medium" | "high";
  if (totalAffected === 0) {
    riskLevel = "low";
  } else if (totalAffected <= 2) {
    riskLevel = "medium";
  } else {
    riskLevel = "high";
  }

  // If the feature is P1 (critical), bump risk level
  if (node.priority === 1 && riskLevel !== "high") {
    riskLevel = riskLevel === "low" ? "medium" : "high";
  }

  return {
    featureId,
    featureName: node.name,
    directlyAffected,
    transitivelyAffected,
    totalAffected,
    riskLevel,
  };
}

/**
 * Get impact analysis for all features in a project.
 */
export async function getProjectImpactAnalysis(projectId: string): Promise<ImpactAnalysis[]> {
  const graph = await buildDependencyGraph(projectId);
  const analyses: ImpactAnalysis[] = [];

  for (const [id] of graph.nodes) {
    analyses.push(analyzeImpact(graph, id));
  }

  // Sort by risk level (high first), then by total affected
  return analyses.sort((a, b) => {
    const riskOrder = { high: 0, medium: 1, low: 2 };
    const riskDiff = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    if (riskDiff !== 0) return riskDiff;
    return b.totalAffected - a.totalAffected;
  });
}
