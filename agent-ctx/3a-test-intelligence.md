# Task 3a: M29 AI Test Intelligence Agent + API Routes

## Work Completed

### 1. Created Test Intelligence Agent: `/src/lib/agent/test-intelligence.ts`

Implemented 4 exported functions:

**`buildDependencyGraph(projectId: string)`** → `{ edges: number, tests: number }`
- Finds all TestCases for the project via Feature → Project chain
- Analyzes each test case's `code` field (Playwright test code string)
- Pattern-matches for:
  - `import` statements → dependencyType: "import" (relative/local paths only)
  - `page.goto('/...')` or `page.navigate` → dependencyType: "navigate"
  - `page.route('...')` or `fetch(...)` calls → dependencyType: "api_call"
  - `data-testid=` or `getByTestId()` references → dependencyType: "render"
- Upserts TestDependencyGraph records on unique constraint (testCaseId + sourcePath + functionName + dependencyType)
- Returns edge and test counts

**`smartSelectTests(projectId: string, changedFiles: string[])`** → SmartSelectionResult
- Queries TestDependencyGraph for edges matching any changedFiles
- Uses transitive closure: finds tests linked to changed files, then finds features whose dependencies include affected features
- Computes coverage percentage (selected / total * 100)
- Stores SmartSelectionResult with all selected/skipped test IDs
- Returns the created record details

**`analyzeFlakiness(projectId: string)`** → FlakinessReport[]
- Gets all test cases and their TestResult history (via TestRun → Project)
- Computes flakiness score (0-100):
  - Based on pass/fail switch rate and fail rate
  - Score ≤ 20 → "stable", 21-60 → "flaky", >60 with high fail rate → "failing", <3 runs → "unknown"
- Detects primary indicator from error patterns:
  - "timeout" → "timing", "order"/"sequence" → "order_dependency", "resource" → "resource_contention", else → "external_dependency"
- Upserts FlakinessReport for each test case
- Creates FlakinessAlert for: newly flaky tests (stable→flaky/failing), score increases >20, first-report flaky tests
- Returns all reports with summary

**`prioritizeTests(projectId: string, changedFiles: string[])`** → ImpactAnalysisResult
- Combines signals: dependency graph matches (0.4) + FeatureRiskScore (0.35) + FlakinessReport (0.25)
- Priority score = depWeight(0.4) + riskWeight(0.35) + flakinessWeight(0.25)
- Categories: critical (≥80), high (≥60), medium (≥40), low (<40)
- Stores and returns ImpactAnalysisResult with priority ordering

### 2. Created 10 API Routes

All routes follow the exact pattern from `/src/app/api/orchestrator/sessions/route.ts`:
- `export const dynamic = "force-dynamic"` and `export const maxDuration = 60`
- `import { getServerSession } from "next-auth/next"`
- `import { authOptions } from "@/lib/auth"`
- `import { db } from "@/lib/db"`
- Credit-deducting routes import `checkCredits, deductCredits` from `@/lib/billing/credits`

| # | Route | Methods | Credits | Description |
|---|-------|---------|---------|-------------|
| 1 | `/api/intelligence/dependencies` | GET, POST | dependency_rebuild (3) | List edges / Rebuild graph |
| 2 | `/api/intelligence/dependencies/[id]` | GET | - | Dependency details for a test case |
| 3 | `/api/intelligence/select` | POST | smart_selection (5) | Smart test selection |
| 4 | `/api/intelligence/flakiness` | GET | - | List reports with filters |
| 5 | `/api/intelligence/flakiness/[id]` | GET, PATCH | - | Single report / Update classification |
| 6 | `/api/intelligence/flakiness/analyze` | POST | flakiness_analysis (10) | Trigger analysis |
| 7 | `/api/intelligence/flakiness/alerts` | GET | - | List alerts with filters |
| 8 | `/api/intelligence/prioritize` | POST | impact_analysis (20) | Prioritize tests |
| 9 | `/api/intelligence/impact` | GET | - | List impact results |
| 10 | `/api/intelligence/impact/[id]` | GET | - | Single impact result |

### 3. Verification

- TypeScript type check: **0 errors** in all new files (`test-intelligence.ts` and all 10 API routes)
- Next.js build: **Compiled successfully** (pre-existing prerender errors on /auth/signin and /_not-found are unrelated)
- Lint: **No new errors** from the new files
- All route files follow the established pattern with proper auth, credit checks, and error handling
