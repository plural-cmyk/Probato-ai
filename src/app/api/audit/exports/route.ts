import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// GET /api/audit/exports — List audit log export configurations
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const exports = await db.auditLogExport.findMany({
      where: { teamId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ exports });
  } catch (error) {
    console.error("Failed to list audit exports:", error);
    return NextResponse.json({ error: "Failed to list audit exports" }, { status: 500 });
  }
}

// POST /api/audit/exports — Create audit log export configuration
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teamId, name, destination, config, retention, schedule, enabled } = body;

    if (!teamId || !name || !destination) {
      return NextResponse.json({ error: "teamId, name, and destination are required" }, { status: 400 });
    }

    const validDestinations = ["splunk", "datadog", "aws_cloudtrail", "webhook"];
    if (!validDestinations.includes(destination)) {
      return NextResponse.json({ error: `Invalid destination. Must be one of: ${validDestinations.join(", ")}` }, { status: 400 });
    }

    const exportConfig = await db.auditLogExport.create({
      data: {
        teamId,
        name,
        destination,
        config: config || {},
        retention: retention || "90d",
        schedule: schedule || "weekly",
        enabled: enabled !== undefined ? enabled : true,
      },
    });

    await createAuditLog({
      action: "audit.export.create",
      resource: "audit_log_export",
      resourceId: exportConfig.id,
      teamId,
      metadata: { name, destination, schedule },
      severity: "info",
    });

    return NextResponse.json({ export: exportConfig }, { status: 201 });
  } catch (error) {
    console.error("Failed to create audit export:", error);
    return NextResponse.json({ error: "Failed to create audit export" }, { status: 500 });
  }
}
