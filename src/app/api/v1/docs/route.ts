/**
 * v1 API Documentation
 * GET /api/v1/docs  — OpenAPI 3.0 specification in JSON format
 */

import { NextResponse } from "next/server";
import { generateOpenAPISpec } from "@/lib/api/openapi";

export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://probato.ai";
  const spec = generateOpenAPISpec(baseUrl);

  return NextResponse.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
