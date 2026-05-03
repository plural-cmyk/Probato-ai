/**
 * Probato Subscription Management Service
 *
 * Handles subscription lifecycle: creation, upgrades, downgrades,
 * cancellations, and plan-gated feature access.
 */

import { db } from "@/lib/db";
import { PlanSlug, PLANS, isFeatureAvailable, isProjectLimitReached, isScheduleLimitReached } from "./plans";
import { ensureUserBilling, updatePlanCredits, resetMonthlyCredits } from "./credits";
import { getPaymentGateway } from "./gateway";

// ── Types ────────────────────────────────────────────────────────

export interface SubscriptionInfo {
  plan: PlanSlug;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
  gateway: string;
}

export interface SubscriptionChangeResult {
  success: boolean;
  oldPlan: PlanSlug;
  newPlan: PlanSlug;
  effectiveImmediately: boolean;
  message: string;
}

export interface PlanAccessCheck {
  allowed: boolean;
  reason?: string;
  currentPlan: PlanSlug;
  requiredPlan?: PlanSlug;
}

// ── Get Subscription Info ────────────────────────────────────────

export async function getSubscriptionInfo(userId: string): Promise<SubscriptionInfo> {
  await ensureUserBilling(userId);

  const sub = await db.subscription.findUnique({ where: { userId } });
  return {
    plan: (sub?.plan as PlanSlug) ?? "free",
    status: sub?.status ?? "active",
    currentPeriodEnd: sub?.currentPeriodEnd ?? new Date(),
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    trialEndsAt: sub?.trialEndsAt ?? null,
    gateway: sub?.gateway ?? "mock",
  };
}

// ── Create/Activate Subscription ─────────────────────────────────

/**
 * Activate a subscription for a user (called after successful payment).
 * Updates the plan, grants credits, and sets the billing period.
 */
export async function activateSubscription(
  userId: string,
  planSlug: PlanSlug,
  options?: {
    gateway?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePriceId?: string;
    paystackCustomerId?: string;
    paystackSubscriptionCode?: string;
    paystackPlanCode?: string;
    gatewayPaymentId?: string;
  }
): Promise<SubscriptionChangeResult> {
  await ensureUserBilling(userId);

  const currentSub = await db.subscription.findUnique({ where: { userId } });
  const oldPlan = (currentSub?.plan as PlanSlug) ?? "free";
  const plan = PLANS[planSlug];

  // Update subscription record
  await db.subscription.upsert({
    where: { userId },
    create: {
      userId,
      plan: planSlug,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      gateway: options?.gateway ?? currentSub?.gateway ?? "mock",
      stripeCustomerId: options?.stripeCustomerId,
      stripeSubscriptionId: options?.stripeSubscriptionId,
      stripePriceId: options?.stripePriceId,
      paystackCustomerId: options?.paystackCustomerId,
      paystackSubscriptionCode: options?.paystackSubscriptionCode,
      paystackPlanCode: options?.paystackPlanCode,
    },
    update: {
      plan: planSlug,
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ...(options?.gateway ? { gateway: options.gateway } : {}),
      ...(options?.stripeCustomerId ? { stripeCustomerId: options.stripeCustomerId } : {}),
      ...(options?.stripeSubscriptionId ? { stripeSubscriptionId: options.stripeSubscriptionId } : {}),
      ...(options?.stripePriceId ? { stripePriceId: options.stripePriceId } : {}),
      ...(options?.paystackCustomerId ? { paystackCustomerId: options.paystackCustomerId } : {}),
      ...(options?.paystackSubscriptionCode ? { paystackSubscriptionCode: options.paystackSubscriptionCode } : {}),
      ...(options?.paystackPlanCode ? { paystackPlanCode: options.paystackPlanCode } : {}),
    },
  });

  // Update credits for the new plan
  await updatePlanCredits(userId, planSlug);

  return {
    success: true,
    oldPlan,
    newPlan: planSlug,
    effectiveImmediately: true,
    message: `Subscription activated: ${plan.name} plan with ${plan.credits} credits/month`,
  };
}

// ── Upgrade/Downgrade Subscription ───────────────────────────────

/**
 * Change a user's subscription plan.
 * Upgrades take effect immediately; downgrades at end of billing period.
 */
export async function changeSubscription(
  userId: string,
  newPlan: PlanSlug
): Promise<SubscriptionChangeResult> {
  await ensureUserBilling(userId);

  const currentSub = await db.subscription.findUnique({ where: { userId } });
  if (!currentSub) throw new Error("No subscription found");

  const oldPlan = currentSub.plan as PlanSlug;
  const oldPlanDef = PLANS[oldPlan];
  const newPlanDef = PLANS[newPlan];

  if (oldPlan === newPlan) {
    return {
      success: false,
      oldPlan,
      newPlan,
      effectiveImmediately: false,
      message: "You are already on this plan",
    };
  }

  const isUpgrade = newPlanDef.price > oldPlanDef.price;

  // Process through payment gateway
  const gateway = getPaymentGateway();
  const gatewayResult = await gateway.updateSubscription({ userId, newPlan });

  if (!gatewayResult.success) {
    return {
      success: false,
      oldPlan,
      newPlan,
      effectiveImmediately: false,
      message: gatewayResult.error ?? "Payment gateway update failed",
    };
  }

  if (isUpgrade) {
    // Immediate upgrade
    await db.subscription.update({
      where: { userId },
      data: {
        plan: newPlan,
        cancelAtPeriodEnd: false,
        ...(gatewayResult.gatewayPaymentId ? { stripeSubscriptionId: gatewayResult.gatewayPaymentId } : {}),
      },
    });

    await updatePlanCredits(userId, newPlan);

    return {
      success: true,
      oldPlan,
      newPlan,
      effectiveImmediately: true,
      message: `Upgraded to ${newPlanDef.name} — ${newPlanDef.credits} credits added immediately`,
    };
  } else {
    // Downgrade at end of billing period
    await db.subscription.update({
      where: { userId },
      data: {
        plan: newPlan, // Update plan now so UI reflects it
        cancelAtPeriodEnd: false,
        // Credits stay at current level until next billing cycle
      },
    });

    return {
      success: true,
      oldPlan,
      newPlan,
      effectiveImmediately: false,
      message: `Downgraded to ${newPlanDef.name} — changes take effect at end of billing period. Your current credits remain until then.`,
    };
  }
}

// ── Cancel Subscription ──────────────────────────────────────────

/**
 * Cancel a user's subscription.
 * By default, cancellation takes effect at end of billing period (soft cancel).
 * If immediately=true, the subscription reverts to free right away.
 */
export async function cancelSubscription(
  userId: string,
  immediately: boolean = false
): Promise<SubscriptionChangeResult> {
  const currentSub = await db.subscription.findUnique({ where: { userId } });
  if (!currentSub) throw new Error("No subscription found");

  const oldPlan = currentSub.plan as PlanSlug;

  // Process through payment gateway
  const gateway = getPaymentGateway();
  await gateway.cancelSubscription({ userId, immediately });

  if (immediately) {
    // Revert to free immediately
    await db.subscription.update({
      where: { userId },
      data: {
        plan: "free",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date(),
      },
    });

    // Reset credits to free plan
    await updatePlanCredits(userId, "free");

    return {
      success: true,
      oldPlan,
      newPlan: "free",
      effectiveImmediately: true,
      message: "Subscription cancelled. You are now on the Free plan. Purchased credits are preserved.",
    };
  } else {
    // Soft cancel — active until end of period
    await db.subscription.update({
      where: { userId },
      data: {
        cancelAtPeriodEnd: true,
        status: "canceling",
      },
    });

    return {
      success: true,
      oldPlan,
      newPlan: oldPlan,
      effectiveImmediately: false,
      message: `Subscription will end on ${currentSub.currentPeriodEnd.toLocaleDateString()}. You keep full access until then.`,
    };
  }
}

// ── Plan Access Checks ───────────────────────────────────────────

/**
 * Check if a user can access a specific feature based on their plan.
 */
export async function checkFeatureAccess(
  userId: string,
  feature: "autoHeal" | "visualRegression" | "priorityExecution"
): Promise<PlanAccessCheck> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  const currentPlan = (sub?.plan as PlanSlug) ?? "free";

  if (isFeatureAvailable(currentPlan, feature)) {
    return { allowed: true, currentPlan };
  }

  // Find the minimum plan that has this feature
  const requiredPlan = Object.values(PLANS).find((p) => p[feature] === true);
  return {
    allowed: false,
    reason: `${feature === "autoHeal" ? "Auto-heal" : feature === "visualRegression" ? "Visual regression" : "Priority execution"} requires the ${requiredPlan?.name ?? "Pro"} plan or higher`,
    currentPlan,
    requiredPlan: requiredPlan?.slug,
  };
}

/**
 * Check if a user can create more projects based on their plan.
 */
export async function checkProjectLimit(userId: string): Promise<PlanAccessCheck> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  const currentPlan = (sub?.plan as PlanSlug) ?? "free";
  const projectCount = await db.project.count({ where: { userId } });

  if (!isProjectLimitReached(currentPlan, projectCount)) {
    return { allowed: true, currentPlan };
  }

  const plan = PLANS[currentPlan];
  return {
    allowed: false,
    reason: `You've reached the ${plan.name} plan limit of ${plan.maxProjects} project(s). Upgrade for more.`,
    currentPlan,
    requiredPlan: currentPlan === "free" ? "pro" : "team",
  };
}

/**
 * Check if a user can create more schedules based on their plan.
 */
export async function checkScheduleLimit(userId: string): Promise<PlanAccessCheck> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  const currentPlan = (sub?.plan as PlanSlug) ?? "free";
  const scheduleCount = await db.schedule.count({ where: { userId } });

  if (!isScheduleLimitReached(currentPlan, scheduleCount)) {
    return { allowed: true, currentPlan };
  }

  const plan = PLANS[currentPlan];
  return {
    allowed: false,
    reason: `You've reached the ${plan.name} plan limit of ${plan.maxSchedules} scheduled test(s). Upgrade for more.`,
    currentPlan,
    requiredPlan: currentPlan === "free" ? "pro" : "team",
  };
}

/**
 * Get full billing summary for a user (for dashboard display).
 */
export async function getBillingSummary(userId: string) {
  await ensureUserBilling(userId);

  const [subscription, creditBalance, recentTransactions] = await Promise.all([
    db.subscription.findUnique({ where: { userId } }),
    db.creditBalance.findUnique({ where: { userId } }),
    db.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const planSlug = (subscription?.plan as PlanSlug) ?? "free";
  const plan = PLANS[planSlug];

  return {
    plan: planSlug,
    planDetails: plan,
    subscription: {
      status: subscription?.status ?? "active",
      currentPeriodEnd: subscription?.currentPeriodEnd ?? new Date(),
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      trialEndsAt: subscription?.trialEndsAt ?? null,
      gateway: subscription?.gateway ?? "mock",
    },
    credits: {
      balance: creditBalance?.balance ?? 0,
      monthlyAllowance: creditBalance?.monthlyAllowance ?? 20,
      rolloverBalance: creditBalance?.rolloverBalance ?? 0,
      purchasedBalance: creditBalance?.purchasedBalance ?? 0,
      totalUsed: creditBalance?.totalUsed ?? 0,
      totalReceived: creditBalance?.totalReceived ?? 0,
      autoRecharge: creditBalance?.autoRecharge ?? false,
      autoRechargeThreshold: creditBalance?.autoRechargeThreshold ?? 0,
      autoRechargeAmount: creditBalance?.autoRechargeAmount ?? 50,
    },
    recentTransactions,
  };
}
