import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/marketplace/[id] — Get marketplace listing details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const listing = await db.marketplaceListing.findUnique({
      where: { id },
      include: {
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ listing });
  } catch (error) {
    console.error("Failed to get marketplace listing:", error);
    return NextResponse.json({ error: "Failed to get marketplace listing" }, { status: 500 });
  }
}
