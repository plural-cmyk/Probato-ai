/**
 * Probato Payment Gateway Abstraction Layer
 *
 * Provides a unified interface for payment processing across
 * multiple gateways (Stripe, Paystack, Mock for development).
 *
 * When Stripe/Paystack accounts are connected, swap the mock
 * gateway for the real implementation by setting PAYMENT_GATEWAY
 * env variable to "stripe" or "paystack".
 */

import { PlanSlug, CREDIT_PACKS, PLANS, AUTO_RECHARGE_DEFAULTS, CreditPackDefinition } from "./plans";

// ── Types ────────────────────────────────────────────────────────

export type GatewayType = "mock" | "stripe" | "paystack";

export interface CheckoutSessionParams {
  userId: string;
  email: string;
  planSlug: PlanSlug;
  successUrl: string;
  cancelUrl: string;
  /** For credit pack purchases instead of subscriptions */
  creditPackIndex?: number;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
  gateway: GatewayType;
}

export interface CustomerPortalParams {
  userId: string;
  returnUrl: string;
}

export interface CustomerPortalResult {
  url: string;
  gateway: GatewayType;
}

export interface SubscriptionUpdateParams {
  userId: string;
  newPlan: PlanSlug;
}

export interface SubscriptionCancelParams {
  userId: string;
  immediately?: boolean;
}

export interface PaymentResult {
  success: boolean;
  gatewayPaymentId?: string;
  gatewayCustomerId?: string;
  error?: string;
}

export interface GatewayWebhookEvent {
  eventType: string;
  gateway: GatewayType;
  data: Record<string, unknown>;
  rawPayload?: unknown;
}

// ── Gateway Interface ────────────────────────────────────────────

export interface PaymentGateway {
  readonly type: GatewayType;

  /** Create a checkout session for subscription signup or credit pack purchase */
  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult>;

  /** Create a customer portal session for managing billing */
  createCustomerPortal(params: CustomerPortalParams): Promise<CustomerPortalResult>;

  /** Update an existing subscription to a new plan */
  updateSubscription(params: SubscriptionUpdateParams): Promise<PaymentResult>;

  /** Cancel a subscription */
  cancelSubscription(params: SubscriptionCancelParams): Promise<PaymentResult>;

  /** Process a one-time credit pack purchase */
  purchaseCreditPack(userId: string, packIndex: number): Promise<PaymentResult>;

  /** Process auto-recharge */
  processAutoRecharge(userId: string, credits: number): Promise<PaymentResult>;

  /** Verify and parse a webhook event */
  parseWebhookEvent(rawBody: string, headers: Record<string, string>): Promise<GatewayWebhookEvent | null>;

  /** Check if the gateway is properly configured and operational */
  isConfigured(): boolean;
}

// ── Mock Gateway (for development & testing) ─────────────────────

export class MockGateway implements PaymentGateway {
  readonly type: GatewayType = "mock";

  isConfigured(): boolean {
    return true; // Always available for development
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    const plan = PLANS[params.planSlug];

    if (params.creditPackIndex !== undefined) {
      const pack = CREDIT_PACKS[params.creditPackIndex];
      if (!pack) throw new Error(`Invalid credit pack index: ${params.creditPackIndex}`);

      return {
        sessionId: `mock_cs_${Date.now()}_${params.creditPackIndex}`,
        url: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard?mock_checkout=credit_pack&pack=${params.creditPackIndex}`,
        gateway: "mock",
      };
    }

    return {
      sessionId: `mock_cs_${Date.now()}_${params.planSlug}`,
      url: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard?mock_checkout=subscription&plan=${params.planSlug}`,
      gateway: "mock",
    };
  }

  async createCustomerPortal(params: CustomerPortalParams): Promise<CustomerPortalResult> {
    return {
      url: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard?mock_portal=true`,
      gateway: "mock",
    };
  }

  async updateSubscription(params: SubscriptionUpdateParams): Promise<PaymentResult> {
    return {
      success: true,
      gatewayPaymentId: `mock_sub_update_${Date.now()}`,
      gatewayCustomerId: `mock_cust_${params.userId}`,
    };
  }

  async cancelSubscription(params: SubscriptionCancelParams): Promise<PaymentResult> {
    return {
      success: true,
      gatewayPaymentId: `mock_sub_cancel_${Date.now()}`,
      gatewayCustomerId: `mock_cust_${params.userId}`,
    };
  }

  async purchaseCreditPack(userId: string, packIndex: number): Promise<PaymentResult> {
    const pack = CREDIT_PACKS[packIndex];
    if (!pack) {
      return { success: false, error: `Invalid credit pack index: ${packIndex}` };
    }

    return {
      success: true,
      gatewayPaymentId: `mock_payment_${Date.now()}`,
      gatewayCustomerId: `mock_cust_${userId}`,
    };
  }

  async processAutoRecharge(userId: string, credits: number): Promise<PaymentResult> {
    const cost = credits * AUTO_RECHARGE_DEFAULTS.pricePerCredit;
    console.log(`[MockGateway] Auto-recharge: ${credits} credits for $${cost.toFixed(2)} for user ${userId}`);

    return {
      success: true,
      gatewayPaymentId: `mock_auto_recharge_${Date.now()}`,
      gatewayCustomerId: `mock_cust_${userId}`,
    };
  }

  async parseWebhookEvent(rawBody: string, headers: Record<string, string>): Promise<GatewayWebhookEvent | null> {
    // Mock gateway doesn't receive real webhooks
    // But we simulate checkout completion via the billing API
    return null;
  }
}

// ── Stripe Gateway (placeholder — activated when STRIPE_SECRET_KEY is set) ──

export class StripeGateway implements PaymentGateway {
  readonly type: GatewayType = "stripe";

  isConfigured(): boolean {
    return !!process.env.STRIPE_SECRET_KEY;
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    if (!this.isConfigured()) throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");

    // Dynamic import to avoid loading Stripe SDK when not needed
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

    if (params.creditPackIndex !== undefined) {
      const pack = CREDIT_PACKS[params.creditPackIndex];
      if (!pack) throw new Error(`Invalid credit pack index: ${params.creditPackIndex}`);
      if (!pack.stripePriceId) throw new Error("Credit pack Stripe price ID not configured");

      const session = await stripe.checkout.sessions.create({
        customer_email: params.email,
        mode: "payment",
        line_items: [{ price: pack.stripePriceId, quantity: 1 }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: { userId: params.userId, type: "credit_pack", packIndex: String(params.creditPackIndex) },
      });

      return { sessionId: session.id, url: session.url ?? "", gateway: "stripe" };
    }

    const plan = PLANS[params.planSlug];
    if (!plan.stripePriceId) throw new Error(`Stripe price ID not configured for plan: ${params.planSlug}`);

    const session = await stripe.checkout.sessions.create({
      customer_email: params.email,
      mode: "subscription",
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { userId: params.userId, plan: params.planSlug },
      subscription_data: {
        metadata: { userId: params.userId, plan: params.planSlug },
      },
    });

    return { sessionId: session.id, url: session.url ?? "", gateway: "stripe" };
  }

  async createCustomerPortal(params: CustomerPortalParams): Promise<CustomerPortalResult> {
    if (!this.isConfigured()) throw new Error("Stripe is not configured");

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

    // Get customer ID from subscription
    const { db } = await import("@/lib/db");
    const sub = await db.subscription.findUnique({ where: { userId: params.userId } });
    if (!sub?.stripeCustomerId) throw new Error("No Stripe customer ID found");

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: params.returnUrl,
    });

    return { url: session.url, gateway: "stripe" };
  }

  async updateSubscription(params: SubscriptionUpdateParams): Promise<PaymentResult> {
    if (!this.isConfigured()) throw new Error("Stripe is not configured");

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

    const { db } = await import("@/lib/db");
    const sub = await db.subscription.findUnique({ where: { userId: params.userId } });
    if (!sub?.stripeSubscriptionId) throw new Error("No Stripe subscription ID found");

    const newPlan = PLANS[params.newPlan];
    if (!newPlan.stripePriceId) throw new Error(`Stripe price ID not configured for plan: ${params.newPlan}`);

    const subscription = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: subscription.items.data[0].id, price: newPlan.stripePriceId }],
      proration_behavior: "create_prorations",
    });

    return {
      success: true,
      gatewayPaymentId: sub.stripeSubscriptionId,
      gatewayCustomerId: sub.stripeCustomerId ?? undefined,
    };
  }

  async cancelSubscription(params: SubscriptionCancelParams): Promise<PaymentResult> {
    if (!this.isConfigured()) throw new Error("Stripe is not configured");

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

    const { db } = await import("@/lib/db");
    const sub = await db.subscription.findUnique({ where: { userId: params.userId } });
    if (!sub?.stripeSubscriptionId) throw new Error("No Stripe subscription ID found");

    if (params.immediately) {
      await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    } else {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }

    return {
      success: true,
      gatewayPaymentId: sub.stripeSubscriptionId,
      gatewayCustomerId: sub.stripeCustomerId ?? undefined,
    };
  }

  async purchaseCreditPack(userId: string, packIndex: number): Promise<PaymentResult> {
    // Credit packs are handled through checkout sessions, not direct charges
    throw new Error("Use createCheckoutSession with creditPackIndex for credit pack purchases");
  }

  async processAutoRecharge(userId: string, credits: number): Promise<PaymentResult> {
    if (!this.isConfigured()) throw new Error("Stripe is not configured");

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

    const { db } = await import("@/lib/db");
    const sub = await db.subscription.findUnique({ where: { userId } });
    if (!sub?.stripeCustomerId) throw new Error("No Stripe customer ID found");

    const cost = credits * AUTO_RECHARGE_DEFAULTS.pricePerCredit;
    const amountInCents = Math.round(cost * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      customer: sub.stripeCustomerId,
      metadata: { userId, type: "auto_recharge", credits: String(credits) },
      automatic_payment_methods: { enabled: true },
    });

    return {
      success: paymentIntent.status === "requires_action" || paymentIntent.status === "succeeded",
      gatewayPaymentId: paymentIntent.id,
      gatewayCustomerId: sub.stripeCustomerId ?? undefined,
    };
  }

  async parseWebhookEvent(rawBody: string, headers: Record<string, string>): Promise<GatewayWebhookEvent | null> {
    if (!this.isConfigured()) return null;

    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
      const sig = headers["stripe-signature"];
      if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) return null;

      const event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
      return {
        eventType: event.type,
        gateway: "stripe",
        data: event.data.object as Record<string, unknown>,
        rawPayload: event,
      };
    } catch {
      return null;
    }
  }
}

// ── Paystack Gateway (placeholder — activated when PAYSTACK_SECRET_KEY is set) ──

export class PaystackGateway implements PaymentGateway {
  readonly type: GatewayType = "paystack";

  private get secretKey(): string | undefined {
    return process.env.PAYSTACK_SECRET_KEY;
  }

  isConfigured(): boolean {
    return !!this.secretKey;
  }

  private async makeRequest(endpoint: string, method: string = "GET", body?: unknown) {
    if (!this.secretKey) throw new Error("Paystack is not configured. Set PAYSTACK_SECRET_KEY.");

    const response = await fetch(`https://api.paystack.co${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    if (!data.status) throw new Error(data.message || "Paystack API error");
    return data.data;
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    if (!this.isConfigured()) throw new Error("Paystack is not configured");

    if (params.creditPackIndex !== undefined) {
      const pack = CREDIT_PACKS[params.creditPackIndex];
      if (!pack) throw new Error(`Invalid credit pack index: ${params.creditPackIndex}`);

      const result = await this.makeRequest("/transaction/initialize", "POST", {
        email: params.email,
        amount: pack.priceKes * 100, // Paystack expects amount in kobo/cents
        currency: "KES",
        callback_url: params.successUrl,
        metadata: { userId: params.userId, type: "credit_pack", packIndex: String(params.creditPackIndex) },
      });

      return { sessionId: result.reference, url: result.authorization_url, gateway: "paystack" };
    }

    const plan = PLANS[params.planSlug];
    if (!plan.paystackPlanCode) throw new Error(`Paystack plan code not configured for plan: ${params.planSlug}`);

    const result = await this.makeRequest("/transaction/initialize", "POST", {
      email: params.email,
      amount: (plan.priceKes ?? plan.price * 130) * 100,
      currency: "KES",
      callback_url: params.successUrl,
      plan: plan.paystackPlanCode,
      metadata: { userId: params.userId, plan: params.planSlug, type: "subscription" },
    });

    return { sessionId: result.reference, url: result.authorization_url, gateway: "paystack" };
  }

  async createCustomerPortal(params: CustomerPortalParams): Promise<CustomerPortalResult> {
    // Paystack doesn't have a customer portal like Stripe
    // Return the dashboard with a billing section
    return {
      url: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard?tab=billing`,
      gateway: "paystack",
    };
  }

  async updateSubscription(params: SubscriptionUpdateParams): Promise<PaymentResult> {
    if (!this.isConfigured()) throw new Error("Paystack is not configured");

    const { db } = await import("@/lib/db");
    const sub = await db.subscription.findUnique({ where: { userId: params.userId } });
    if (!sub?.paystackSubscriptionCode) throw new Error("No Paystack subscription code found");

    const newPlan = PLANS[params.newPlan];
    if (!newPlan.paystackPlanCode) throw new Error(`Paystack plan code not configured for plan: ${params.newPlan}`);

    await this.makeRequest(`/subscription/${sub.paystackSubscriptionCode}/manage`, "POST", {
      plan: newPlan.paystackPlanCode,
    });

    return { success: true, gatewayCustomerId: sub.paystackCustomerId ?? undefined };
  }

  async cancelSubscription(params: SubscriptionCancelParams): Promise<PaymentResult> {
    if (!this.isConfigured()) throw new Error("Paystack is not configured");

    const { db } = await import("@/lib/db");
    const sub = await db.subscription.findUnique({ where: { userId: params.userId } });
    if (!sub?.paystackSubscriptionCode) throw new Error("No Paystack subscription code found");

    await this.makeRequest(`/subscription/${sub.paystackSubscriptionCode}/disable`, "POST");

    return { success: true, gatewayCustomerId: sub.paystackCustomerId ?? undefined };
  }

  async purchaseCreditPack(userId: string, packIndex: number): Promise<PaymentResult> {
    throw new Error("Use createCheckoutSession with creditPackIndex for credit pack purchases");
  }

  async processAutoRecharge(userId: string, credits: number): Promise<PaymentResult> {
    if (!this.isConfigured()) throw new Error("Paystack is not configured");

    const { db } = await import("@/lib/db");
    const sub = await db.subscription.findUnique({ where: { userId } });
    const email = sub ? (await db.user.findUnique({ where: { id: userId } }))?.email : undefined;
    if (!email) throw new Error("User email not found for auto-recharge");

    const costKes = Math.round(credits * AUTO_RECHARGE_DEFAULTS.pricePerCredit * 130); // Convert USD to KES
    const result = await this.makeRequest("/transaction/initialize", "POST", {
      email,
      amount: costKes * 100, // Paystack expects kobo
      currency: "KES",
      metadata: { userId, type: "auto_recharge", credits: String(credits) },
    });

    return {
      success: true,
      gatewayPaymentId: result.reference,
      gatewayCustomerId: sub?.paystackCustomerId ?? undefined,
    };
  }

  async parseWebhookEvent(rawBody: string, headers: Record<string, string>): Promise<GatewayWebhookEvent | null> {
    if (!this.isConfigured()) return null;

    try {
      const crypto = await import("crypto");
      const hash = crypto.createHmac("sha512", this.secretKey!).update(rawBody).digest("hex");
      if (hash !== headers["x-paystack-signature"]) return null;

      const payload = JSON.parse(rawBody);
      return {
        eventType: payload.event,
        gateway: "paystack",
        data: payload.data,
        rawPayload: payload,
      };
    } catch {
      return null;
    }
  }
}

// ── Gateway Factory ──────────────────────────────────────────────

let _gatewayInstance: PaymentGateway | null = null;

export function getPaymentGateway(): PaymentGateway {
  if (_gatewayInstance) return _gatewayInstance;

  const gatewayType = (process.env.PAYMENT_GATEWAY ?? "mock") as GatewayType;

  switch (gatewayType) {
    case "stripe":
      _gatewayInstance = new StripeGateway();
      break;
    case "paystack":
      _gatewayInstance = new PaystackGateway();
      break;
    case "mock":
    default:
      _gatewayInstance = new MockGateway();
      break;
  }

  return _gatewayInstance;
}

/** Reset gateway instance (useful for testing) */
export function resetPaymentGateway(): void {
  _gatewayInstance = null;
}
