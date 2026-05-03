import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PlanSlug } from "@/lib/billing/plans";
import { activateSubscription, changeSubscription, cancelSubscription, getSubscriptionInfo } from "@/lib/billing/subscription";
import { ensureUserBilling } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

// ── GET /api/billing/subscription ─ Get current subscription ──────

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureUserBilling(session.user.id);
    const info = await getSubscriptionInfo(session.user.id);

    return NextResponse.json({ subscription: info });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Billing Subscription] GET failed:", message);
    return NextResponse.json({ error: "Failed to get subscription", details: message }, { status: 500 });
  }
}

// ── POST /api/billing/subscription ─ Activate a new subscription ──

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { plan, gateway, stripeCustomerId, stripeSubscriptionId, stripePriceId, paystackCustomerId, paystackSubscriptionCode, paystackPlanCode } = body;

    if (!plan) {
      return NextResponse.json({ error: "Plan is required" }, { status: 400 });
    }

    await ensureUserBilling(session.user.id);
    const result = await activateSubscription(session.user.id, plan as PlanSlug, {
      gateway,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
      paystackCustomerId,
      paystackSubscriptionCode,
      paystackPlanCode,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Billing Subscription] POST failed:", message);
    return NextResponse.json({ error: "Failed to activate subscription", details: message }, { status: 500 });
  }
}

// ── PATCH /api/billing/subscription ─ Change or cancel subscription

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, plan, immediately } = body;

    await ensureUserBilling(session.user.id);

    if (action === "change" && plan) {
      const result = await changeSubscription(session.user.id, plan as PlanSlug);
      return NextResponse.json(result);
    }

    if (action === "cancel") {
      const result = await cancelSubscription(session.user.id, immediately ?? false);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Provide action: 'change' with 'plan', or 'cancel'" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Billing Subscription] PATCH failed:", message);
    return NextResponse.json({ error: "Failed to update subscription", details: message }, { status: 500 });
  }
}
