# Task 4a — M30 Self-Healing Tests v2 Agent + API Routes

## Agent: Main Agent
## Date: 2024-03-05

### Work Summary

Implemented the M30 Self-Healing Tests v2 agent and 8 API routes.

### Files Created

**Agent:**
- `src/lib/agent/self-heal-v2.ts` — Self-heal v2 agent with 4 exported functions

**API Routes (8 routes):**
1. `src/app/api/self-heal/selector-repairs/route.ts` — GET: list repairs (filter by testCaseId, status); POST: create repair (deduct selector_repair 8 credits)
2. `src/app/api/self-heal/selector-repairs/[id]/route.ts` — GET: single repair; PATCH: approve/reject
3. `src/app/api/self-heal/maintenance/route.ts` — GET: list maintenance records (filter by projectId, category, severity, status)
4. `src/app/api/self-heal/maintenance/[id]/route.ts` — GET: single record; PATCH: update status (in_progress/resolved/dismissed)
5. `src/app/api/self-heal/maintenance/scan/route.ts` — POST: trigger scan (deduct maintenance_scan 6 credits)
6. `src/app/api/self-heal/deprecations/route.ts` — GET: list deprecation records (filter by projectId)
7. `src/app/api/self-heal/deprecations/[id]/route.ts` — GET: single deprecation with affected tests
8. `src/app/api/self-heal/auto-repair/route.ts` — POST: execute auto-repair

### Agent Functions Implemented

1. **repairSelector(testCaseId, oldSelector, newSelector, confidence)** → SelectorRepair record
   - Creates SelectorRepair record with status "pending"
   - If confidence >= 0.85: auto-applies, updates TestCase.selector, sets autoHealed=true, marks repair "applied"

2. **scanMaintenance(projectId)** → TestMaintenanceRecord[]
   - Deprecation: scans for deprecated Playwright patterns (page.waitFor, page.waitForNavigation, page.$, page.$$, >> chaining)
   - Assertion drift: compares test assertion values with recent test run results, detects >30% failure rate
   - Step staleness: checks if features/selectors referenced by tests still exist, detects selector mismatches
   - Code quality: duplicate test names, complex chained assertions, unused imports

3. **autoRepair(testCaseId, confidenceThreshold=0.8)** → { repaired, pending }
   - Finds all pending SelectorRepairs with confidence >= threshold
   - Applies each: updates TestCase.selector, sets autoHealed=true, marks repair "applied"
   - Returns counts of repaired and still-pending

4. **detectDeprecations(projectId)** → TestMaintenanceRecord[]
   - Scans for 5 known deprecation patterns with regex
   - Deduplicates against existing open deprecation records
   - Creates TestMaintenanceRecord with category "deprecation" and appropriate severity

### API Route Patterns

All routes follow the established pattern:
- `export const dynamic = "force-dynamic"` and `export const maxDuration = 60`
- `import { getServerSession } from "next-auth/next"` + `authOptions`
- `import { db } from "@/lib/db"`
- Credit-deducting routes use `checkCredits` + `deductCredits` from `@/lib/billing/credits`
- Returns 402 with creditsRequired/creditsBalance when insufficient credits
- Dynamic route params use `const { id } = await params;` (Next.js 16 async params)

### Build Verification

- All 8 self-heal routes compile successfully
- Build output shows all 8 routes under `/api/self-heal/`
- No lint errors in new files
