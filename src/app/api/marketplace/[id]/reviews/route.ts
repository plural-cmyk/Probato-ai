import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

// GET /api/marketplace/[id]/reviews — List reviews for a listing
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const listing = await db.marketplaceListing.findUnique({ where: { id } });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const [reviews, total] = await Promise.all([
      db.marketplaceReview.findMany({
        where: { listingId: id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.marketplaceReview.count({ where: { listingId: id } }),
    ]);

    return NextResponse.json({
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to list reviews:", error);
    return NextResponse.json({ error: "Failed to list reviews" }, { status: 500 });
  }
}

// POST /api/marketplace/[id]/reviews — Submit a review
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { userId, userName, rating, title, content, version } = body;

    if (!userId || !rating) {
      return NextResponse.json(
        { error: "userId and rating are required" },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    const listing = await db.marketplaceListing.findUnique({ where: { id } });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Check for existing review
    const existingReview = await db.marketplaceReview.findUnique({
      where: { listingId_userId: { listingId: id, userId } },
    });

    if (existingReview) {
      return NextResponse.json(
        { error: "You have already reviewed this plugin" },
        { status: 409 }
      );
    }

    const review = await db.marketplaceReview.create({
      data: {
        listingId: id,
        userId,
        userName: userName || null,
        rating,
        title: title || null,
        content: content || null,
        version: version || null,
      },
    });

    // Recalculate average rating
    const stats = await db.marketplaceReview.aggregate({
      where: { listingId: id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await db.marketplaceListing.update({
      where: { id },
      data: {
        avgRating: stats._avg.rating ?? 0,
        reviewCount: stats._count.rating,
      },
    });

    await createAuditLog({
      action: "marketplace.review",
      resource: "marketplace_listing",
      resourceId: id,
      userId,
      metadata: { rating, title },
      severity: "info",
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    console.error("Failed to submit review:", error);
    return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
  }
}
