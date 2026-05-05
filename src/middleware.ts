import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/onboarding"];

// Routes that authenticated users should be redirected away from
const AUTH_ROUTES = ["/auth/signin"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for API routes, static files, and NextAuth internals
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes("/favicon") ||
    pathname.includes(".png") ||
    pathname.includes(".ico")
  ) {
    return NextResponse.next();
  }

  // We can't check the session in middleware with database strategy
  // (no access to getServerSession in Edge runtime).
  // Auth protection is done client-side via useSession + useEffect redirects.
  // This middleware is primarily for future Edge-compatible session checks.

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
