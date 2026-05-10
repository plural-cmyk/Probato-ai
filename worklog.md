# Probato Project Worklog

---
Task ID: 1
Agent: Main Agent
Task: Execute URL-based testing changes + dual database setup

Work Log:
- Verified repo at /home/z/my-project with git remote to plural-cmyk/Probato-ai
- Confirmed all 7 URL-based testing steps were already committed in eabb404 (from previous session)
- Schema: liveUrl (String, optional) + source (String, default "repo") already in Project model
- API routes: /api/projects, /api/sandbox, /api/sandbox/[id] all handle URL-based projects
- Dashboard: New Project dialog has Live URL / Git Repository toggle
- Onboarding: Step 2 has the same toggle
- Project detail: URL fallback chain uses liveUrl first
- Ran Prisma db push against Supabase — all tables created successfully
- Created db-neon.ts: Secondary Prisma client for Neon (graceful null fallback)
- Created db-dual.ts: Dual-write utilities (dualWrite, dualWriteAsync, syncToNeon)
- Created .env.example: Documents all required environment variables
- Added NEON_DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET to .env
- Removed SQLite (db/custom.db) from git tracking
- Auth: Confirmed NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are NOT needed — auth uses PrismaAdapter(db) which points to Supabase via NextAuth

Stage Summary:
- Supabase database: OPERATIONAL (0 users, 0 projects — fresh)
- 4 commits ahead of origin (need to push)
- Git push REQUIRES a GitHub Personal Access Token (PAT) — public repos still need auth for pushes
- Neon connection string NOT YET provided — .env has placeholder
- All URL-based testing code is complete and committed locally

Commits to push:
1. eabb404 feat: Add URL-based testing option — Live URL / Git Repository toggle
2. 7cfcadf (session commit)
3. 288da85 feat: Add dual-database support (Supabase primary + Neon secondary)
4. deee1d7 chore: Remove SQLite DB from tracking, add to .gitignore

---
Task ID: 2
Agent: Main Agent
Task: Add Neon connection string and sync databases

Work Log:
- Added Neon connection string to .env as NEON_DATABASE_URL
- Ran prisma db push against Neon — schema already in sync (had existing tables from previous sessions)
- Verified both databases connected and operational
- Neon had existing data: 2 users (Demo User + justus kimanzi), 1 project (GROUNDWORK-v2)
- Synced all Neon data to Supabase — both databases now have identical data
- Removed channel_binding=require from Neon URL for Prisma compatibility (used sslmode=require only)

Stage Summary:
- Supabase: 2 users, 1 project (synced from Neon)
- Neon: 2 users, 1 project (original)
- Both databases in sync and operational
- Dual-write infrastructure ready (db-neon.ts + db-dual.ts)
