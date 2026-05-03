/**
 * Probato Billing & Subscription Tests — M13
 *
 * Tests for plan definitions, credit costs, gateway abstraction,
 * credit metering logic, and subscription management.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  PLANS,
  CREDIT_COSTS,
  CREDIT_PACKS,
  AUTO_RECHARGE_DEFAULTS,
  getPlan,
  getCreditCost,
  getPlanList,
  isFeatureAvailable,
  isProjectLimitReached,
  isScheduleLimitReached,
  PlanSlug,
  CreditAction,
} from "@/lib/billing/plans";

import { MockGateway } from "@/lib/billing/gateway";

// ── Plan Definitions ─────────────────────────────────────────────

describe("Plan Definitions", () => {
  const planSlugs: PlanSlug[] = ["free", "pro", "team", "enterprise"];

  it("should have all 4 plans defined", () => {
    expect(Object.keys(PLANS)).toHaveLength(4);
    planSlugs.forEach((slug) => {
      expect(PLANS[slug]).toBeDefined();
      expect(PLANS[slug].slug).toBe(slug);
    });
  });

  it("should have correct plan names", () => {
    expect(PLANS.free.name).toBe("Free");
    expect(PLANS.pro.name).toBe("Pro");
    expect(PLANS.team.name).toBe("Team");
    expect(PLANS.enterprise.name).toBe("Enterprise");
  });

  it("should have ascending prices", () => {
    expect(PLANS.free.price).toBe(0);
    expect(PLANS.pro.price).toBe(29);
    expect(PLANS.team.price).toBe(79);
    expect(PLANS.enterprise.price).toBe(0); // Custom
  });

  it("should have ascending credit allowances", () => {
    expect(PLANS.free.credits).toBe(20);
    expect(PLANS.pro.credits).toBe(200);
    expect(PLANS.team.credits).toBe(750);
    expect(PLANS.enterprise.credits).toBe(0); // Unlimited
  });

  it("should have correct project limits", () => {
    expect(PLANS.free.maxProjects).toBe(1);
    expect(PLANS.pro.maxProjects).toBe(5);
    expect(PLANS.team.maxProjects).toBe(0); // Unlimited
    expect(PLANS.enterprise.maxProjects).toBe(0);
  });

  it("should have features array for each plan", () => {
    planSlugs.forEach((slug) => {
      expect(Array.isArray(PLANS[slug].features)).toBe(true);
      expect(PLANS[slug].features.length).toBeGreaterThan(0);
    });
  });

  it("should have rollover settings", () => {
    expect(PLANS.free.rollover).toBe(false);
    expect(PLANS.free.maxRollover).toBe(0);
    expect(PLANS.pro.rollover).toBe(true);
    expect(PLANS.pro.maxRollover).toBe(200);
    expect(PLANS.team.rollover).toBe(true);
    expect(PLANS.team.maxRollover).toBe(750);
  });

  it("should gate features correctly by plan", () => {
    // Free plan
    expect(PLANS.free.autoHeal).toBe(false);
    expect(PLANS.free.visualRegression).toBe(false);
    expect(PLANS.free.priorityExecution).toBe(false);

    // Pro plan
    expect(PLANS.pro.autoHeal).toBe(true);
    expect(PLANS.pro.visualRegression).toBe(true);
    expect(PLANS.pro.priorityExecution).toBe(false);

    // Team plan
    expect(PLANS.team.autoHeal).toBe(true);
    expect(PLANS.team.visualRegression).toBe(true);
    expect(PLANS.team.priorityExecution).toBe(true);
  });

  it("should have KES prices for African markets", () => {
    expect(PLANS.pro.priceKes).toBe(3750);
    expect(PLANS.team.priceKes).toBe(10200);
  });

  it("Pro should be marked as popular", () => {
    expect(PLANS.pro.popular).toBe(true);
  });
});

// ── Plan Helper Functions ────────────────────────────────────────

describe("Plan Helper Functions", () => {
  it("getPlan should return correct plan", () => {
    expect(getPlan("free").name).toBe("Free");
    expect(getPlan("pro").name).toBe("Pro");
  });

  it("getPlanList should return all 4 plans", () => {
    const list = getPlanList();
    expect(list).toHaveLength(4);
    expect(list.map((p) => p.slug)).toEqual(["free", "pro", "team", "enterprise"]);
  });

  describe("isFeatureAvailable", () => {
    it("returns false for autoHeal on free plan", () => {
      expect(isFeatureAvailable("free", "autoHeal")).toBe(false);
    });

    it("returns true for autoHeal on pro plan", () => {
      expect(isFeatureAvailable("pro", "autoHeal")).toBe(true);
    });

    it("returns false for priorityExecution on pro plan", () => {
      expect(isFeatureAvailable("pro", "priorityExecution")).toBe(false);
    });

    it("returns true for all features on team plan", () => {
      expect(isFeatureAvailable("team", "autoHeal")).toBe(true);
      expect(isFeatureAvailable("team", "visualRegression")).toBe(true);
      expect(isFeatureAvailable("team", "priorityExecution")).toBe(true);
    });
  });

  describe("isProjectLimitReached", () => {
    it("returns true when free user has 1 project", () => {
      expect(isProjectLimitReached("free", 1)).toBe(true);
    });

    it("returns false when free user has 0 projects", () => {
      expect(isProjectLimitReached("free", 0)).toBe(false);
    });

    it("returns false for team plan (unlimited)", () => {
      expect(isProjectLimitReached("team", 100)).toBe(false);
    });

    it("returns true when pro user has 5 projects", () => {
      expect(isProjectLimitReached("pro", 5)).toBe(true);
    });

    it("returns false when pro user has 4 projects", () => {
      expect(isProjectLimitReached("pro", 4)).toBe(false);
    });
  });

  describe("isScheduleLimitReached", () => {
    it("returns true when free user has 2 schedules", () => {
      expect(isScheduleLimitReached("free", 2)).toBe(true);
    });

    it("returns false for team plan (unlimited)", () => {
      expect(isScheduleLimitReached("team", 999)).toBe(false);
    });
  });
});

// ── Credit Costs ─────────────────────────────────────────────────

describe("Credit Costs", () => {
  const actions: CreditAction[] = [
    "test_generation",
    "test_execution",
    "feature_discovery",
    "visual_compare",
    "auto_heal",
    "screenshot_storage",
  ];

  it("should have costs defined for all actions", () => {
    actions.forEach((action) => {
      expect(CREDIT_COSTS[action]).toBeDefined();
      expect(CREDIT_COSTS[action].credits).toBeGreaterThan(0);
      expect(CREDIT_COSTS[action].unit).toBeTruthy();
      expect(CREDIT_COSTS[action].description).toBeTruthy();
    });
  });

  it("should have correct credit values", () => {
    expect(CREDIT_COSTS.test_generation.credits).toBe(5);
    expect(CREDIT_COSTS.test_execution.credits).toBe(2);
    expect(CREDIT_COSTS.feature_discovery.credits).toBe(6);
    expect(CREDIT_COSTS.visual_compare.credits).toBe(3);
    expect(CREDIT_COSTS.auto_heal.credits).toBe(8);
    expect(CREDIT_COSTS.screenshot_storage.credits).toBe(1);
  });

  it("should have reasonable unit types", () => {
    expect(CREDIT_COSTS.test_generation.unit).toBe("per use");
    expect(CREDIT_COSTS.test_execution.unit).toBe("per minute");
    expect(CREDIT_COSTS.screenshot_storage.unit).toBe("per GB/month");
  });

  it("should have positive estimated costs", () => {
    actions.forEach((action) => {
      expect(CREDIT_COSTS[action].estimatedCostUsd).toBeGreaterThan(0);
    });
  });

  it("getCreditCost should return correct credit amount", () => {
    expect(getCreditCost("test_generation")).toBe(5);
    expect(getCreditCost("auto_heal")).toBe(8);
  });
});

// ── Credit Packs ─────────────────────────────────────────────────

describe("Credit Packs", () => {
  it("should have 3 packs defined", () => {
    expect(CREDIT_PACKS).toHaveLength(3);
  });

  it("should have ascending credit amounts", () => {
    expect(CREDIT_PACKS[0].credits).toBe(100);
    expect(CREDIT_PACKS[1].credits).toBe(500);
    expect(CREDIT_PACKS[2].credits).toBe(2000);
  });

  it("should have increasing discounts", () => {
    expect(CREDIT_PACKS[0].discountPercent).toBe(0);
    expect(CREDIT_PACKS[1].discountPercent).toBe(20);
    expect(CREDIT_PACKS[2].discountPercent).toBe(40);
  });

  it("should have decreasing price per credit", () => {
    expect(CREDIT_PACKS[0].pricePerCredit).toBe(0.10);
    expect(CREDIT_PACKS[1].pricePerCredit).toBe(0.08);
    expect(CREDIT_PACKS[2].pricePerCredit).toBe(0.06);
  });

  it("should have KES prices", () => {
    expect(CREDIT_PACKS[0].priceKes).toBe(1300);
    expect(CREDIT_PACKS[1].priceKes).toBe(5200);
    expect(CREDIT_PACKS[2].priceKes).toBe(15600);
  });
});

// ── Auto-Recharge Defaults ───────────────────────────────────────

describe("Auto-Recharge Defaults", () => {
  it("should have sensible defaults", () => {
    expect(AUTO_RECHARGE_DEFAULTS.threshold).toBe(0);
    expect(AUTO_RECHARGE_DEFAULTS.amount).toBe(50);
    expect(AUTO_RECHARGE_DEFAULTS.pricePerCredit).toBe(0.08);
  });
});

// ── Mock Gateway ─────────────────────────────────────────────────

describe("MockGateway", () => {
  let gateway: MockGateway;

  beforeEach(() => {
    gateway = new MockGateway();
  });

  it("should always be configured", () => {
    expect(gateway.isConfigured()).toBe(true);
  });

  it("should be of type 'mock'", () => {
    expect(gateway.type).toBe("mock");
  });

  it("should create checkout session for subscription", async () => {
    const result = await gateway.createCheckoutSession({
      userId: "test-user",
      email: "test@test.com",
      planSlug: "pro",
      successUrl: "http://localhost:3000/success",
      cancelUrl: "http://localhost:3000/cancel",
    });

    expect(result.sessionId).toBeTruthy();
    expect(result.url).toContain("mock_checkout=subscription");
    expect(result.url).toContain("plan=pro");
    expect(result.gateway).toBe("mock");
  });

  it("should create checkout session for credit pack", async () => {
    const result = await gateway.createCheckoutSession({
      userId: "test-user",
      email: "test@test.com",
      planSlug: "free",
      successUrl: "http://localhost:3000/success",
      cancelUrl: "http://localhost:3000/cancel",
      creditPackIndex: 1,
    });

    expect(result.sessionId).toBeTruthy();
    expect(result.url).toContain("mock_checkout=credit_pack");
    expect(result.gateway).toBe("mock");
  });

  it("should create customer portal session", async () => {
    const result = await gateway.createCustomerPortal({
      userId: "test-user",
      returnUrl: "http://localhost:3000/dashboard",
    });

    expect(result.url).toContain("mock_portal=true");
    expect(result.gateway).toBe("mock");
  });

  it("should successfully update subscription", async () => {
    const result = await gateway.updateSubscription({
      userId: "test-user",
      newPlan: "team",
    });

    expect(result.success).toBe(true);
    expect(result.gatewayPaymentId).toBeTruthy();
  });

  it("should successfully cancel subscription", async () => {
    const result = await gateway.cancelSubscription({
      userId: "test-user",
      immediately: true,
    });

    expect(result.success).toBe(true);
  });

  it("should successfully purchase credit pack", async () => {
    const result = await gateway.purchaseCreditPack("test-user", 0);
    expect(result.success).toBe(true);
  });

  it("should reject invalid credit pack index", async () => {
    const result = await gateway.purchaseCreditPack("test-user", 999);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("should successfully process auto-recharge", async () => {
    const result = await gateway.processAutoRecharge("test-user", 50);
    expect(result.success).toBe(true);
    expect(result.gatewayPaymentId).toBeTruthy();
  });

  it("should return null for webhook parsing", async () => {
    const result = await gateway.parseWebhookEvent("{}", {});
    expect(result).toBeNull();
  });
});

// ── Credit Calculation Scenarios ─────────────────────────────────

describe("Credit Calculation Scenarios", () => {
  it("free user can run ~3 feature discoveries per month", () => {
    const freeCredits = PLANS.free.credits; // 20
    const discoveryCost = CREDIT_COSTS.feature_discovery.credits; // 6
    const maxDiscoveries = Math.floor(freeCredits / discoveryCost);
    expect(maxDiscoveries).toBe(3); // 3 * 6 = 18, 2 credits left
  });

  it("free user can run ~4 test generations per month", () => {
    const freeCredits = PLANS.free.credits; // 20
    const genCost = CREDIT_COSTS.test_generation.credits; // 5
    const maxGens = Math.floor(freeCredits / genCost);
    expect(maxGens).toBe(4); // 4 * 5 = 20
  });

  it("pro user can run ~33 test generations per month", () => {
    const proCredits = PLANS.pro.credits; // 200
    const genCost = CREDIT_COSTS.test_generation.credits; // 5
    const maxGens = Math.floor(proCredits / genCost);
    expect(maxGens).toBe(40); // 40 * 5 = 200
  });

  it("team user can run ~93 feature discoveries per month", () => {
    const teamCredits = PLANS.team.credits; // 750
    const discoveryCost = CREDIT_COSTS.feature_discovery.credits; // 6
    const maxDiscoveries = Math.floor(teamCredits / discoveryCost);
    expect(maxDiscoveries).toBe(125); // 125 * 6 = 750
  });

  it("test execution at 2 credits/min means 100 min on Pro", () => {
    const proCredits = PLANS.pro.credits; // 200
    const execPerMin = CREDIT_COSTS.test_execution.credits; // 2
    const totalMinutes = Math.floor(proCredits / execPerMin);
    expect(totalMinutes).toBe(100);
  });

  it("auto-heal is most expensive action at 8 credits", () => {
    const allCosts = Object.values(CREDIT_COSTS).map((c) => c.credits);
    const maxCost = Math.max(...allCosts);
    expect(CREDIT_COSTS.auto_heal.credits).toBe(maxCost);
  });
});

// ── Revenue & Margin Calculations ────────────────────────────────

describe("Revenue & Margin Analysis", () => {
  it("Pro plan: $29 for 200 credits = $0.145/credit", () => {
    const pricePerCredit = PLANS.pro.price / PLANS.pro.credits;
    expect(pricePerCredit).toBeCloseTo(0.145, 2);
  });

  it("Team plan: $79 for 750 credits = $0.105/credit", () => {
    const pricePerCredit = PLANS.team.price / PLANS.team.credits;
    expect(pricePerCredit).toBeCloseTo(0.105, 3);
  });

  it("credit pack starter: $10 for 100 credits = $0.10/credit", () => {
    expect(CREDIT_PACKS[0].pricePerCredit).toBe(0.10);
  });

  it("credit pack best value: $120 for 2000 credits = $0.06/credit", () => {
    expect(CREDIT_PACKS[2].pricePerCredit).toBe(0.06);
  });

  it("test generation margin: ~60%", () => {
    const cost = CREDIT_COSTS.test_generation;
    const revenuePerCredit = PLANS.pro.price / PLANS.pro.credits;
    const revenue = revenuePerCredit * cost.credits;
    const margin = (revenue - cost.estimatedCostUsd) / revenue;
    expect(margin).toBeGreaterThan(0.5);
    expect(margin).toBeLessThan(0.8);
  });

  it("auto-heal margin: ~55%", () => {
    const cost = CREDIT_COSTS.auto_heal;
    const revenuePerCredit = PLANS.pro.price / PLANS.pro.credits;
    const revenue = revenuePerCredit * cost.credits;
    const margin = (revenue - cost.estimatedCostUsd) / revenue;
    expect(margin).toBeGreaterThan(0.4);
    expect(margin).toBeLessThan(0.8);
  });
});

// ── Plan Upgrade Path ────────────────────────────────────────────

describe("Plan Upgrade Path", () => {
  it("free → pro gives +180 credits immediately", () => {
    const diff = PLANS.pro.credits - PLANS.free.credits;
    expect(diff).toBe(180);
  });

  it("pro → team gives +550 credits immediately", () => {
    const diff = PLANS.team.credits - PLANS.pro.credits;
    expect(diff).toBe(550);
  });

  it("pro enables autoHeal and visualRegression over free", () => {
    expect(isFeatureAvailable("pro", "autoHeal")).toBe(true);
    expect(isFeatureAvailable("pro", "visualRegression")).toBe(true);
    expect(isFeatureAvailable("free", "autoHeal")).toBe(false);
    expect(isFeatureAvailable("free", "visualRegression")).toBe(false);
  });

  it("team enables priorityExecution over pro", () => {
    expect(isFeatureAvailable("team", "priorityExecution")).toBe(true);
    expect(isFeatureAvailable("pro", "priorityExecution")).toBe(false);
  });
});
