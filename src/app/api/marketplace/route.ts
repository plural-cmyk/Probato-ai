import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/marketplace — Browse marketplace listings
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const tier = searchParams.get("tier");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "recent";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const featured = searchParams.get("featured");

    const where: Record<string, any> = { status: "published" };

    if (category) where.category = category;
    if (tier) where.tier = tier;
    if (featured === "true") where.featured = true;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { author: { contains: search, mode: "insensitive" } },
      ];
    }

    const orderBy: Record<string, string> = {};
    switch (sort) {
      case "popular":
        orderBy.installCount = "desc";
        break;
      case "rating":
        orderBy.avgRating = "desc";
        break;
      case "name":
        orderBy.name = "asc";
        break;
      case "recent":
      default:
        orderBy.createdAt = "desc";
        break;
    }

    const [listings, total] = await Promise.all([
      db.marketplaceListing.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { reviews: true } },
        },
      }),
      db.marketplaceListing.count({ where }),
    ]);

    return NextResponse.json({
      listings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to browse marketplace:", error);
    return NextResponse.json({ error: "Failed to browse marketplace" }, { status: 500 });
  }
}
