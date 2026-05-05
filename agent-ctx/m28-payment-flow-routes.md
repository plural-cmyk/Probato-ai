# M28 Payment Flow API Routes

## Task
Create 2 API route files for M28 Payment Flow Testing, following the exact same patterns as the existing call-flow routes.

## Files Created

### 1. `/home/z/my-project/src/app/api/orchestrator/payment/route.ts`
- **POST handler**: Runs a payment flow test
  - Auth check via `getServerSession`
  - Parses body for: projectId, url, testCard, expectedOutcome, addToCartSelector, checkoutButtonSelector, shippingFormSelector, paymentFormSelector, submitPaymentSelector, confirmationSelector, webhookUrl, webhookSecret, currency, syncTimeoutMs
  - Validates URL is required (400 if missing)
  - Verifies project ownership if projectId provided (403 if mismatch)
  - Calls `runPaymentFlowTest` with parsed params + userId
  - Returns result as JSON
  - Exports: `dynamic = "force-dynamic"`, `maxDuration = 60`

- **GET handler**: Lists payment flow test sessions
  - Auth check
  - Parses query params: projectId, status, limit (default 10), offset (default 0)
  - Queries `db.paymentFlowTestSession` with filters
  - Returns paginated results: `{ sessions, total, limit, offset }`

### 2. `/home/z/my-project/src/app/api/orchestrator/payment/[id]/route.ts`
- **GET handler**: Gets a specific payment flow test session with details
  - Auth check
  - Awaits params (Promise type)
  - Queries `db.paymentFlowTestSession.findUnique` with include `orchestratedSession` (sandboxes + syncEvents)
  - Returns 404 if not found
  - Checks ownership (403 if mismatch)
  - Returns session as JSON
  - Exports: `dynamic = "force-dynamic"`

## Pattern Matching
Both files follow the exact same structure, error handling, and conventions as the call-flow counterparts:
- Same auth pattern with `getServerSession(authOptions)`
- Same error response format with `error instanceof Error ? error.message : "Internal server error"`
- Same `where` clause construction with `Record<string, unknown>`
- Same `Promise.all` pattern for paginated queries
- Same `params: Promise<{ id: string }>` pattern for dynamic routes
- Same include structure for orchestratedSession (sandboxes + syncEvents)

## Dependencies
- `runPaymentFlowTest` from `@/lib/agent/payment-flow-tester` (needs to be implemented)
- `paymentFlowTestSession` model in Prisma schema (needs to be defined)
