import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

const DEFAULT_POLICIES = [
  {
    name: "Full Access",
    description: "All resources, all actions",
    isDefault: true,
    permissions: [{ resource: "projects", actions: ["read", "write", "delete"] }, { resource: "test_runs", actions: ["read", "execute", "delete"] }, { resource: "features", actions: ["read", "write", "delete"] }, { resource: "schedules", actions: ["read", "write", "delete"] }, { resource: "billing", actions: ["read", "write"] }, { resource: "team", actions: ["read", "write", "delete"] }],
    scope: "team",
  },
  {
    name: "Test Runner",
    description: "Execute tests and view projects",
    isDefault: true,
    permissions: [{ resource: "test_runs", actions: ["read", "execute"] }, { resource: "projects", actions: ["read"] }],
    scope: "team",
  },
  {
    name: "Project Admin",
    description: "Manage projects, run tests, manage features",
    isDefault: true,
    permissions: [{ resource: "projects", actions: ["read", "write", "delete"] }, { resource: "test_runs", actions: ["read", "execute"] }, { resource: "features", actions: ["read", "write"] }],
    scope: "team",
  },
  {
    name: "Viewer",
    description: "Read-only access to all resources",
    isDefault: true,
    permissions: [{ resource: "projects", actions: ["read"] }, { resource: "test_runs", actions: ["read"] }, { resource: "features", actions: ["read"] }, { resource: "schedules", actions: ["read"] }, { resource: "billing", actions: ["read"] }, { resource: "team", actions: ["read"] }],
    scope: "team",
  },
  {
    name: "Billing Admin",
    description: "Manage billing and view projects",
    isDefault: true,
    permissions: [{ resource: "billing", actions: ["read", "write"] }, { resource: "projects", actions: ["read"] }],
    scope: "team",
  },
];

// GET /api/permissions/policies — List permission policies
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const scope = searchParams.get("scope");

    const where: Record<string, any> = {};
    if (teamId) where.teamId = teamId;
    if (scope) where.scope = scope;

    // Include global default policies (teamId = null)
    if (teamId) {
      where.OR = [
        { teamId },
        { teamId: null, isDefault: true },
      ];
      delete where.teamId;
    }

    const policies = await db.permissionPolicy.findMany({
      where,
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({ policies });
  } catch (error) {
    console.error("Failed to list permission policies:", error);
    return NextResponse.json({ error: "Failed to list permission policies" }, { status: 500 });
  }
}

// POST /api/permissions/policies — Create permission policy (also seeds defaults)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teamId, name, description, permissions, conditions, scope } = body;

    // Seed default policies if none exist
    if (teamId && !name) {
      const existingDefaults = await db.permissionPolicy.count({
        where: { teamId, isDefault: true },
      });

      if (existingDefaults === 0) {
        const created = [];
        for (const policy of DEFAULT_POLICIES) {
          const p = await db.permissionPolicy.create({
            data: {
              teamId,
              name: policy.name,
              description: policy.description,
              isDefault: policy.isDefault,
              permissions: policy.permissions,
              scope: policy.scope,
            },
          });
          created.push(p);
        }
        return NextResponse.json({ policies: created, seeded: true }, { status: 201 });
      }

      return NextResponse.json({ policies: [], seeded: false });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const policy = await db.permissionPolicy.create({
      data: {
        teamId: teamId || null,
        name,
        description: description || null,
        isDefault: false,
        permissions: permissions || [],
        conditions: conditions || null,
        scope: scope || "team",
      },
    });

    if (teamId) {
      await createAuditLog({
        action: "permissions.policy.create",
        resource: "permission_policy",
        resourceId: policy.id,
        teamId,
        metadata: { name, scope },
        severity: "info",
      });
    }

    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    console.error("Failed to create permission policy:", error);
    return NextResponse.json({ error: "Failed to create permission policy" }, { status: 500 });
  }
}
