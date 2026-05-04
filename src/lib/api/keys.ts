/**
 * Probato API Key Management Service
 *
 * Handles the full lifecycle of API keys:
 *   - Creation with scoped permissions
 *   - Secure hashing (scrypt-based) for storage
 *   - Verification against hashed keys
 *   - Rotation (revoke old, issue new)
 *   - Revocation / soft-disable
 *   - Usage tracking
 *
 * API key format: pb_{env}_{random}  e.g. "pb_live_a1b2c3d4e5f6g7h8i9j0"
 * The prefix (first 8 chars) is stored in plaintext for identification.
 * The full key is shown only once at creation time.
 */

import crypto from "crypto";
import { db } from "@/lib/db";
import { PLANS, type PlanSlug } from "@/lib/billing/plans";

// ── Constants ────────────────────────────────────────────────────

const KEY_PREFIX = "pb_";
const KEY_ENV = process.env.NODE_ENV === "production" ? "live" : "test";
const KEY_RANDOM_LENGTH = 32; // bytes of randomness
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_COST = 16384; // N — CPU/memory cost parameter
const SCRYPT_BLOCK_SIZE = 8; // r
const SCRYPT_PARALLELIZATION = 1; // p
const MAX_KEYS_PER_USER = 10;

// ── Types ────────────────────────────────────────────────────────

export type ApiScope = "read" | "write" | "admin" | "billing";

export interface CreateApiKeyOptions {
  name: string;
  scopes: ApiScope[];
  expiresInDays?: number; // Optional expiration (null = never expires)
  rateLimitOverride?: number; // Override plan default (requests/min)
}

export interface CreateApiKeyResult {
  id: string;
  name: string;
  key: string; // Full API key — shown only once!
  prefix: string;
  scopes: ApiScope[];
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  enabled: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  rateLimitOverride: number | null;
  createdAt: Date;
  usageCount: number; // Last 30 days
}

export interface VerifyApiKeyResult {
  valid: boolean;
  userId: string;
  apiKeyId: string;
  scopes: ApiScope[];
  plan: PlanSlug;
  rateLimit: number; // Requests per minute
  reason?: string; // If invalid, why
}

// ── Key Generation & Hashing ─────────────────────────────────────

/**
 * Generate a new API key string.
 * Format: pb_{env}_{hex_random}
 */
function generateApiKeyString(): string {
  const random = crypto.randomBytes(KEY_RANDOM_LENGTH).toString("hex");
  return `${KEY_PREFIX}${KEY_ENV}_${random}`;
}

/**
 * Hash an API key using scrypt.
 * Returns hex-encoded hash.
 */
function hashApiKey(key: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(key, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });
  return `${salt}:${derived.toString("hex")}`;
}

/**
 * Verify an API key against a stored hash.
 */
function verifyKeyHash(key: string, storedHash: string): boolean {
  const [salt, hashHex] = storedHash.split(":");
  if (!salt || !hashHex) return false;

  const derived = crypto.scryptSync(key, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });

  return crypto.timingSafeEqual(
    Buffer.from(hashHex, "hex"),
    derived
  );
}

/**
 * Extract the prefix from a full API key (first 8 chars).
 */
function extractPrefix(key: string): string {
  return key.substring(0, 8);
}

// ── Per-plan rate limits ─────────────────────────────────────────

export const PLAN_RATE_LIMITS: Record<PlanSlug, number> = {
  free: 10, // 10 requests/min
  pro: 60, // 60 requests/min
  team: 120, // 120 requests/min
  enterprise: 300, // 300 requests/min
};

// ── Create API Key ───────────────────────────────────────────────

/**
 * Create a new API key for a user.
 * Returns the full key only once — it cannot be retrieved later.
 */
export async function createApiKey(
  userId: string,
  options: CreateApiKeyOptions
): Promise<CreateApiKeyResult> {
  // Check key limit
  const existingCount = await db.apiKey.count({
    where: { userId, enabled: true },
  });

  if (existingCount >= MAX_KEYS_PER_USER) {
    throw new Error(
      `Maximum API keys reached (${MAX_KEYS_PER_USER}). Disable or delete an existing key first.`
    );
  }

  // Validate scopes
  const validScopes: ApiScope[] = ["read", "write", "admin", "billing"];
  const filteredScopes = options.scopes.filter((s) =>
    validScopes.includes(s)
  );

  if (filteredScopes.length === 0) {
    throw new Error("At least one valid scope is required");
  }

  // Check plan-based scope restrictions
  const subscription = await db.subscription.findUnique({
    where: { userId },
  });
  const plan = (subscription?.plan as PlanSlug) ?? "free";

  // "admin" and "billing" scopes require Pro or higher
  if (
    (filteredScopes.includes("admin") || filteredScopes.includes("billing")) &&
    plan === "free"
  ) {
    throw new Error(
      'Admin and Billing scopes require a Pro plan or higher. Upgrade to access these scopes.'
    );
  }

  // Generate key
  const rawKey = generateApiKeyString();
  const prefix = extractPrefix(rawKey);
  const keyHash = hashApiKey(rawKey);

  // Calculate expiration
  const expiresAt = options.expiresInDays
    ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  // Store in database
  const apiKey = await db.apiKey.create({
    data: {
      name: options.name,
      prefix,
      keyHash,
      scopes: filteredScopes,
      enabled: true,
      expiresAt,
      rateLimitOverride: options.rateLimitOverride ?? null,
      userId,
    },
  });

  return {
    id: apiKey.id,
    name: apiKey.name,
    key: rawKey, // Full key — shown only once!
    prefix,
    scopes: filteredScopes,
    expiresAt,
    createdAt: apiKey.createdAt,
  };
}

// ── List API Keys ────────────────────────────────────────────────

/**
 * List all API keys for a user (without revealing hashes).
 * Includes usage count for the last 30 days.
 */
export async function listApiKeys(userId: string): Promise<ApiKeyInfo[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const keys = await db.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          usage: {
            where: { createdAt: { gte: thirtyDaysAgo } },
          },
        },
      },
    },
  });

  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes as ApiScope[],
    enabled: key.enabled,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    rateLimitOverride: key.rateLimitOverride,
    createdAt: key.createdAt,
    usageCount: key._count.usage,
  }));
}

// ── Verify API Key ───────────────────────────────────────────────

/**
 * Verify a raw API key string.
 * This is the hot path — called on every API request with a Bearer token.
 * Uses the key prefix to narrow the search, then verifies the hash.
 */
export async function verifyApiKey(rawKey: string): Promise<VerifyApiKeyResult> {
  if (!rawKey.startsWith(KEY_PREFIX)) {
    return { valid: false, userId: "", apiKeyId: "", scopes: [], plan: "free", rateLimit: 0, reason: "Invalid key format" };
  }

  const prefix = extractPrefix(rawKey);

  // Find keys matching the prefix (fast index lookup)
  const candidates = await db.apiKey.findMany({
    where: { prefix, enabled: true },
    include: {
      user: {
        select: {
          subscription: { select: { plan: true } },
        },
      },
    },
  });

  // Check each candidate
  for (const candidate of candidates) {
    if (!verifyKeyHash(rawKey, candidate.keyHash)) continue;

    // Check expiration
    if (candidate.expiresAt && candidate.expiresAt < new Date()) {
      return {
        valid: false,
        userId: candidate.userId,
        apiKeyId: candidate.id,
        scopes: candidate.scopes as ApiScope[],
        plan: "free",
        rateLimit: 0,
        reason: "API key has expired",
      };
    }

    // Update lastUsedAt (fire-and-forget, don't block the request)
    db.apiKey
      .update({ where: { id: candidate.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    const plan = (candidate.user.subscription?.plan as PlanSlug) ?? "free";
    const rateLimit =
      candidate.rateLimitOverride ?? PLAN_RATE_LIMITS[plan] ?? 10;

    return {
      valid: true,
      userId: candidate.userId,
      apiKeyId: candidate.id,
      scopes: candidate.scopes as ApiScope[],
      plan,
      rateLimit,
    };
  }

  return {
    valid: false,
    userId: "",
    apiKeyId: "",
    scopes: [],
    plan: "free",
    rateLimit: 0,
    reason: "Invalid API key",
  };
}

// ── Revoke API Key ───────────────────────────────────────────────

/**
 * Revoke (soft-delete) an API key.
 * The key is disabled but not removed from the database for audit purposes.
 */
export async function revokeApiKey(
  userId: string,
  keyId: string
): Promise<{ success: boolean; reason?: string }> {
  const key = await db.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!key) {
    return { success: false, reason: "API key not found" };
  }

  if (!key.enabled) {
    return { success: false, reason: "API key is already disabled" };
  }

  await db.apiKey.update({
    where: { id: keyId },
    data: { enabled: false },
  });

  return { success: true };
}

// ── Rotate API Key ───────────────────────────────────────────────

/**
 * Rotate an API key: revoke the old key and create a new one
 * with the same name and scopes.
 * Returns the new full key (shown only once).
 */
export async function rotateApiKey(
  userId: string,
  keyId: string
): Promise<CreateApiKeyResult> {
  const key = await db.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!key) {
    throw new Error("API key not found");
  }

  // Disable the old key
  await db.apiKey.update({
    where: { id: keyId },
    data: { enabled: false },
  });

  // Create a new key with the same properties
  return createApiKey(userId, {
    name: key.name,
    scopes: key.scopes as ApiScope[],
    expiresInDays: key.expiresAt
      ? Math.ceil(
          (key.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        )
      : undefined,
    rateLimitOverride: key.rateLimitOverride ?? undefined,
  });
}

// ── Delete API Key ───────────────────────────────────────────────

/**
 * Permanently delete an API key and all its usage records.
 */
export async function deleteApiKey(
  userId: string,
  keyId: string
): Promise<{ success: boolean }> {
  const key = await db.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!key) {
    return { success: false };
  }

  await db.apiKey.delete({ where: { id: keyId } });

  return { success: true };
}

// ── Update API Key ───────────────────────────────────────────────

/**
 * Update an API key's name, scopes, or rate limit.
 */
export async function updateApiKey(
  userId: string,
  keyId: string,
  updates: {
    name?: string;
    scopes?: ApiScope[];
    rateLimitOverride?: number | null;
  }
): Promise<{ success: boolean; reason?: string }> {
  const key = await db.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!key) {
    return { success: false, reason: "API key not found" };
  }

  await db.apiKey.update({
    where: { id: keyId },
    data: {
      ...(updates.name ? { name: updates.name } : {}),
      ...(updates.scopes ? { scopes: updates.scopes } : {}),
      ...(updates.rateLimitOverride !== undefined
        ? { rateLimitOverride: updates.rateLimitOverride }
        : {}),
    },
  });

  return { success: true };
}

// ── Record API Usage ─────────────────────────────────────────────

/**
 * Record an API usage event for analytics and rate limiting.
 */
export async function recordApiUsage(params: {
  apiKeyId: string;
  userId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  creditsUsed?: number;
  responseTime?: number;
  userAgent?: string;
  ipAddress?: string;
  errorMessage?: string;
}): Promise<void> {
  await db.apiUsage.create({
    data: {
      apiKeyId: params.apiKeyId,
      userId: params.userId,
      endpoint: params.endpoint,
      method: params.method,
      statusCode: params.statusCode,
      creditsUsed: params.creditsUsed ?? 0,
      responseTime: params.responseTime,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      errorMessage: params.errorMessage,
    },
  });
}

// ── Get API Usage Stats ──────────────────────────────────────────

/**
 * Get usage statistics for a user's API keys.
 */
export async function getApiUsageStats(
  userId: string,
  options?: {
    apiKeyId?: string;
    days?: number;
    limit?: number;
    offset?: number;
  }
) {
  const days = options?.days ?? 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where = {
    userId,
    createdAt: { gte: startDate },
    ...(options?.apiKeyId ? { apiKeyId: options.apiKeyId } : {}),
  };

  const [usage, totalCount, aggregated] = await Promise.all([
    db.apiUsage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
      select: {
        id: true,
        endpoint: true,
        method: true,
        statusCode: true,
        creditsUsed: true,
        responseTime: true,
        errorMessage: true,
        createdAt: true,
        apiKey: {
          select: { name: true, prefix: true },
        },
      },
    }),
    db.apiUsage.count({ where }),
    db.apiUsage.aggregate({
      where,
      _sum: { creditsUsed: true },
      _avg: { responseTime: true },
      _count: true,
    }),
  ]);

  // Status code breakdown
  const statusBreakdown = await db.apiUsage.groupBy({
    by: ["statusCode"],
    where,
    _count: true,
  });

  // Endpoint breakdown (top 10)
  const endpointBreakdown = await db.apiUsage.groupBy({
    by: ["endpoint"],
    where,
    _count: true,
    orderBy: { _count: { endpoint: "desc" } },
    take: 10,
  });

  return {
    usage,
    totalCount,
    aggregated: {
      totalCredits: aggregated._sum.creditsUsed ?? 0,
      avgResponseTime: Math.round(aggregated._avg.responseTime ?? 0),
      totalRequests: aggregated._count,
    },
    statusBreakdown: statusBreakdown.map((s) => ({
      statusCode: s.statusCode,
      count: s._count,
    })),
    endpointBreakdown: endpointBreakdown.map((e) => ({
      endpoint: e.endpoint,
      count: e._count,
    })),
  };
}
