/**
 * v1 Health Check
 * GET /api/v1/health
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    version: "v1",
    timestamp: new Date().toISOString(),
    endpoints: {
      projects: "/api/v1/projects",
      discover: "/api/v1/discover",
      generate: "/api/v1/generate",
      schedules: "/api/v1/schedules",
      visual: "/api/v1/visual",
      billing: "/api/v1/billing",
      usage: "/api/v1/usage",
    },
  });
}
