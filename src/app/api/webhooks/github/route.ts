import { NextRequest, NextResponse } from "next/server";
import { githubApp } from "@/lib/github/app";
import { processWebhookEvent } from "@/lib/github/webhook-processor";

export const dynamic = "force-dynamic";

// ── POST /api/webhooks/github ─ Receive GitHub App webhooks ────────

export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256") || "";
    const event = request.headers.get("x-github-event") || "";
    const deliveryId = request.headers.get("x-github-delivery") || null;

    // Verify webhook signature
    if (!githubApp.verifyWebhookSignature(rawBody, signature)) {
      console.warn("[Webhook] Invalid signature — rejecting request");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Parse the payload
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // Handle ping event (GitHub sends this when a webhook is first created)
    if (event === "ping") {
      console.log("[Webhook] Received ping from GitHub");
      return NextResponse.json({ message: "pong" });
    }

    console.log(`[Webhook] Received ${event} (${payload.action || "no-action"}) delivery: ${deliveryId}`);

    // Process the event asynchronously (don't block the response)
    // GitHub expects a 2xx response within 10 seconds
    const result = await processWebhookEvent(event, deliveryId, payload);

    return NextResponse.json({
      received: true,
      event,
      action: payload.action,
      eventId: result.eventId,
      testRunId: result.testRunId || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Webhook] Processing failed:", message);
    return NextResponse.json(
      { error: "Webhook processing failed", details: message },
      { status: 500 }
    );
  }
}

// ── GET /api/webhooks/github ─ Health check for webhook endpoint ───

export async function GET() {
  return NextResponse.json({
    endpoint: "github-webhook",
    configured: githubApp.isConfigured(),
    supportedEvents: [
      "ping",
      "installation",
      "installation_repositories",
      "push",
      "pull_request",
    ],
  });
}
