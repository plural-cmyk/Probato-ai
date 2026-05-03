/**
 * POST /api/visual/capture
 *
 * Capture a screenshot for visual regression baseline.
 * This endpoint launches a browser, navigates to the URL,
 * captures a screenshot, and stores it as a baseline.
 *
 * If a baseline already exists for the same (projectId, name, url, selector, viewport),
 * it updates the baseline with the new screenshot.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { captureForVisualRegression } from "@/lib/visual/compare";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      projectId,
      name,
      url,
      selector,
      viewportWidth = 1280,
      viewportHeight = 720,
      fullPage = false,
      waitForSelector: waitSelector,
      waitMs = 2000,
    } = body;

    // Validate required fields
    if (!projectId || !name || !url) {
      return NextResponse.json(
        { error: "projectId, name, and url are required" },
        { status: 400 }
      );
    }

    // Verify project belongs to user
    const project = await db.project.findFirst({
      where: { id: projectId, userId: session.user.id },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Capture the screenshot
    const screenshotBase64 = await captureForVisualRegression({
      url,
      selector: selector || undefined,
      viewportWidth,
      viewportHeight,
      fullPage,
      waitForSelector: waitSelector,
      waitMs,
    });

    // Upsert baseline: create or update if same unique key exists
    const baseline = await db.visualBaseline.upsert({
      where: {
        projectId_name_url_selector_viewportWidth_viewportHeight: {
          projectId,
          name,
          url,
          selector: selector ?? "",
          viewportWidth,
          viewportHeight,
        },
      },
      update: {
        screenshot: screenshotBase64,
        approvedAt: new Date(),
      },
      create: {
        name,
        url,
        selector: selector ?? null,
        viewportWidth,
        viewportHeight,
        screenshot: screenshotBase64,
        approvedAt: new Date(),
        projectId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      id: baseline.id,
      name: baseline.name,
      url: baseline.url,
      selector: baseline.selector,
      viewportWidth: baseline.viewportWidth,
      viewportHeight: baseline.viewportHeight,
      approvedAt: baseline.approvedAt,
      createdAt: baseline.createdAt,
      message: "Baseline captured successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Visual Capture] Error:", message);
    return NextResponse.json(
      { error: "Failed to capture baseline", details: message },
      { status: 500 }
    );
  }
}
