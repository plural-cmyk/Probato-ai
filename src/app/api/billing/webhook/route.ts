import { NextRequest, NextResponse } from "next/server";
import { getPaymentGateway, GatewayType } from "@/lib/billing/gateway";
import { PlanSlug, PLANS, CREDIT_PACKS } from "@/lib/billing/plans";
import { activateSubscription, getSubscriptionInfo } from "@/lib/billing/subscription";
import { addCredits } from "@/lib/billing/credits";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── POST /api/billing/webhook ─ Handle payment gateway webhooks ──

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const gateway = getPaymentGateway();
    const event = await gateway.parseWebhookEvent(rawBody, headers);

    if (!event) {
      // For mock gateway, handle simulated checkout completion
      // In production, this would only come from real gateway webhooks
      return NextResponse.json({ received: true, processed: false, reason: "No valid webhook event" });
    }

    console.log(`[Billing Webhook] ${event.gateway} event: ${event.eventType}`);

    // Process based on gateway + event type
    switch (event.gateway) {
      case "stripe":
        return await handleStripeEvent(event);
      case "paystack":
        return await handlePaystackEvent(event);
      default:
        return NextResponse.json({ received: true, processed: false });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Billing Webhook] Failed:", message);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

// ── Stripe Event Handler ─────────────────────────────────────────

async function handleStripeEvent(event: { eventType: string; data: Record<string, unknown> }) {
  switch (event.eventType) {
    case "checkout.session.completed": {
      const session = event.data as Record<string, any>;
      const userId = session.metadata?.userId as string;
      const type = session.metadata?.type as string;

      if (!userId) return NextResponse.json({ processed: false, reason: "No userId in metadata" });

      if (type === "subscription") {
        const planSlug = (session.metadata?.plan ?? "pro") as PlanSlug;
        await activateSubscription(userId, planSlug, {
          gateway: "stripe",
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
        });
      } else if (type === "credit_pack") {
        const packIndex = parseInt(session.metadata?.packIndex ?? "0");
        const pack = CREDIT_PACKS[packIndex];
        if (pack) {
          await addCredits(userId, pack.credits, "credit_pack", `Purchased ${pack.label}: ${pack.credits} credits`, session.payment_intent as string);
        }
      } else if (type === "auto_recharge") {
        const credits = parseInt(session.metadata?.credits ?? "50");
        await addCredits(userId, credits, "auto_recharge", `Auto-recharge: ${credits} credits`, session.payment_intent as string);
      }

      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data as Record<string, any>;
      const stripeCustomerId = sub.customer as string;

      const dbSub = await db.subscription.findUnique({ where: { stripeCustomerId } });
      if (dbSub) {
        const priceId = sub.items?.data?.[0]?.price?.id;
        // Find the matching plan by stripePriceId
        const matchingPlan = Object.values(PLANS).find((p) => p.stripePriceId === priceId);
        if (matchingPlan && dbSub.plan !== matchingPlan.slug) {
          await activateSubscription(dbSub.userId, matchingPlan.slug, { gateway: "stripe" });
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data as Record<string, any>;
      const stripeCustomerId = sub.customer as string;

      const dbSub = await db.subscription.findUnique({ where: { stripeCustomerId } });
      if (dbSub) {
        await db.subscription.update({
          where: { userId: dbSub.userId },
          data: { plan: "free", status: "active", cancelAtPeriodEnd: false },
        });
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data as Record<string, any>;
      const stripeCustomerId = invoice.customer as string;

      const dbSub = await db.subscription.findUnique({ where: { stripeCustomerId } });
      if (dbSub) {
        await db.subscription.update({
          where: { userId: dbSub.userId },
          data: { status: "past_due" },
        });
      }
      break;
    }

    default:
      // Unhandled event — acknowledge but don't process
      break;
  }

  return NextResponse.json({ received: true, processed: true });
}

// ── Paystack Event Handler ───────────────────────────────────────

async function handlePaystackEvent(event: { eventType: string; data: Record<string, unknown> }) {
  const data = event.data as Record<string, any>;

  switch (event.eventType) {
    case "charge.success": {
      const metadata = data.metadata as Record<string, string> | undefined;
      const userId = metadata?.userId;
      const type = metadata?.type;

      if (!userId) return NextResponse.json({ processed: false, reason: "No userId in metadata" });

      if (type === "subscription") {
        const planSlug = (metadata?.plan ?? "pro") as PlanSlug;
        await activateSubscription(userId, planSlug, {
          gateway: "paystack",
          paystackCustomerId: data.customer?.customer_code as string,
          paystackSubscriptionCode: data.subscription?.subscription_code as string,
        });
      } else if (type === "credit_pack") {
        const packIndex = parseInt(metadata?.packIndex ?? "0");
        const pack = CREDIT_PACKS[packIndex];
        if (pack) {
          await addCredits(userId, pack.credits, "credit_pack", `Purchased ${pack.label}: ${pack.credits} credits`, data.reference as string);
        }
      } else if (type === "auto_recharge") {
        const credits = parseInt(metadata?.credits ?? "50");
        await addCredits(userId, credits, "auto_recharge", `Auto-recharge: ${credits} credits`, data.reference as string);
      }

      break;
    }

    case "subscription.disable": {
      const subscriptionCode = data.subscription_code as string;
      const dbSub = await db.subscription.findUnique({ where: { paystackSubscriptionCode: subscriptionCode } });
      if (dbSub) {
        await db.subscription.update({
          where: { userId: dbSub.userId },
          data: { plan: "free", status: "active", cancelAtPeriodEnd: false },
        });
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true, processed: true });
}
