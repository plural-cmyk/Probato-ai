/**
 * Probato API Authentication Middleware
 *
 * Dual authentication for API routes:
 *   1. API Key auth via Authorization: Bearer pb_xxx header
 *   2. Session auth via NextAuth (browser/dashboard requests)
 *
 * Usage in route handlers:
 *
 *   export async function GET(request: Request) {
 *     const auth = await authenticateRequest(request, ["read"]);
 *     if (!auth.authorized) {
 *       return NextResponse.json({ error: auth.error }, { status: auth.status });
 *     }
 *     // auth.userId, auth.apiKeyId, auth.plan, auth.scopes available
 *     ...
 *   }
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyApiKey, recordApiUsage, type ApiScope } from "./keys";
import { checkRateLimit, buildRateLimitHeaders, type RateLimitResult } from "./rate-limiter";
import type { PlanSlug } from "@/lib/billing/plans";

// ── Types ────────────────────────────────────────────────────────

export interface AuthResult {
  authorized: boolean;
  userId: string;
  authMethod: "api_key" | "session";
  apiKeyId?: string;
  plan: PlanSlug;
  scopes: ApiScope[];
  rateLimitHeaders?: Record<string, string>;
  error?: string;
  status?: number;
}

interface AuthenticatedRequest extends AuthResult {
  /** Record API usage for this request (call after processing) */
  recordUsage: (params: {
    endpoint: string;
    method: string;
    statusCode: number;
    creditsUsed?: number;
    responseTime?: number;
    errorMessage?: string;
  }) => Promise<void>;
}

// ── Extract Bearer Token ─────────────────────────────────────────

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;

  return parts[1];
}

// ── Extract Client Info ──────────────────────────────────────────

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

// ── Main Auth Function ───────────────────────────────────────────

/**
 * Authenticate an incoming API request.
 *
 * Checks for API key first (Bearer token), then falls back to session auth.
 * Enforces rate limits for API key requests.
 * Validates required scopes.
 *
 * @param request - The incoming Request object
 * @param requiredScopes - Scopes required for this endpoint (any match = ok)
 * @returns AuthResult with user info or error details
 */
export async function authenticateRequest(
  request: Request,
  requiredScopes: ApiScope[] = ["read"]
): Promise<AuthenticatedRequest> {
  const startTime = Date.now();
  const userAgent = request.headers.get("user-agent") ?? undefined;
  const ipAddress = getClientIp(request);

  // ── Try API Key Auth ─────────────────────────────────────────
  const bearerToken = extractBearerToken(request);

  if (bearerToken) {
    const verification = await verifyApiKey(bearerToken);

    if (!verification.valid) {
      return {
        authorized: false,
        userId: "",
        authMethod: "api_key",
        plan: "free",
        scopes: [],
        error: verification.reason ?? "Invalid API key",
        status: 401,
        recordUsage: async (params) => {
          if (verification.apiKeyId) {
            await recordApiUsage({
              apiKeyId: verification.apiKeyId,
              userId: verification.userId || "unknown",
              ...params,
              userAgent,
              ipAddress,
              responseTime: Date.now() - startTime,
            });
          }
        },
      };
    }

    // Check rate limits
    const rateLimitResult = checkRateLimit(
      verification.apiKeyId,
      verification.plan,
      null // Custom limit is already factored into verification.rateLimit
    );

    const rateLimitHeaders = buildRateLimitHeaders(rateLimitResult);

    if (!rateLimitResult.allowed) {
      return {
        authorized: false,
        userId: verification.userId,
        authMethod: "api_key",
        apiKeyId: verification.apiKeyId,
        plan: verification.plan,
        scopes: verification.scopes,
        rateLimitHeaders,
        error: "Rate limit exceeded. Please retry after the specified time.",
        status: 429,
        recordUsage: async (params) => {
          await recordApiUsage({
            apiKeyId: verification.apiKeyId,
            userId: verification.userId,
            ...params,
            userAgent,
            ipAddress,
            responseTime: Date.now() - startTime,
          });
        },
      };
    }

    // Check scopes
    const hasRequiredScope = requiredScopes.some(
      (scope) =>
        verification.scopes.includes(scope) ||
        verification.scopes.includes("admin") // admin scope grants all access
    );

    if (!hasRequiredScope) {
      return {
        authorized: false,
        userId: verification.userId,
        authMethod: "api_key",
        apiKeyId: verification.apiKeyId,
        plan: verification.plan,
        scopes: verification.scopes,
        rateLimitHeaders,
        error: `Insufficient permissions. Required: ${requiredScopes.join(" or ")}. Your key has: ${verification.scopes.join(", ")}`,
        status: 403,
        recordUsage: async (params) => {
          await recordApiUsage({
            apiKeyId: verification.apiKeyId,
            userId: verification.userId,
            ...params,
            userAgent,
            ipAddress,
            responseTime: Date.now() - startTime,
          });
        },
      };
    }

    // Authorized!
    return {
      authorized: true,
      userId: verification.userId,
      authMethod: "api_key",
      apiKeyId: verification.apiKeyId,
      plan: verification.plan,
      scopes: verification.scopes,
      rateLimitHeaders,
      recordUsage: async (params) => {
        await recordApiUsage({
          apiKeyId: verification.apiKeyId,
          userId: verification.userId,
          ...params,
          userAgent,
          ipAddress,
          responseTime: Date.now() - startTime,
        });
      },
    };
  }

  // ── Try Session Auth ─────────────────────────────────────────
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    // Get user's plan
    const { db } = await import("@/lib/db");
    const subscription = await db.subscription.findUnique({
      where: { userId: session.user.id },
    });
    const plan = (subscription?.plan as PlanSlug) ?? "free";

    return {
      authorized: true,
      userId: session.user.id,
      authMethod: "session",
      plan,
      scopes: ["read", "write", "admin", "billing"], // Session auth has full access
      recordUsage: async () => {
        // Don't record usage for session-based requests
      },
    };
  }

  // ── No Auth ──────────────────────────────────────────────────
  return {
    authorized: false,
    userId: "",
    authMethod: "session",
    plan: "free",
    scopes: [],
    error: "Authentication required. Provide a valid API key or sign in.",
    status: 401,
    recordUsage: async () => {},
  };
}

// ── Convenience Helper ───────────────────────────────────────────

/**
 * Create a standard API error response with rate limit headers.
 */
export function apiError(
  message: string,
  status: number,
  rateLimitHeaders?: Record<string, string>,
  extra?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      status,
      ...extra,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        ...(rateLimitHeaders ?? {}),
      },
    }
  );
}

/**
 * Create a standard API success response with rate limit headers.
 */
export function apiSuccess(
  data: unknown,
  status: number = 200,
  rateLimitHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify({ data, status }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(rateLimitHeaders ?? {}),
    },
  });
}
