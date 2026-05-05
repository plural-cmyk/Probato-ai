# Task 2-10: Security & Accessibility Testing Agent (M17)

## Agent: Main Agent
## Task: Milestone 17 — Security & Accessibility Testing Agent

## Work Log

### 1. Updated `src/lib/agent/actions.ts`
- Added 7 new action types to `ActionType` union: `checkSecurityHeaders`, `checkCSP`, `checkMixedContent`, `scanA11y`, `checkContrast`, `checkAriaLabels`, `checkKeyboardNav`
- Added 7 new action interfaces: `CheckSecurityHeadersAction`, `CheckCSPAction`, `CheckMixedContentAction`, `ScanA11yAction`, `CheckContrastAction`, `CheckAriaLabelsAction`, `CheckKeyboardNavAction`
- Added all new types to `TestAction` union

### 2. Updated `prisma/schema.prisma`
- Added `SecurityScan` model with fields: id, status, url, overallScore, headersScore, cspScore, mixedContentScore, findings, recommendations, rawHeaders, llmUsed, duration, error, timestamps
- Added `A11yAudit` model with fields: id, status, url, overallScore, wcagLevel, violations, passes, incomplete, recommendations, llmUsed, duration, error, timestamps
- Added relation fields to User, Project, and TestRun models
- Ran `npx prisma generate` successfully

### 3. Created `src/lib/agent/security-scanner.ts`
- Main function: `runSecurityScan(input)` with full credit check, browser automation, LLM enrichment, DB persistence, notification dispatch
- 6 browser-based sub-checks:
  - `checkSecurityHeaders(headers)` — Checks for 6 security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
  - `checkCSP(headers)` — Validates CSP for unsafe-inline, unsafe-eval, wildcard script-src, missing default-src
  - `checkMixedContent(page)` — Finds HTTP resources on HTTPS pages (img, script, link, iframe)
  - `checkXSSVectors(page)` — Detects forms without CSRF tokens, inline event handlers, javascript: URIs
  - `checkCORS(headers)` — Flags overly permissive Access-Control-Allow-Origin: *
  - `checkCookieSecurity(page)` — Finds cookies missing HttpOnly flags
- 3-tier LLM strategy (z-ai-web-dev-sdk → external API → rule-based fallback)
- Score calculation: Critical -20, High -10, Medium -5, Low -2, Info -0, clamped to 0-100
- Exported types: `SecurityFinding`, `SecurityScanInput`, `SecurityScanResult`

### 4. Created `src/lib/agent/a11y-auditor.ts`
- Main function: `runA11yAudit(input)` with same credit/persist/notify pattern
- 8 browser-based sub-checks using `page.evaluate()`:
  - `checkImages(page)` — Finds img elements without alt text (WCAG 1.1.1)
  - `checkForms(page)` — Finds form inputs without labels (WCAG 1.3.1, 3.3.2)
  - `checkHeadings(page)` — Checks heading hierarchy, multiple h1s (WCAG 1.3.1)
  - `checkAriaLabels(page)` — Finds interactive elements without accessible names (WCAG 4.1.2)
  - `checkKeyboardNav(page)` — Finds positive tabindex, custom widgets without keyboard handlers (WCAG 2.1.1)
  - `checkContrast(page, wcagLevel)` — Computes contrast ratios using getComputedStyle (WCAG 1.4.3)
  - `checkFocus(page)` — Detects removed focus outlines (WCAG 2.4.7)
  - `checkLandmarks(page)` — Checks for main, nav, banner, contentinfo landmarks (WCAG 1.3.1)
- Score calculation: Critical -15, Serious -8, Moderate -4, Minor -1, clamped to 0-100
- Exported types: `A11yViolation`, `A11yCheckResult`, `A11yAuditInput`, `A11yAuditResult`

### 5. Created 6 API Routes
- `POST /api/security/scan` — Run security scan
- `GET /api/security/scans` — List security scans for a project
- `GET /api/security/scans/[id]` — Get single security scan
- `POST /api/accessibility/audit` — Run a11y audit
- `GET /api/accessibility/audits` — List a11y audits for a project
- `GET /api/accessibility/audits/[id]` — Get single a11y audit
- All routes follow existing patterns (auth check, project ownership verification, `force-dynamic`)
- [id] routes use Next.js 15+ params pattern with `Promise<{ id: string }>`

### 6. Updated `src/lib/billing/plans.ts`
- Added `security_scan` to `CreditAction` union (4 credits, $0.12 estimated cost)
- Added `a11y_audit` to `CreditAction` union (5 credits, $0.15 estimated cost)

### 7. Updated `src/lib/notifications/dispatcher.ts`
- Added `security_issue` and `a11y_issue` to `NotificationType` union
- Added default preferences: security_issue (inApp+email+slack), a11y_issue (inApp+slack)
- Added to `ensureUserPreferences` eventTypes array
- Added emoji: security_issue 🛡️, a11y_issue ♿
- Added colors: security_issue #ef4444, a11y_issue #f59e0b
- Added descriptions for both notification types

### 8. Created `src/components/security-scan-panel.tsx`
- Circular score indicator with color coding
- Findings list with severity badges (critical=red, high=orange, medium=amber, low=blue, info=gray)
- Category filter tabs (All, Headers, CSP, Mixed Content, XSS, CORS, Cookies)
- Expandable findings with description, evidence, recommendation, reference links
- "Run Security Scan" button
- Scan history list
- Sub-score display (Headers, CSP, Mixed Content)
- AI Enhanced badge when LLM was used

### 9. Created `src/components/a11y-audit-panel.tsx`
- Circular score indicator with color coding
- WCAG level badge and violation/pass/incomplete counts
- Violations list with severity badges (critical=purple, serious=red, moderate=amber, minor=blue)
- WCAG criterion badges linking to w3.org documentation
- Category filter tabs (All, Contrast, ARIA, Keyboard, Images, Forms, Headings, Focus, Landmarks)
- Expandable violations with element HTML preview, selector, recommendation
- "Run Accessibility Audit" button
- Audit history list

### 10. Updated Project Detail Page
- Added `SecurityScanPanel` and `A11yAuditPanel` imports
- Added `scanPanelKey` state
- Added Security & Accessibility section after Fix Suggestions with 2-column grid layout

### 11. Tests: `src/__tests__/security-a11y.test.ts`
- 32 tests total, all passing
- Security Scanner: 13 tests (credits, headers, CSP, CORS, score, DB persist, notifications, browser failure, LLM fallback)
- A11y Auditor: 11 tests (credits, images, forms, headings, landmarks, score, DB persist, browser failure, LLM fallback)
- Score Calculation: 2 tests
- Credit Costs: 2 tests
- Notification Types: 2 tests
- Action Types: 2 tests

### 12. Final Verification
- `npm run build` — All 75 routes compile cleanly (6 new routes)
- `npx vitest run` — 32/32 tests passing
- Committed and pushed: `feat(M17): Security & Accessibility Testing Agent`

## Summary
Milestone 17 is COMPLETE. The Security & Accessibility Testing Agent provides:
- Comprehensive security scanning (6 check categories: headers, CSP, mixed content, XSS, CORS, cookies)
- Full WCAG accessibility auditing (8 check categories: images, forms, headings, ARIA, keyboard, contrast, focus, landmarks)
- 3-tier LLM enrichment for both agents
- Credit metering (security_scan=4, a11y_audit=5)
- Notification dispatch for critical findings
- Dashboard UI panels with score indicators, category filters, and expandable findings
- 6 new API routes under /api/security/ and /api/accessibility/
- 2 new Prisma models: SecurityScan, A11yAudit
