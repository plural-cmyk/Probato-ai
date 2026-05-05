import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// GET /api/plugins — List installed plugins for team
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const status = searchParams.get("status");
    const tier = searchParams.get("tier");
    const enabled = searchParams.get("enabled");

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const where: Record<string, any> = { teamId };
    if (status) where.status = status;
    if (tier) where.tier = tier;
    if (enabled !== null && enabled !== undefined) where.enabled = enabled === "true";

    const plugins = await db.plugin.findMany({
      where,
      include: {
        _count: { select: { executions: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ plugins });
  } catch (error) {
    console.error("Failed to list plugins:", error);
    return NextResponse.json({ error: "Failed to list plugins" }, { status: 500 });
  }
}

// POST /api/plugins — Install a new plugin
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      teamId,
      name,
      version,
      description,
      author,
      homepage,
      manifest,
      extensionPoints,
      permissions,
      tier,
      config,
      checksum,
      signature,
      isPrivate,
      installedBy,
    } = body;

    if (!teamId || !name || !version) {
      return NextResponse.json(
        { error: "teamId, name, and version are required" },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existing = await db.plugin.findUnique({
      where: { teamId_name: { teamId, name } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Plugin with this name already installed for this team" },
        { status: 409 }
      );
    }

    const plugin = await db.plugin.create({
      data: {
        teamId,
        name,
        version,
        description: description || null,
        author: author || null,
        homepage: homepage || null,
        manifest: manifest || {},
        extensionPoints: extensionPoints || [],
        permissions: permissions || [],
        tier: tier || "community",
        status: "installed",
        enabled: false,
        config: config || {},
        checksum: checksum || null,
        signature: signature || null,
        isPrivate: isPrivate || false,
        installedBy: installedBy || null,
      },
    });

    await createAuditLog({
      action: "plugin.install",
      resource: "plugin",
      resourceId: plugin.id,
      teamId,
      userId: installedBy,
      metadata: { name, version, tier },
      severity: "info",
    });

    return NextResponse.json({ plugin }, { status: 201 });
  } catch (error) {
    console.error("Failed to install plugin:", error);
    return NextResponse.json({ error: "Failed to install plugin" }, { status: 500 });
  }
}
