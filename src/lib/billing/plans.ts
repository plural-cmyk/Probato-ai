/**
 * Probato Plan Definitions & Credit Cost Table
 *
 * Defines all subscription plans, their included credits,
 * feature limits, and the credit cost for each action.
 */

// ── Plan Definitions ─────────────────────────────────────────────

export type PlanSlug = "free" | "pro" | "team" | "enterprise";

export interface PlanDefinition {
  slug: PlanSlug;
  name: string;
  description: string;
  price: number; // USD per month
  priceKes?: number; // Kenyan Shillings per month (for Paystack)
  credits: number; // Monthly credit allowance
  maxProjects: number; // 0 = unlimited
  maxSchedules: number; // 0 = unlimited
  features: string[];
  rollover: boolean; // Whether unused credits roll over
  maxRollover: number; // Max rollover credits (1x monthly = same as credits)
  autoHeal: boolean;
  visualRegression: boolean;
  priorityExecution: boolean;
  support: string;
  stripePriceId?: string; // Filled when Stripe account is connected
  paystackPlanCode?: string; // Filled when Paystack account is connected
  popular?: boolean;
}

export const PLANS: Record<PlanSlug, PlanDefinition> = {
  free: {
    slug: "free",
    name: "Free",
    description: "Get started with AI-powered testing — no credit card required",
    price: 0,
    priceKes: 0,
    credits: 20,
    maxProjects: 1,
    maxSchedules: 2,
    features: [
      "20 credits/month",
      "1 project",
      "2 scheduled tests",
      "Basic test generation",
      "Basic test execution",
      "Community support",
    ],
    rollover: false,
    maxRollover: 0,
    autoHeal: false,
    visualRegression: false,
    priorityExecution: false,
    support: "community",
  },
  pro: {
    slug: "pro",
    name: "Pro",
    description: "For individual developers who need comprehensive testing",
    price: 29,
    priceKes: 3750,
    credits: 200,
    maxProjects: 5,
    maxSchedules: 20,
    features: [
      "200 credits/month",
      "5 projects",
      "20 scheduled tests",
      "AI test generation",
      "Auto-heal",
      "Visual regression",
      "Email support",
    ],
    rollover: true,
    maxRollover: 200,
    autoHeal: true,
    visualRegression: true,
    priorityExecution: false,
    support: "email",
    popular: true,
  },
  team: {
    slug: "team",
    name: "Team",
    description: "For teams that need unlimited testing and priority support",
    price: 79,
    priceKes: 10200,
    credits: 750,
    maxProjects: 0, // unlimited
    maxSchedules: 0, // unlimited
    features: [
      "750 credits/month",
      "Unlimited projects",
      "Unlimited scheduled tests",
      "AI test generation",
      "Auto-heal",
      "Visual regression",
      "Priority execution",
      "Slack support",
    ],
    rollover: true,
    maxRollover: 750,
    autoHeal: true,
    visualRegression: true,
    priorityExecution: true,
    support: "slack",
  },
  enterprise: {
    slug: "enterprise",
    name: "Enterprise",
    description: "Custom solutions for large organizations with specific needs",
    price: 0, // Custom pricing
    credits: 0, // Unlimited
    maxProjects: 0,
    maxSchedules: 0,
    features: [
      "Unlimited credits",
      "Unlimited projects",
      "Unlimited scheduled tests",
      "AI test generation",
      "Auto-heal",
      "Visual regression",
      "Priority execution",
      "Dedicated support",
      "Custom integrations",
      "SLA guarantee",
    ],
    rollover: true,
    maxRollover: 0,
    autoHeal: true,
    visualRegression: true,
    priorityExecution: true,
    support: "dedicated",
  },
};

// ── Credit Cost Per Action ───────────────────────────────────────

export type CreditAction =
  | "test_generation"
  | "test_execution"
  | "feature_discovery"
  | "visual_compare"
  | "auto_heal"
  | "screenshot_storage";

export interface CreditCostDefinition {
  action: CreditAction;
  credits: number;
  unit: string; // "per use", "per minute", "per GB"
  description: string;
  estimatedCostUsd: number; // Approx cost to us per action
}

export const CREDIT_COSTS: Record<CreditAction, CreditCostDefinition> = {
  test_generation: {
    action: "test_generation",
    credits: 5,
    unit: "per use",
    description: "AI-powered Playwright test generation from discovered features",
    estimatedCostUsd: 0.15,
  },
  test_execution: {
    action: "test_execution",
    credits: 2,
    unit: "per minute",
    description: "Running tests in cloud browser (minimum 1 minute)",
    estimatedCostUsd: 0.06,
  },
  feature_discovery: {
    action: "feature_discovery",
    credits: 6,
    unit: "per use",
    description: "AI-powered feature discovery and page analysis",
    estimatedCostUsd: 0.18,
  },
  visual_compare: {
    action: "visual_compare",
    credits: 3,
    unit: "per use",
    description: "Visual regression comparison with pixel-level diff",
    estimatedCostUsd: 0.10,
  },
  auto_heal: {
    action: "auto_heal",
    credits: 8,
    unit: "per use",
    description: "AI-powered auto-heal for broken test selectors",
    estimatedCostUsd: 0.25,
  },
  screenshot_storage: {
    action: "screenshot_storage",
    credits: 1,
    unit: "per GB/month",
    description: "Screenshot and baseline storage",
    estimatedCostUsd: 0.02,
  },
};

// ── Credit Pack Definitions ──────────────────────────────────────

export interface CreditPackDefinition {
  credits: number;
  priceUsd: number;
  priceKes: number;
  pricePerCredit: number;
  discountPercent: number;
  label: string;
  stripePriceId?: string; // Filled when Stripe account is connected
}

export const CREDIT_PACKS: CreditPackDefinition[] = [
  {
    credits: 100,
    priceUsd: 10,
    priceKes: 1300,
    pricePerCredit: 0.10,
    discountPercent: 0,
    label: "Starter Pack",
  },
  {
    credits: 500,
    priceUsd: 40,
    priceKes: 5200,
    pricePerCredit: 0.08,
    discountPercent: 20,
    label: "Popular Pack",
  },
  {
    credits: 2000,
    priceUsd: 120,
    priceKes: 15600,
    pricePerCredit: 0.06,
    discountPercent: 40,
    label: "Best Value Pack",
  },
];

// ── Auto-Recharge Defaults ───────────────────────────────────────

export const AUTO_RECHARGE_DEFAULTS = {
  threshold: 0, // Trigger when balance hits 0
  amount: 50, // Add 50 credits per recharge
  pricePerCredit: 0.08, // $0.08 per credit for auto-recharge
  maxMonthlySpend: 0, // 0 = no limit (user can set one)
};

// ── Helpers ──────────────────────────────────────────────────────

export function getPlan(slug: PlanSlug): PlanDefinition {
  return PLANS[slug];
}

export function getCreditCost(action: CreditAction): number {
  return CREDIT_COSTS[action]?.credits ?? 0;
}

export function getPlanList(): PlanDefinition[] {
  return Object.values(PLANS);
}

export function isFeatureAvailable(planSlug: PlanSlug, feature: "autoHeal" | "visualRegression" | "priorityExecution"): boolean {
  const plan = PLANS[planSlug];
  if (!plan) return false;
  return plan[feature] === true;
}

export function isProjectLimitReached(planSlug: PlanSlug, currentProjectCount: number): boolean {
  const plan = PLANS[planSlug];
  if (!plan) return true;
  if (plan.maxProjects === 0) return false; // unlimited
  return currentProjectCount >= plan.maxProjects;
}

export function isScheduleLimitReached(planSlug: PlanSlug, currentScheduleCount: number): boolean {
  const plan = PLANS[planSlug];
  if (!plan) return true;
  if (plan.maxSchedules === 0) return false; // unlimited
  return currentScheduleCount >= plan.maxSchedules;
}
