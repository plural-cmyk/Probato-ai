/**
 * Probato Billing Module
 *
 * Central export for all billing-related functionality.
 */

// Plan definitions & costs
export {
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
  type PlanSlug,
  type PlanDefinition,
  type CreditAction,
  type CreditCostDefinition,
  type CreditPackDefinition,
} from "./plans";

// Payment gateway abstraction
export {
  getPaymentGateway,
  resetPaymentGateway,
  MockGateway,
  StripeGateway,
  PaystackGateway,
  type GatewayType,
  type PaymentGateway,
  type CheckoutSessionParams,
  type CheckoutSessionResult,
  type CustomerPortalParams,
  type CustomerPortalResult,
} from "./gateway";

// Credit metering
export {
  ensureUserBilling,
  checkCredits,
  deductCredits,
  reserveCredits,
  settleCredits,
  releaseCredits,
  addCredits,
  resetMonthlyCredits,
  updatePlanCredits,
  getCurrentPlan,
  getCreditBalance,
  getCreditHistory,
  updateAutoRechargeSettings,
  type CreditCheckResult,
  type CreditDeductionResult,
  type CreditReservationResult,
  type CreditSettlementResult,
  type CreditAddResult,
} from "./credits";

// Subscription management
export {
  getSubscriptionInfo,
  activateSubscription,
  changeSubscription,
  cancelSubscription,
  checkFeatureAccess,
  checkProjectLimit,
  checkScheduleLimit,
  getBillingSummary,
  type SubscriptionInfo,
  type SubscriptionChangeResult,
  type PlanAccessCheck,
} from "./subscription";
