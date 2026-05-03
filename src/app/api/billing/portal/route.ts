import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPaymentGateway } from "@/lib/billing/gateway";
import { ensureUserBilling } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

// ── POST /api/billing/portal ─ Create customer portal session ────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    await ensureUserBilling(userId);

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const gateway = getPaymentGateway();

    const result = await gateway.createCustomerPortal({
      userId,
      returnUrl: `${baseUrl}/dashboard`,
    });

    return NextResponse.json({ url: result.url, gateway: result.gateway });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Billing Portal] Failed:", message);
    return NextResponse.json({ error: "Failed to open billing portal", details: message }, { status: 500 });
  }
}
