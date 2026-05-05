import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/plugins/[id]/executions — List execution history for a plugin
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const extensionPoint = searchParams.get("extensionPoint");

    const existing = await db.plugin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
    }

    const where: Record<string, any> = { pluginId: id };
    if (status) where.status = status;
    if (extensionPoint) where.extensionPoint = extensionPoint;

    const [executions, total] = await Promise.all([
      db.pluginExecution.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.pluginExecution.count({ where }),
    ]);

    return NextResponse.json({
      executions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to list plugin executions:", error);
    return NextResponse.json({ error: "Failed to list plugin executions" }, { status: 500 });
  }
}
