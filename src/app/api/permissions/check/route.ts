import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/permissions/check — Check if a user has a specific permission
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, resource, action, resourceId } = body;

    if (!userId || !resource || !action) {
      return NextResponse.json({ error: "userId, resource, and action are required" }, { status: 400 });
    }

    // 1. Check team role permissions (owner/admin have full access)
    const teamMemberships = await db.teamMember.findMany({
      where: { userId, status: "active" },
      include: {
        team: {
          include: {
            permissionPolicies: true,
          },
        },
      },
    });

    // Check if user is owner/admin in any team
    for (const membership of teamMemberships) {
      if (membership.role === "owner" || membership.role === "admin") {
        return NextResponse.json({
          allowed: true,
          source: `team_role:${membership.role}`,
        });
      }
    }

    // 2. Check permission policies
    for (const membership of teamMemberships) {
      for (const policy of membership.team.permissionPolicies) {
        if (!policy) continue;
        const perms = policy.permissions as Array<{ resource: string; actions: string[] }>;
        if (!Array.isArray(perms)) continue;

        for (const perm of perms) {
          if (perm.resource === resource && perm.actions?.includes(action)) {
            // Check conditions if any
            if (policy.conditions) {
              const conditions = policy.conditions as Array<Record<string, any>>;
              if (Array.isArray(conditions)) {
                // Simplified condition check — in production, evaluate time_of_day, ip_allowlist etc.
                for (const condition of conditions) {
                  if (condition.type === "time_of_day") {
                    const now = new Date();
                    const hours = now.getUTCHours();
                    const startHour = parseInt(condition.start?.split(":")[0] || "0");
                    const endHour = parseInt(condition.end?.split(":")[0] || "23");
                    if (hours < startHour || hours > endHour) {
                      continue; // Condition not met, skip this policy
                    }
                  }
                }
              }
            }

            return NextResponse.json({
              allowed: true,
              source: `policy:${policy.name}`,
            });
          }
        }
      }
    }

    // 3. Check resource-level overrides
    const resourcePermWhere: Record<string, any> = { userId };
    if (resourceId) {
      resourcePermWhere.resourceId = resourceId;
      resourcePermWhere.resourceType = resource;
    } else {
      resourcePermWhere.resourceType = resource;
    }

    const resourcePerms = await db.resourcePermission.findMany({
      where: resourcePermWhere,
      include: { policy: true },
    });

    for (const rp of resourcePerms) {
      const customActions = rp.customActions as string[];
      if (Array.isArray(customActions) && customActions.includes(action)) {
        return NextResponse.json({
          allowed: true,
          source: `resource_override:${rp.resourceType}/${rp.resourceId}`,
        });
      }

      if (rp.policy) {
        const perms = rp.policy.permissions as Array<{ resource: string; actions: string[] }>;
        if (Array.isArray(perms)) {
          for (const perm of perms) {
            if (perm.resource === resource && perm.actions?.includes(action)) {
              return NextResponse.json({
                allowed: true,
                source: `resource_policy:${rp.policy.name}`,
              });
            }
          }
        }
      }
    }

    // 4. Check global default policies
    const globalPolicies = await db.permissionPolicy.findMany({
      where: { teamId: null, isDefault: true },
    });

    for (const policy of globalPolicies) {
      const perms = policy.permissions as Array<{ resource: string; actions: string[] }>;
      if (!Array.isArray(perms)) continue;

      for (const perm of perms) {
        if (perm.resource === resource && perm.actions?.includes(action)) {
          return NextResponse.json({
            allowed: true,
            source: `global_policy:${policy.name}`,
          });
        }
      }
    }

    return NextResponse.json({
      allowed: false,
      source: "denied",
    });
  } catch (error) {
    console.error("Permission check failed:", error);
    return NextResponse.json({ error: "Permission check failed" }, { status: 500 });
  }
}
