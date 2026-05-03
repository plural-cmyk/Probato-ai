import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CreditAction, CREDIT_COSTS, CREDIT_PACKS } from "@/lib/billing/plans";
import {
  ensureUserBilling,
  checkCredits,
  deductCredits,
  reserveCredits,
  settleCredits,
  releaseCredits,
  addCredits,
  getCreditBalance,
  getCreditHistory,
  updateAutoRechargeSettings,
} from "@/lib/billing/credits";
import { getPaymentGateway } from "@/lib/billing/gateway";

export const dynamic = "force-dynamic";

// ── GET /api/billing/credits ─ Get credit balance & history ──────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    await ensureUserBilling(userId);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "20");
    const offset = parseInt(searchParams.get("offset") ?? "0");
    const type = searchParams.get("type") ?? undefined;

    const [balance, history] = await Promise.all([
      getCreditBalance(userId),
      getCreditHistory(userId, { limit, offset, type }),
    ]);

    return NextResponse.json({
      balance: balance?.balance ?? 0,
      monthlyAllowance: balance?.monthlyAllowance ?? 20,
      rolloverBalance: balance?.rolloverBalance ?? 0,
      purchasedBalance: balance?.purchasedBalance ?? 0,
      totalUsed: balance?.totalUsed ?? 0,
      totalReceived: balance?.totalReceived ?? 0,
      autoRecharge: balance?.autoRecharge ?? false,
      autoRechargeThreshold: balance?.autoRechargeThreshold ?? 0,
      autoRechargeAmount: balance?.autoRechargeAmount ?? 50,
      history,
      creditCosts: Object.fromEntries(
        Object.entries(CREDIT_COSTS).map(([key, val]) => [key, { credits: val.credits, unit: val.unit, description: val.description }])
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Billing Credits] GET failed:", message);
    return NextResponse.json({ error: "Failed to get credits", details: message }, { status: 500 });
  }
}

// ── POST /api/billing/credits ─ Credit operations ────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    await ensureUserBilling(userId);

    const body = await request.json();
    const { operation } = body;

    switch (operation) {
      case "check": {
        const { action, quantity } = body;
        if (!action) return NextResponse.json({ error: "action is required" }, { status: 400 });
        const result = await checkCredits(userId, action as CreditAction, quantity ?? 1);
        return NextResponse.json(result);
      }

      case "deduct": {
        const { action, description, referenceId, referenceType, quantity } = body;
        if (!action || !description) {
          return NextResponse.json({ error: "action and description are required" }, { status: 400 });
        }
        const result = await deductCredits(
          userId,
          action as CreditAction,
          description,
          referenceId,
          referenceType,
          quantity ?? 1
        );
        if (!result.success) {
          return NextResponse.json({ error: "Insufficient credits", ...result }, { status: 402 });
        }
        return NextResponse.json(result);
      }

      case "reserve": {
        const { action, estimatedMinutes, description, referenceId, referenceType } = body;
        if (!action || !estimatedMinutes || !description) {
          return NextResponse.json({ error: "action, estimatedMinutes, and description are required" }, { status: 400 });
        }
        const result = await reserveCredits(
          userId,
          action as CreditAction,
          estimatedMinutes,
          description,
          referenceId,
          referenceType
        );
        if (!result.success) {
          return NextResponse.json({ error: "Insufficient credits for reservation", ...result }, { status: 402 });
        }
        return NextResponse.json(result);
      }

      case "settle": {
        const { reservationId, actualMinutes, action } = body;
        if (!reservationId || !actualMinutes || !action) {
          return NextResponse.json({ error: "reservationId, actualMinutes, and action are required" }, { status: 400 });
        }
        const result = await settleCredits(reservationId, actualMinutes, action as CreditAction);
        return NextResponse.json(result);
      }

      case "release": {
        const { reservationId } = body;
        if (!reservationId) return NextResponse.json({ error: "reservationId is required" }, { status: 400 });
        const result = await releaseCredits(reservationId);
        return NextResponse.json(result);
      }

      case "purchase_pack": {
        const { packIndex } = body;
        if (packIndex === undefined || packIndex < 0 || packIndex >= CREDIT_PACKS.length) {
          return NextResponse.json({ error: "Invalid pack index" }, { status: 400 });
        }

        const pack = CREDIT_PACKS[packIndex];
        const gateway = getPaymentGateway();

        // For mock gateway, directly add credits
        if (gateway.type === "mock") {
          const result = await addCredits(
            userId,
            pack.credits,
            "credit_pack",
            `Purchased ${pack.label}: ${pack.credits} credits ($${pack.priceUsd})`,
            `mock_pack_${Date.now()}`
          );
          return NextResponse.json({ success: true, ...result, pack });
        }

        // For real gateways, use checkout flow
        return NextResponse.json({
          success: false,
          message: "Use /api/billing/checkout with creditPackIndex for real gateway purchases",
        }, { status: 400 });
      }

      case "update_auto_recharge": {
        const { autoRecharge, autoRechargeThreshold, autoRechargeAmount, autoRechargeMaxMonthly } = body;
        const result = await updateAutoRechargeSettings(userId, {
          autoRecharge,
          autoRechargeThreshold,
          autoRechargeAmount,
          autoRechargeMaxMonthly,
        });
        return NextResponse.json({ success: true, autoRecharge: result.autoRecharge });
      }

      default:
        return NextResponse.json({
          error: "Invalid operation. Use: check, deduct, reserve, settle, release, purchase_pack, update_auto_recharge",
        }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Billing Credits] POST failed:", message);
    return NextResponse.json({ error: "Credit operation failed", details: message }, { status: 500 });
  }
}
