import { NextResponse } from "next/server";
import { checkBrowserAvailability } from "@/lib/browser/chromium";

// GET /api/browser/check — Check if Chromium is available in the deployment
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const diagnostics = await checkBrowserAvailability();
    return NextResponse.json(diagnostics);
  } catch (error) {
    return NextResponse.json(
      {
        available: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
