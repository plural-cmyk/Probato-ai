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
- Pushed schema to Neon PostgreSQL (prisma db push)
- Build verified - all routes compile cleanly
- Force-pushed clean main branch to GitHub
- User tested and confirmed: GitHub OAuth sign-in works, dashboard accessible

Stage Summary:
- ✅ Milestone 1 COMPLETE - User confirmed "tested positive"
- GitHub OAuth callback URL set to https://probato-ai.vercel.app/api/auth/callback/github

---
Task ID: 2
Agent: main
Task: Milestone 2 - Docker Sandbox API

Work Log:
- Installed Dockerode for Docker container management
- Created /src/lib/sandbox/docker.ts with full Docker integration
- Auto-detects framework (Next.js, Vite, CRA, generic Node.js)
- Creates isolated Docker network (probato-sandbox)
- Resource limits: 512MB RAM, 1GB swap, CPU shares
- POST /api/sandbox - Create and launch sandbox container
- GET /api/sandbox/[id] - Get sandbox status and container logs
- DELETE /api/sandbox/[id] - Stop and remove sandbox container
- Updated dashboard with Connect Repository dialog (URL, name, branch)
- Dashboard: Launch Sandbox button, Status drawer, Destroy button
- Fixed Turbopack/dockerode/ssh2 compatibility - switched to webpack build
- Added dockerode/ssh2 to serverExternalPackages
- Build verified - all 9 routes compile
- Pushed to GitHub

Stage Summary:
- Milestone 2 code is complete and pushed
- Docker must be running locally (or DOCKER_HOST set for remote) for sandbox to work
- On Vercel (no Docker), sandbox endpoints return 503 with helpful message
