import { NextResponse } from "next/server";

export async function GET() {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "probato-api",
    version: "0.1.0",
  };

  return NextResponse.json(health);
}
