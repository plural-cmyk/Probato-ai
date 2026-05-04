/**
 * Probato Credit Metering Service
 *
 * Handles all credit operations: checking balance, deducting credits,
 * reserving credits for timed actions (test execution), settling
 * after completion, and auto-recharge.
 *
 * Credit lifecycle:
 *   1. checkCredits() — Verify user has enough credits before an action
 *   2. deductCredits() — Immediately deduct for instant actions (generation, discovery)
 *   3. reserveCredits() — Reserve credits for timed actions (test execution)
 *   4. settleCredits() — Final deduction after timed action completes
 *   5. releaseCredits() — Return unused reserved credits
 *   6. addCredits() — Add credits (monthly allowance, packs, auto-recharge)
 */

import { db } from "@/lib/db";
import { CreditAction, CREDIT_COSTS, PlanSlug, PLANS, AUTO_RECHARGE_DEFAULTS } from "./plans";
import { getPaymentGateway } from "./gateway";

// ── Types ────────────────────────────────────────────────────────

export interface CreditCheckResult {
  hasCredits: boolean;
  balance: number;
  required: number;
  action: CreditAction;
  lowBalance: boolean; // true if balance is < 20% of monthly allowance
  planSlug: PlanSlug;
}

export interface CreditDeductionResult {
  success: boolean;
  balanceBefore: number;
  balanceAfter: number;
  deducted: number;
  transactionId: string;
  lowBalance: boolean;
}

export interface CreditReservationResult {
  success: boolean;
  reservationId: string;
  reserved: number;
  balanceAfter: number;
  lowBalance: boolean;
}

export interface CreditSettlementResult {
  success: boolean;
  used: number;
  released: number;
  balanceAfter: number;
  settlementTxnId: string;
  releaseTxnId?: string;
}

export interface CreditAddResult {
  success: boolean;
  added: number;
  balanceAfter: number;
  transactionId: string;
}

// ── Initialize User Billing ──────────────────────────────────────

/**
 * Ensure a user has a Subscription and CreditBalance record.
 * Called on first sign-up or when accessing billing for the first time.
 */
export async function ensureUserBilling(userId: string): Promise<{
  subscription: { id: string; plan: string; status: string };
  creditBalance: { id: string; balance: number; monthlyAllowance: number };
}> {
  // Ensure subscription exists
  const subscription = await db.subscription.upsert({
    where: { userId },
    create: {
      userId,
      plan: "free",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      gateway: "mock",
    },
    update: {},
  });

  // Ensure credit balance exists
  const freePlan = PLANS.free;
  const creditBalance = await db.creditBalance.upsert({
    where: { userId },
    create: {
      userId,
      balance: freePlan.credits,
      monthlyAllowance: freePlan.credits,
      totalReceived: freePlan.credits,
      lastMonthlyReset: new Date(),
    },
    update: {},
  });

  return { subscription, creditBalance };
}

// ── Check Credits ────────────────────────────────────────────────

/**
 * Check if a user has enough credits for an action.
 * Returns detailed info for the UI to display.
 */
export async function checkCredits(
  userId: string,
  action: CreditAction,
  quantity: number = 1
): Promise<CreditCheckResult> {
  await ensureUserBilling(userId);

  const balance = await db.creditBalance.findUnique({ where: { userId } });
  const subscription = await db.subscription.findUnique({ where: { userId } });

  const planSlug = (subscription?.plan as PlanSlug) ?? "free";
  const plan = PLANS[planSlug];
  const costDefinition = CREDIT_COSTS[action];
  const required = costDefinition.credits * quantity;

  const currentBalance = balance?.balance ?? 0;
  const hasCredits = currentBalance >= required;
  const lowBalance = plan.credits > 0 && currentBalance < plan.credits * 0.2;

  return {
    hasCredits,
    balance: currentBalance,
    required,
    action,
    lowBalance,
    planSlug,
  };
}

// ── Deduct Credits (instant actions) ─────────────────────────────

/**
 * Deduct credits immediately for instant actions like test generation,
 * feature discovery, visual comparison, and auto-heal.
 */
export async function deductCredits(
  userId: string,
  action: CreditAction,
  description: string,
  referenceId?: string,
  referenceType?: string,
  quantity: number = 1
): Promise<CreditDeductionResult> {
  await ensureUserBilling(userId);

  const costDefinition = CREDIT_COSTS[action];
  const amount = costDefinition.credits * quantity;

  const balance = await db.creditBalance.findUnique({ where: { userId } });
  if (!balance) throw new Error("Credit balance not found");

  if (balance.balance < amount) {
    return {
      success: false,
      balanceBefore: balance.balance,
      balanceAfter: balance.balance,
      deducted: 0,
      transactionId: "",
      lowBalance: true,
    };
  }

  const balanceBefore = balance.balance;
  const balanceAfter = balanceBefore - amount;

  // Create transaction and update balance atomically
  const [txn] = await db.$transaction([
    db.creditTransaction.create({
      data: {
        userId,
        type: "debit",
        amount,
        balanceAfter,
        action,
        description,
        referenceId,
        referenceType,
      },
    }),
    db.creditBalance.update({
      where: { userId },
      data: {
        balance: balanceAfter,
        totalUsed: { increment: amount },
      },
    }),
  ]);

  const plan = await getCurrentPlan(userId);
  const lowBalance = PLANS[plan].credits > 0 && balanceAfter < PLANS[plan].credits * 0.2;

  // Check auto-recharge
  if (balanceAfter <= (balance.autoRechargeThreshold ?? 0) && balance.autoRecharge) {
    await triggerAutoRecharge(userId);
  }

  return {
    success: true,
    balanceBefore,
    balanceAfter,
    deducted: amount,
    transactionId: txn.id,
    lowBalance,
  };
}

// ── Reserve Credits (timed actions) ──────────────────────────────

/**
 * Reserve credits for timed actions like test execution.
 * Reserved credits are held until the action completes,
 * then settled based on actual usage.
 */
export async function reserveCredits(
  userId: string,
  action: CreditAction,
  estimatedMinutes: number,
  description: string,
  referenceId?: string,
  referenceType?: string
): Promise<CreditReservationResult> {
  await ensureUserBilling(userId);

  const costDefinition = CREDIT_COSTS[action];
  const reserved = costDefinition.credits * Math.max(1, estimatedMinutes);

  const balance = await db.creditBalance.findUnique({ where: { userId } });
  if (!balance) throw new Error("Credit balance not found");

  if (balance.balance < reserved) {
    return {
      success: false,
      reservationId: "",
      reserved: 0,
      balanceAfter: balance.balance,
      lowBalance: true,
    };
  }

  const balanceAfter = balance.balance - reserved;

  const [txn] = await db.$transaction([
    db.creditTransaction.create({
      data: {
        userId,
        type: "reservation",
        amount: reserved,
        balanceAfter,
        action,
        description: `[RESERVED] ${description}`,
        referenceId,
        referenceType,
        reservationStatus: "pending",
      },
    }),
    db.creditBalance.update({
      where: { userId },
      data: { balance: balanceAfter },
    }),
  ]);

  const plan = await getCurrentPlan(userId);
  const lowBalance = PLANS[plan].credits > 0 && balanceAfter < PLANS[plan].credits * 0.2;

  return {
    success: true,
    reservationId: txn.id,
    reserved,
    balanceAfter,
    lowBalance,
  };
}

// ── Settle Credits ───────────────────────────────────────────────

/**
 * Settle a credit reservation after a timed action completes.
 * Deducts actual usage and returns unused reserved credits.
 */
export async function settleCredits(
  reservationId: string,
  actualMinutes: number,
  action: CreditAction
): Promise<CreditSettlementResult> {
  const reservation = await db.creditTransaction.findUnique({ where: { id: reservationId } });
  if (!reservation || reservation.type !== "reservation" || reservation.reservationStatus !== "pending") {
    throw new Error("Invalid or already settled reservation");
  }

  const costDefinition = CREDIT_COSTS[action];
  const actualUsed = costDefinition.credits * Math.max(0, actualMinutes);
  const reserved = reservation.amount;
  const toRelease = Math.max(0, reserved - actualUsed);

  const balance = await db.creditBalance.findUnique({ where: { userId: reservation.userId } });
  if (!balance) throw new Error("Credit balance not found");

  const balanceAfter = balance.balance + toRelease;

  await db.$transaction([
    // Mark reservation as settled
    db.creditTransaction.update({
      where: { id: reservationId },
      data: { reservationStatus: "settled" },
    }),
    // Create settlement transaction for actual usage
    db.creditTransaction.create({
      data: {
        userId: reservation.userId,
        type: "settlement",
        amount: actualUsed,
        balanceAfter: balanceAfter,
        action: reservation.action,
        description: reservation.description.replace("[RESERVED]", "[SETTLED]"),
        referenceId: reservation.referenceId,
        referenceType: reservation.referenceType,
        reservationStatus: "settled",
        metadata: { reservationId, actualMinutes, reserved, actualUsed, released: toRelease },
      },
    }),
    // Create release transaction if credits are being returned
    ...(toRelease > 0
      ? [
          db.creditTransaction.create({
            data: {
              userId: reservation.userId,
              type: "release",
              amount: toRelease,
              balanceAfter: balanceAfter,
              action: reservation.action,
              description: `Released ${toRelease} unused reserved credits`,
              referenceId: reservationId,
              referenceType: "reservation",
              reservationStatus: "released",
            },
          }),
        ]
      : []),
    // Update balance
    db.creditBalance.update({
      where: { userId: reservation.userId },
      data: {
        balance: balanceAfter,
        totalUsed: { increment: actualUsed },
      },
    }),
  ]);

  return {
    success: true,
    used: actualUsed,
    released: toRelease,
    balanceAfter,
    settlementTxnId: reservationId,
  };
}

// ── Release Credits (cancel a reservation) ───────────────────────

/**
 * Release all reserved credits back to the balance.
 * Used when a reserved action is cancelled before completion.
 */
export async function releaseCredits(reservationId: string): Promise<{ success: boolean; released: number; balanceAfter: number }> {
  const reservation = await db.creditTransaction.findUnique({ where: { id: reservationId } });
  if (!reservation || reservation.type !== "reservation" || reservation.reservationStatus !== "pending") {
    return { success: false, released: 0, balanceAfter: 0 };
  }

  const balance = await db.creditBalance.findUnique({ where: { userId: reservation.userId } });
  if (!balance) throw new Error("Credit balance not found");

  const balanceAfter = balance.balance + reservation.amount;

  await db.$transaction([
    db.creditTransaction.update({
      where: { id: reservationId },
      data: { reservationStatus: "released" },
    }),
    db.creditTransaction.create({
      data: {
        userId: reservation.userId,
        type: "release",
        amount: reservation.amount,
        balanceAfter,
        action: reservation.action,
        description: `Released ${reservation.amount} reserved credits (action cancelled)`,
        referenceId: reservationId,
        referenceType: "reservation",
        reservationStatus: "released",
      },
    }),
    db.creditBalance.update({
      where: { userId: reservation.userId },
      data: { balance: balanceAfter },
    }),
  ]);

  return { success: true, released: reservation.amount, balanceAfter };
}

// ── Add Credits ──────────────────────────────────────────────────

/**
 * Add credits to a user's balance. Used for:
 * - Monthly allowance reset
 * - Credit pack purchases
 * - Auto-recharge
 * - Promotional credits
 */
export async function addCredits(
  userId: string,
  amount: number,
  action: string,
  description: string,
  gatewayPaymentId?: string,
  referenceId?: string,
  referenceType?: string
): Promise<CreditAddResult> {
  await ensureUserBilling(userId);

  const balance = await db.creditBalance.findUnique({ where: { userId } });
  if (!balance) throw new Error("Credit balance not found");

  const balanceAfter = balance.balance + amount;

  // Determine if this goes to purchasedBalance or regular balance
  const isPurchased = action === "credit_pack" || action === "auto_recharge" || action === "promo";

  const [txn] = await db.$transaction([
    db.creditTransaction.create({
      data: {
        userId,
        type: "credit",
        amount,
        balanceAfter,
        action,
        description,
        gatewayPaymentId,
        referenceId,
        referenceType,
      },
    }),
    db.creditBalance.update({
      where: { userId },
      data: {
        balance: balanceAfter,
        totalReceived: { increment: amount },
        ...(isPurchased ? { purchasedBalance: { increment: amount } } : {}),
      },
    }),
  ]);

  return {
    success: true,
    added: amount,
    balanceAfter,
    transactionId: txn.id,
  };
}

// ── Monthly Credit Reset ─────────────────────────────────────────

/**
 * Reset monthly credits for a user based on their plan.
 * Handles rollover logic: Free = no rollover, Pro/Team = up to 1x monthly allowance.
 */
export async function resetMonthlyCredits(userId: string): Promise<CreditAddResult> {
  const subscription = await db.subscription.findUnique({ where: { userId } });
  const balance = await db.creditBalance.findUnique({ where: { userId } });

  if (!subscription || !balance) {
    return await ensureUserBilling(userId).then(() =>
      resetMonthlyCredits(userId)
    );
  }

  const planSlug = (subscription.plan as PlanSlug) ?? "free";
  const plan = PLANS[planSlug];
  const newAllowance = plan.credits;

  // Calculate rollover
  let rollover = 0;
  if (plan.rollover && plan.maxRollover > 0) {
    // Current balance minus already-purchased credits = remaining allowance credits
    const remainingAllowance = Math.max(0, balance.balance - balance.purchasedBalance);
    rollover = Math.min(remainingAllowance, plan.maxRollover);
  }

  // New balance = rollover + new allowance + purchased credits
  const newBalance = rollover + newAllowance + balance.purchasedBalance;

  await db.$transaction([
    db.creditBalance.update({
      where: { userId },
      data: {
        balance: newBalance,
        monthlyAllowance: newAllowance,
        rolloverBalance: rollover,
        lastMonthlyReset: new Date(),
      },
    }),
    db.creditTransaction.create({
      data: {
        userId,
        type: "credit",
        amount: newAllowance,
        balanceAfter: newBalance,
        action: "monthly_allowance",
        description: `${plan.name} plan monthly allowance — ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}${rollover > 0 ? ` + ${rollover} rollover` : ""}`,
      },
    }),
    // Update subscription period
    db.subscription.update({
      where: { userId },
      data: {
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  return {
    success: true,
    added: newAllowance,
    balanceAfter: newBalance,
    transactionId: `monthly_reset_${Date.now()}`,
  };
}

// ── Auto-Recharge ────────────────────────────────────────────────

/**
 * Trigger auto-recharge for a user who has hit their threshold.
 * Processes payment via the configured gateway and adds credits.
 */
async function triggerAutoRecharge(userId: string): Promise<void> {
  const balance = await db.creditBalance.findUnique({ where: { userId } });
  if (!balance?.autoRecharge) return;

  const rechargeAmount = balance.autoRechargeAmount ?? AUTO_RECHARGE_DEFAULTS.amount;

  try {
    const gateway = getPaymentGateway();
    const result = await gateway.processAutoRecharge(userId, rechargeAmount);

    if (result.success) {
      await addCredits(
        userId,
        rechargeAmount,
        "auto_recharge",
        `Auto-recharge: ${rechargeAmount} credits ($${(rechargeAmount * AUTO_RECHARGE_DEFAULTS.pricePerCredit).toFixed(2)})`,
        result.gatewayPaymentId
      );
    }
  } catch (error) {
    console.error("[Billing] Auto-recharge failed:", error);
  }
}

// ── Update Plan Credits ──────────────────────────────────────────

/**
 * Update credit balance when a user changes plans.
 * Adjusts monthly allowance and grants immediate pro-rated credits.
 */
export async function updatePlanCredits(userId: string, newPlan: PlanSlug): Promise<void> {
  const plan = PLANS[newPlan];
  const balance = await db.creditBalance.findUnique({ where: { userId } });
  if (!balance) return;

  // Calculate the difference in monthly allowance
  const allowanceDiff = plan.credits - balance.monthlyAllowance;

  if (allowanceDiff > 0) {
    // Upgrade: grant the difference immediately
    await addCredits(
      userId,
      allowanceDiff,
      "monthly_allowance",
      `Upgraded to ${plan.name}: ${allowanceDiff} additional credits`
    );
  }

  // Update the monthly allowance field
  await db.creditBalance.update({
    where: { userId },
    data: { monthlyAllowance: plan.credits },
  });
}

// ── Helpers ──────────────────────────────────────────────────────

export async function getCurrentPlan(userId: string): Promise<PlanSlug> {
  const subscription = await db.subscription.findUnique({ where: { userId } });
  return (subscription?.plan as PlanSlug) ?? "free";
}

export async function getCreditBalance(userId: string) {
  await ensureUserBilling(userId);
  return db.creditBalance.findUnique({ where: { userId } });
}

export async function getCreditHistory(
  userId: string,
  options?: { limit?: number; offset?: number; type?: string }
) {
  return db.creditTransaction.findMany({
    where: {
      userId,
      ...(options?.type ? { type: options.type } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}

export async function updateAutoRechargeSettings(
  userId: string,
  settings: {
    autoRecharge?: boolean;
    autoRechargeThreshold?: number;
    autoRechargeAmount?: number;
    autoRechargeMaxMonthly?: number;
  }
) {
  return db.creditBalance.update({
    where: { userId },
    data: settings,
  });
}
