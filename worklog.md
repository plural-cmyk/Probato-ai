# Probato Development Worklog

---
Task ID: 1
Agent: main
Task: Milestone 1 - GitHub OAuth + Dashboard

Work Log:
- Switched Prisma from SQLite to Neon PostgreSQL
- Created full domain schema: User, Account, Session, VerificationToken, Project, Feature, TestRun, TestResult, TestCase
- Configured NextAuth v4 with GitHub provider + PrismaAdapter
- Built custom sign-in page at /auth/signin with GitHub OAuth button
- Built dashboard page at /dashboard with user info, project stats, project list
- Created SessionProvider wrapper component
- Created API routes: /api/auth/[...nextauth], /api/projects (GET+POST), /api/health
- Updated landing page to wire Sign In / Get Started buttons to GitHub OAuth
- Updated next.config.ts for GitHub/Google avatar remote patterns
- Added custom NextAuth type declarations for githubLogin/githubId
- Pushed schema to Neon PostgreSQL (prisma db push)
- Build verified - all routes compile cleanly
- Force-pushed clean main branch to GitHub

Stage Summary:
- Code pushed to: https://github.com/plural-cmyk/Probato-ai (main branch)
- Vercel should auto-deploy from this push
- **BLOCKING**: User must create GitHub OAuth App and set env vars on Vercel before testing
- Database schema is live on Neon PostgreSQL with all 8 tables created
