import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPlanList, CREDIT_PACKS, PlanSlug, PLANS } from "@/lib/billing/plans";
import { ensureUserBilling, getCreditBalance, getBillingSummary } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

// ── GET /api/billing ─ Get billing summary & plans ───────────────

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    await ensureUserBilling(userId);

    const [summary, balance] = await Promise.all([
      getBillingSummary(userId),
      getCreditBalance(userId),
    ]);

    return NextResponse.json({
      plans: getPlanList(),
      creditCosts: Object.values(PLANS.free).length > 0
        ? Object.fromEntries(
            Object.entries(
              (await import("@/lib/billing/plans")).CREDIT_COSTS
            ).map(([key, val]) => [key, { credits: val.credits, unit: val.unit, description: val.description }])
          )
        : {},
      creditPacks: CREDIT_PACKS,
      currentPlan: summary.plan,
      subscription: summary.subscription,
      credits: summary.credits,
      recentTransactions: summary.recentTransactions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Billing] GET failed:", message);
    return NextResponse.json({ error: "Failed to load billing info", details: message }, { status: 500 });
  }
}
