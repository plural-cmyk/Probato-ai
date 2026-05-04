import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPaymentGateway } from "@/lib/billing/gateway";
import { PlanSlug, PLANS, CREDIT_PACKS } from "@/lib/billing/plans";
import { ensureUserBilling } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

// ── POST /api/billing/checkout ─ Create checkout session ─────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const email = session.user.email ?? "";

    await ensureUserBilling(userId);

    const body = await request.json();
    const { plan, creditPackIndex } = body as {
      plan?: PlanSlug;
      creditPackIndex?: number;
    };

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const gateway = getPaymentGateway();

    // Credit pack purchase
    if (creditPackIndex !== undefined) {
      if (creditPackIndex < 0 || creditPackIndex >= CREDIT_PACKS.length) {
        return NextResponse.json({ error: "Invalid credit pack" }, { status: 400 });
      }

      const result = await gateway.createCheckoutSession({
        userId,
        email,
        planSlug: "free", // Not relevant for packs
        successUrl: `${baseUrl}/dashboard?checkout=success&type=credit_pack`,
        cancelUrl: `${baseUrl}/dashboard?checkout=cancelled`,
        creditPackIndex,
      });

      return NextResponse.json({
        sessionId: result.sessionId,
        url: result.url,
        gateway: result.gateway,
      });
    }

    // Subscription checkout
    if (!plan) {
      return NextResponse.json({ error: "Provide 'plan' or 'creditPackIndex'" }, { status: 400 });
    }

    const planDef = PLANS[plan];
    if (!planDef) {
      return NextResponse.json({ error: `Invalid plan: ${plan}` }, { status: 400 });
    }

    if (plan === "enterprise") {
      return NextResponse.json({
        url: `${baseUrl}/dashboard?contact_sales=true`,
        message: "Enterprise plan requires custom setup. Please contact sales.",
      });
    }

    const result = await gateway.createCheckoutSession({
      userId,
      email,
      planSlug: plan,
      successUrl: `${baseUrl}/dashboard?checkout=success&type=subscription&plan=${plan}`,
      cancelUrl: `${baseUrl}/dashboard?checkout=cancelled`,
    });

    return NextResponse.json({
      sessionId: result.sessionId,
      url: result.url,
      gateway: result.gateway,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Billing Checkout] Failed:", message);
    return NextResponse.json({ error: "Checkout failed", details: message }, { status: 500 });
  }
}
