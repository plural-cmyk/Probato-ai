"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Store,
  X,
  Search,
  Star,
  Download,
  Shield,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface ListingData {
  id: string;
  name: string;
  version: string;
  description: string;
  longDescription: string | null;
  author: string;
  homepage: string | null;
  repository: string | null;
  category: string;
  tier: string;
  tags: string[];
  iconUrl: string | null;
  installCount: number;
  avgRating: number;
  reviewCount: number;
  requiredPermissions: string[];
  extensionPoints: Array<{ type: string; id: string }>;
  configSchema: Record<string, unknown>;
  status: string;
  featured: boolean;
  publishedAt: string | null;
  createdAt: string;
  _count?: { reviews: number };
}

interface ReviewData {
  id: string;
  rating: number;
  title: string | null;
  content: string | null;
  version: string | null;
  userId: string;
  userName: string | null;
  createdAt: string;
}

interface MarketplacePanelProps {
  onClose: () => void;
}

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "integration", label: "Integration" },
  { value: "test_runner", label: "Test Runner" },
  { value: "notification", label: "Notification" },
  { value: "analytics", label: "Analytics" },
  { value: "utility", label: "Utility" },
];

const TIERS = [
  { value: "", label: "All Tiers" },
  { value: "official", label: "Official" },
  { value: "verified", label: "Verified" },
  { value: "community", label: "Community" },
];

export default function MarketplacePanel({ onClose }: MarketplacePanelProps) {
  const [listings, setListings] = useState<ListingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [tier, setTier] = useState("");
  const [expandedListing, setExpandedListing] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  // Review form state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewContent, setReviewContent] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (tier) params.set("tier", tier);
      if (search) params.set("search", search);
      params.set("limit", "50");

      const res = await fetch(`/api/marketplace?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings ?? []);
      }
    } catch (error) {
      console.error("Failed to fetch marketplace listings:", error);
    } finally {
      setLoading(false);
    }
  }, [category, tier, search]);

  // Get user's first team
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/teams");
        if (res.ok) {
          const data = await res.json();
          const firstTeam = data.teams?.[0];
          if (firstTeam) {
            setTeamId(firstTeam.id);
          }
        }
      } catch {
        // Ignore
      }
    })();
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  async function expandListing(listingId: string) {
    if (expandedListing === listingId) {
      setExpandedListing(null);
      return;
    }
    setExpandedListing(listingId);
  }

  async function loadReviews(listingId: string) {
    setReviewsLoading(true);
    try {
      const res = await fetch(`/api/marketplace/${listingId}/reviews?limit=10`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews ?? []);
      }
    } catch (error) {
      console.error("Failed to load reviews:", error);
    } finally {
      setReviewsLoading(false);
    }
  }

  async function installFromMarketplace(listingId: string) {
    if (!teamId) {
      alert("You need a team to install plugins.");
      return;
    }
    setInstalling(listingId);
    try {
      const res = await fetch(`/api/marketplace/${listingId}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      if (res.ok) {
        alert("Plugin installed successfully! Go to Plugin Management to activate it.");
        await fetchListings();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to install plugin");
      }
    } catch (error) {
      console.error("Failed to install plugin:", error);
      alert("Failed to install plugin");
    } finally {
      setInstalling(null);
    }
  }

  async function submitReview(listingId: string) {
    setSubmittingReview(true);
    try {
      const res = await fetch(`/api/marketplace/${listingId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "current",
          rating: reviewRating,
          title: reviewTitle || undefined,
          content: reviewContent || undefined,
        }),
      });
      if (res.ok) {
        setReviewTitle("");
        setReviewContent("");
        setReviewRating(5);
        await loadReviews(listingId);
        await fetchListings();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to submit review");
      }
    } catch (error) {
      console.error("Failed to submit review:", error);
    } finally {
      setSubmittingReview(false);
    }
  }

  function getTierBadge(tier: string) {
    const colors: Record<string, string> = {
      official: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
      verified: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      community: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    };
    return colors[tier] || colors.community;
  }

  function getCategoryIcon(cat: string) {
    const icons: Record<string, string> = {
      integration: "🔗",
      test_runner: "🧪",
      notification: "🔔",
      analytics: "📊",
      utility: "🔧",
    };
    return icons[cat] || "📦";
  }

  function renderStars(rating: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-3 w-3 ${
          i < Math.round(rating)
            ? "text-amber-400 fill-amber-400"
            : "text-gray-300"
        }`}
      />
    ));
  }

  function formatCount(count: number) {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Marketplace</h3>
          <Badge variant="secondary" className="text-xs">
            {listings.length} plugins
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search plugins..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
        >
          {TIERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Listings Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-12">
          <Store className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No plugins found. Try adjusting your filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {listings.map((listing) => (
            <Card
              key={listing.id}
              className={`overflow-hidden transition-all ${
                listing.featured ? "ring-2 ring-amber-400/30" : ""
              }`}
            >
              <CardContent className="p-4">
                {/* Featured badge */}
                {listing.featured && (
                  <Badge className="mb-2 text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                    ⭐ Featured
                  </Badge>
                )}

                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {getCategoryIcon(listing.category)} {listing.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                        v{listing.version}
                      </Badge>
                      <Badge
                        className={`text-[10px] px-1.5 shrink-0 ${getTierBadge(listing.tier)}`}
                      >
                        {listing.tier}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {listing.description}
                    </p>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                  <span>by {listing.author}</span>
                  <span className="flex items-center gap-0.5">
                    <Download className="h-3 w-3" />
                    {formatCount(listing.installCount)}
                  </span>
                  <span className="flex items-center gap-0.5">
                    {renderStars(listing.avgRating)}
                    <span className="ml-0.5">
                      ({listing.reviewCount})
                    </span>
                  </span>
                </div>

                {/* Tags */}
                {listing.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {listing.tags.slice(0, 4).map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Expand/Collapse button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 h-7 text-xs"
                  onClick={() => expandListing(listing.id)}
                >
                  {expandedListing === listing.id ? (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      Less
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-3 w-3 mr-1" />
                      Details & Install
                    </>
                  )}
                </Button>

                {/* Expanded Content */}
                {expandedListing === listing.id && (
                  <div className="mt-3 space-y-3">
                    <Separator />

                    {/* Long Description */}
                    {listing.longDescription && (
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                        {listing.longDescription}
                      </div>
                    )}

                    {/* Links */}
                    <div className="flex gap-2">
                      {listing.homepage && (
                        <a
                          href={listing.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Homepage
                        </a>
                      )}
                      {listing.repository && (
                        <a
                          href={listing.repository}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Source
                        </a>
                      )}
                    </div>

                    {/* Required Permissions */}
                    {Array.isArray(listing.requiredPermissions) &&
                      listing.requiredPermissions.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium mb-1 flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            Required Permissions
                          </h5>
                          <div className="flex flex-wrap gap-1">
                            {listing.requiredPermissions.map(
                              (perm: string, i: number) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {perm}
                                </Badge>
                              )
                            )}
                          </div>
                        </div>
                      )}

                    {/* Extension Points */}
                    {Array.isArray(listing.extensionPoints) &&
                      listing.extensionPoints.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium mb-1">
                            Extension Points
                          </h5>
                          <div className="flex flex-wrap gap-1">
                            {listing.extensionPoints.map(
                              (ep: { type: string; id: string }, i: number) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {ep.type}: {ep.id}
                                </Badge>
                              )
                            )}
                          </div>
                        </div>
                      )}

                    {/* Install Button */}
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={() => installFromMarketplace(listing.id)}
                      disabled={installing === listing.id}
                    >
                      {installing === listing.id ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-1" />
                      )}
                      Install Plugin
                    </Button>

                    {/* Reviews Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-xs font-medium">
                          Reviews ({listing.reviewCount})
                        </h5>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px]"
                          onClick={() => loadReviews(listing.id)}
                        >
                          Load Reviews
                        </Button>
                      </div>

                      {reviewsLoading ? (
                        <div className="flex justify-center py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : reviews.length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {reviews.map((review) => (
                            <div
                              key={review.id}
                              className="p-2 rounded-md bg-muted/30"
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex">
                                  {renderStars(review.rating)}
                                </div>
                                {review.title && (
                                  <span className="text-xs font-medium">
                                    {review.title}
                                  </span>
                                )}
                              </div>
                              {review.content && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {review.content}
                                </p>
                              )}
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {review.userName || "Anonymous"} •{" "}
                                {new Date(review.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {/* Submit Review */}
                      <div className="mt-3 p-2 rounded-md border border-border/50">
                        <h6 className="text-[11px] font-medium mb-1">
                          Write a Review
                        </h6>
                        <div className="flex items-center gap-1 mb-2">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              onClick={() => setReviewRating(s)}
                              className="p-0"
                            >
                              <Star
                                className={`h-4 w-4 ${
                                  s <= reviewRating
                                    ? "text-amber-400 fill-amber-400"
                                    : "text-gray-300"
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                        <Input
                          placeholder="Review title (optional)"
                          className="h-7 text-xs mb-1"
                          value={reviewTitle}
                          onChange={(e) => setReviewTitle(e.target.value)}
                        />
                        <Input
                          placeholder="Your review (optional)"
                          className="h-7 text-xs mb-2"
                          value={reviewContent}
                          onChange={(e) => setReviewContent(e.target.value)}
                        />
                        <Button
                          size="sm"
                          className="h-7 text-xs w-full"
                          onClick={() => submitReview(listing.id)}
                          disabled={submittingReview}
                        >
                          {submittingReview ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : null}
                          Submit Review
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
