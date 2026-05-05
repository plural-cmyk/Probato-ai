import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/audit/logs/[id] — Get specific audit log entry
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const log = await db.auditLog.findUnique({ where: { id } });

    if (!log) {
      return NextResponse.json({ error: "Audit log entry not found" }, { status: 404 });
    }

    return NextResponse.json({ log });
  } catch (error) {
    console.error("Failed to get audit log:", error);
    return NextResponse.json({ error: "Failed to get audit log entry" }, { status: 500 });
  }
}
