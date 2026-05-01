import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { browsePage, browseMultiplePages } from "@/lib/browser/chromium";

// POST /api/browse — Browse a URL and return screenshot + metadata
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { url, urls, width, height, waitFor, fullPage, selector } = body;

    // Single URL browse
    if (url) {
      if (!url.startsWith("http")) {
        return NextResponse.json(
          { error: "URL must start with http:// or https://" },
          { status: 400 }
        );
      }

      const result = await browsePage({
        url,
        width: width ?? 1280,
        height: height ?? 720,
        waitFor: waitFor ?? 3000,
        fullPage: fullPage ?? false,
        selector,
      });

      return NextResponse.json(result);
    }

    // Multiple URLs browse
    if (urls && Array.isArray(urls)) {
      const validUrls = urls.filter(
        (u: string) => typeof u === "string" && u.startsWith("http")
      );

      if (validUrls.length === 0) {
        return NextResponse.json(
          { error: "No valid URLs provided" },
          { status: 400 }
        );
      }

      if (validUrls.length > 10) {
        return NextResponse.json(
          { error: "Maximum 10 URLs per request" },
          { status: 400 }
        );
      }

      const results = await browseMultiplePages(validUrls, {
        width,
        height,
        waitFor,
        fullPage,
      });

      return NextResponse.json({ results });
    }

    return NextResponse.json(
      { error: "Provide 'url' (string) or 'urls' (string array)" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Browse error:", error);
    return NextResponse.json(
      {
        error: "Failed to browse page",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
