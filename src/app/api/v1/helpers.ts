/**
 * Shared helpers for v1 API routes
 */

import { authenticateRequest, apiError, apiSuccess, type AuthResult } from "@/lib/api/middleware";
import type { ApiScope } from "@/lib/api/keys";

/**
 * Standard handler wrapper that authenticates, handles errors,
 * records usage, and returns standardized responses.
 */
export async function withAuth(
  request: Request,
  requiredScopes: ApiScope[],
  handler: (auth: AuthResult) => Promise<Response>
): Promise<Response> {
  const auth = await authenticateRequest(request, requiredScopes);

  if (!auth.authorized) {
    return apiError(auth.error ?? "Unauthorized", auth.status ?? 401, auth.rateLimitHeaders);
  }

  try {
    const response = await handler(auth);

    // Add rate limit headers to the response
    if (auth.rateLimitHeaders) {
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(auth.rateLimitHeaders)) {
        headers.set(key, value);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  } catch (error) {
    console.error("[API v1] Handler error:", error);
    return apiError("Internal server error", 500, auth.rateLimitHeaders);
  }
}

/**
 * Extract pagination params from request URL.
 */
export function getPagination(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50"), 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);
  return { limit, offset };
}

/**
 * Standard paginated response wrapper.
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number,
  rateLimitHeaders?: Record<string, string>
): Response {
  return apiSuccess(
    {
      items,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      },
    },
    200,
    rateLimitHeaders
  );
}
