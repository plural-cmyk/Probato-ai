/**
 * Probato Public API Module
 *
 * Central export for all API key management, authentication,
 * rate limiting, and documentation generation.
 */

// API Key management
export {
  createApiKey,
  listApiKeys,
  verifyApiKey,
  revokeApiKey,
  rotateApiKey,
  deleteApiKey,
  updateApiKey,
  recordApiUsage,
  getApiUsageStats,
  PLAN_RATE_LIMITS,
  type ApiScope,
  type CreateApiKeyOptions,
  type CreateApiKeyResult,
  type ApiKeyInfo,
  type VerifyApiKeyResult,
} from "./keys";

// Rate limiting
export {
  checkRateLimit,
  buildRateLimitHeaders,
  type RateLimitResult,
} from "./rate-limiter";

// Authentication middleware
export {
  authenticateRequest,
  apiError,
  apiSuccess,
  type AuthResult,
} from "./middleware";
