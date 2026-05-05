import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// POST /api/marketplace/[id]/install — Install a marketplace plugin
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { teamId, userId } = body;

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const listing = await db.marketplaceListing.findUnique({
      where: { id },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (listing.status !== "published") {
      return NextResponse.json(
        { error: "This plugin is not available for installation" },
        { status: 400 }
      );
    }

    // Check if already installed
    const existing = await db.plugin.findUnique({
      where: { teamId_name: { teamId, name: listing.name } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Plugin already installed for this team", plugin: existing },
        { status: 409 }
      );
    }

    // Create plugin from listing
    const plugin = await db.plugin.create({
      data: {
        teamId,
        name: listing.name,
        version: listing.version,
        description: listing.description,
        author: listing.author,
        homepage: listing.homepage,
        manifest: {
          configSchema: listing.configSchema,
        },
        extensionPoints: listing.extensionPoints,
        permissions: listing.requiredPermissions,
        tier: listing.tier,
        status: "installed",
        enabled: false,
        config: {},
        checksum: listing.checksum,
        signature: listing.signature,
        installedBy: userId || null,
      },
    });

    // Increment install count
    await db.marketplaceListing.update({
      where: { id },
      data: {
        installCount: { increment: 1 },
      },
    });

    await createAuditLog({
      action: "marketplace.install",
      resource: "plugin",
      resourceId: plugin.id,
      teamId,
      userId,
      metadata: { name: listing.name, version: listing.version, listingId: id },
      severity: "info",
    });

    return NextResponse.json({ plugin }, { status: 201 });
  } catch (error) {
    console.error("Failed to install marketplace plugin:", error);
    return NextResponse.json({ error: "Failed to install marketplace plugin" }, { status: 500 });
  }
}
