import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/audit/logs — Query audit logs with filters and cursor pagination
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const action = searchParams.get("action");
    const resource = searchParams.get("resource");
    const userId = searchParams.get("userId");
    const severity = searchParams.get("severity");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const cursor = searchParams.get("cursor");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Record<string, any> = {};
    if (teamId) where.teamId = teamId;
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (resource) where.resource = resource;
    if (userId) where.userId = userId;
    if (severity) where.severity = severity;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const query: Record<string, any> = {
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    };

    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1;
    }

    const logs = await db.auditLog.findMany(query);

    let nextCursor: string | null = null;
    if (logs.length > limit) {
      const nextItem = logs.pop();
      nextCursor = nextItem.id;
    }

    const total = await db.auditLog.count({ where });

    return NextResponse.json({
      logs,
      nextCursor,
      total,
      hasMore: !!nextCursor,
    });
  } catch (error) {
    console.error("Failed to query audit logs:", error);
    return NextResponse.json({ error: "Failed to query audit logs" }, { status: 500 });
  }
}
