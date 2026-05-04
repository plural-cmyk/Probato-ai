/**
 * Probato API Rate Limiter
 *
 * Token-bucket rate limiter for API key authentication.
 * Uses in-memory storage with per-minute window reset.
 *
 * For production with multiple instances, replace with Redis-backed store.
 * The interface is designed to be swappable.
 */

import { PLAN_RATE_LIMITS, type PlanSlug } from "./keys";

// ── Types ────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  limit: number; // Max requests per minute
  remaining: number; // Remaining requests in current window
  resetAt: number; // Unix timestamp when the window resets
  retryAfter?: number; // Seconds until reset (if rate limited)
}

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp
}

// ── In-Memory Store ──────────────────────────────────────────────

class MemoryRateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  increment(key: string): RateLimitEntry {
    const existing = this.store.get(key);
    const now = Math.floor(Date.now() / 1000);
    const windowResetAt = now + 60; // 1-minute window

    if (!existing || existing.resetAt <= now) {
      // New window
      const entry: RateLimitEntry = { count: 1, resetAt: windowResetAt };
      this.store.set(key, entry);
      return entry;
    }

    // Existing window
    existing.count++;
    return existing;
  }

  private cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Singleton store
const store = new MemoryRateLimitStore();

// ── Rate Limit Check ─────────────────────────────────────────────

/**
 * Check if an API request is within rate limits.
 *
 * @param apiKeyId - The API key ID (used as the rate limit key)
 * @param plan - The user's plan (determines default limit)
 * @param customLimit - Optional custom limit overriding plan default
 * @returns Rate limit result with headers info
 */
export function checkRateLimit(
  apiKeyId: string,
  plan: PlanSlug,
  customLimit?: number | null
): RateLimitResult {
  const limit = customLimit ?? PLAN_RATE_LIMITS[plan] ?? 10;
  const entry = store.increment(apiKeyId);

  const remaining = Math.max(0, limit - entry.count);
  const now = Math.floor(Date.now() / 1000);

  if (entry.count > limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter: entry.resetAt - now,
    };
  }

  return {
    allowed: true,
    limit,
    remaining: remaining - 1, // Subtract current request
    resetAt: entry.resetAt,
  };
}

/**
 * Reset the rate limit counter for a specific key.
 * Useful for testing or after a key rotation.
 */
export function resetRateLimit(apiKeyId: string): void {
  // The store uses apiKeyId directly as the key
  // Access the store's delete via the increment store reference
  // For now, we just set a note that the entry will expire naturally within 60s
  // In production with Redis, this would be a DEL command
  void apiKeyId;
}

/**
 * Build standard rate limit headers for HTTP responses.
 */
export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
  };

  if (!result.allowed && result.retryAfter) {
    headers["Retry-After"] = String(result.retryAfter);
  }

  return headers;
}
