"use client";

/**
 * PaymentFlowTestPanel — M28 Payment Flow Testing
 *
 * Features:
 * - Run payment tests with configurable scenarios and selectors
 * - Checkout flow pipeline visualization (Cart → Shipping → Payment → Confirmation)
 * - Overall metrics display (reliability, completion rate, webhook latency)
 * - Scenario cards with test card details and pass/fail indicators
 * - Past session history table
 */

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CreditCard,
  ShoppingCart,
  Truck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Globe,
  Zap,
  ChevronDown,
  RefreshCw,
  Settings2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────

type StepStatus = "passed" | "failed" | "warning" | "skipped" | "pending";

interface CheckoutStep {
  name: string;
  status: StepStatus;
  error?: string;
  testCard?: string;
  latencyMs?: number;
}

interface ScenarioResult {
  scenario: string;
  testCard: string;
  expectedOutcome: string;
  actualOutcome: string;
  passed: boolean;
  screenshotUrl?: string;
  latencyMs: number;
}

interface PaymentTestResult {
  id: string;
  status: string;
  url: string;
  scenario: string;
  overallScore: number;
  checkoutCompletionRate: number;
  webhookDeliveryLatencyAvg: number;
  webhookDeliveryLatencyP95: number;
  checkoutSteps: CheckoutStep[];
  scenarios: ScenarioResult[];
  findings: { type: string; severity: string; title: string; description: string }[];
  recommendations: string[];
  summary?: string;
  llmUsed: boolean;
  duration: number;
  createdAt: string;
}

interface PaymentTestPanelProps {
  projectId: string;
  url?: string;
}

// ── Helpers ────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#eab308";
  if (score >= 25) return "#f97316";
  return "#ef4444";
}

function getStepStatusColor(status: StepStatus): string {
  switch (status) {
    case "passed":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    case "warning":
    case "skipped":
      return "bg-yellow-500";
    case "pending":
    default:
      return "bg-gray-300";
  }
}

function getStepBorderColor(status: StepStatus): string {
  switch (status) {
    case "passed":
      return "border-green-500";
    case "failed":
      return "border-red-500";
    case "warning":
    case "skipped":
      return "border-yellow-500";
    case "pending":
    default:
      return "border-gray-300";
  }
}

function getStepTextColor(status: StepStatus): string {
  switch (status) {
    case "passed":
      return "text-green-700";
    case "failed":
      return "text-red-700";
    case "warning":
    case "skipped":
      return "text-yellow-700";
    case "pending":
    default:
      return "text-gray-500";
  }
}

function getStepIcon(status: StepStatus) {
  switch (status) {
    case "passed":
      return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-600" />;
    case "warning":
    case "skipped":
      return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    case "pending":
    default:
      return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
  }
}

function formatCardNumber(card: string): string {
  if (!card) return "••••";
  const cleaned = card.replace(/\s/g, "");
  if (cleaned.length <= 4) return cleaned;
  return "•••• •••• •••• " + cleaned.slice(-4);
}

function getScenarioLabel(scenario: string): string {
  const labels: Record<string, string> = {
    successful_payment: "Successful Payment",
    declined_card: "Declined Card",
    insufficient_funds: "Insufficient Funds",
    "3ds_authentication": "3DS Authentication",
    processing_error: "Processing Error",
    webhook_verification: "Webhook Verification",
    multi_currency: "Multi-Currency",
  };
  return labels[scenario] || scenario.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getScenarioBadgeColor(scenario: string): string {
  switch (scenario) {
    case "successful_payment":
      return "bg-green-100 text-green-700";
    case "declined_card":
    case "insufficient_funds":
    case "processing_error":
      return "bg-red-100 text-red-700";
    case "3ds_authentication":
      return "bg-purple-100 text-purple-700";
    case "webhook_verification":
      return "bg-blue-100 text-blue-700";
    case "multi_currency":
      return "bg-orange-100 text-orange-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

// ── Sub-Components ─────────────────────────────────────────────

function ScoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{score}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function PipelineStep({
  step,
  icon,
  isLast,
  isExpanded,
  onToggle,
}: {
  step: CheckoutStep;
  icon: React.ReactNode;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start">
      {/* Step node */}
      <div className="flex flex-col items-center">
        <button
          onClick={step.status === "failed" ? onToggle : undefined}
          className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors ${getStepBorderColor(step.status)} ${step.status === "failed" ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
        >
          <span className={getStepTextColor(step.status)}>{icon}</span>
        </button>
        <span className={`text-[10px] mt-1 font-medium ${getStepTextColor(step.status)}`}>
          {step.name}
        </span>
        {step.latencyMs !== undefined && step.status === "passed" && (
          <span className="text-[9px] text-gray-400">{step.latencyMs}ms</span>
        )}
      </div>

      {/* Connector line */}
      {!isLast && (
        <div className="flex items-center h-10 px-1">
          <div className={`w-8 h-0.5 ${getStepStatusColor(step.status === "passed" ? "passed" : "pending")}`} />
        </div>
      )}

      {/* Expanded error detail for failed steps */}
      {step.status === "failed" && isExpanded && (
        <div className="ml-2 mt-8 border border-red-200 bg-red-50 rounded-lg p-2 text-xs space-y-1 min-w-[200px]">
          <div className="flex items-center gap-1 text-red-700 font-medium">
            <XCircle className="w-3 h-3" />
            <span>Error Details</span>
          </div>
          {step.error && <p className="text-red-600">{step.error}</p>}
          {step.testCard && (
            <div className="flex items-center gap-1 text-gray-600">
              <CreditCard className="w-3 h-3" />
              <span>Card: {formatCardNumber(step.testCard)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: ScenarioResult }) {
  return (
    <div className={`border rounded-lg p-3 space-y-2 transition-colors ${
      scenario.passed ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {scenario.passed ? (
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          ) : (
            <XCircle className="w-4 h-4 text-red-600" />
          )}
          <Badge variant="outline" className={`text-[10px] ${getScenarioBadgeColor(scenario.scenario)}`}>
            {getScenarioLabel(scenario.scenario)}
          </Badge>
        </div>
        <span className="text-[10px] text-gray-400">{scenario.latencyMs}ms</span>
      </div>

      <div className="flex items-center gap-1.5">
        <CreditCard className="w-3 h-3 text-gray-400" />
        <span className="text-xs font-mono text-gray-600">{formatCardNumber(scenario.testCard)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <span className="text-gray-400">Expected:</span>
          <p className="text-gray-700">{scenario.expectedOutcome}</p>
        </div>
        <div>
          <span className="text-gray-400">Actual:</span>
          <p className={scenario.passed ? "text-green-700" : "text-red-700"}>{scenario.actualOutcome}</p>
        </div>
      </div>

      {scenario.screenshotUrl && (
        <div className="pt-1">
          <a
            href={scenario.screenshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-500 hover:underline flex items-center gap-1"
          >
            <Globe className="w-3 h-3" />
            View Screenshot
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function PaymentFlowTestPanel({ projectId, url }: PaymentTestPanelProps) {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [targetUrl, setTargetUrl] = useState(url ?? "");
  const [selectedScenario, setSelectedScenario] = useState("successful_payment");
  const [results, setResults] = useState<PaymentTestResult[]>([]);
  const [currentResult, setCurrentResult] = useState<PaymentTestResult | null>(null);
  const [showCustomSelectors, setShowCustomSelectors] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  // Custom selector inputs
  const [addToCartSelector, setAddToCartSelector] = useState("");
  const [checkoutSelector, setCheckoutSelector] = useState("");
  const [shippingSelector, setShippingSelector] = useState("");
  const [paymentSelector, setPaymentSelector] = useState("");
  const [submitSelector, setSubmitSelector] = useState("");
  const [confirmationSelector, setConfirmationSelector] = useState("");

  useEffect(() => {
    if (url) setTargetUrl(url);
  }, [url]);

  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/orchestrator/payment?projectId=${projectId}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
        if (data.results?.length > 0 && !currentResult) {
          loadResultDetail(data.results[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load payment test results:", err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadResultDetail = async (resultId: string) => {
    try {
      const res = await fetch(`/api/orchestrator/payment/${resultId}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentResult(data);
      }
    } catch (err) {
      console.error("Failed to load payment test detail:", err);
    }
  };

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const handleRunTest = async () => {
    if (!targetUrl) return;
    setRunning(true);
    try {
      const res = await fetch("/api/orchestrator/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          url: targetUrl,
          scenario: selectedScenario,
          addToCartSelector: addToCartSelector || undefined,
          checkoutSelector: checkoutSelector || undefined,
          shippingSelector: shippingSelector || undefined,
          paymentSelector: paymentSelector || undefined,
          submitSelector: submitSelector || undefined,
          confirmationSelector: confirmationSelector || undefined,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        await loadResults();
        if (result.id) {
          await loadResultDetail(result.id);
        }
      } else {
        const err = await res.json();
        console.error("Payment test failed:", err.error);
      }
    } catch (err) {
      console.error("Failed to run payment test:", err);
    } finally {
      setRunning(false);
    }
  };

  const stepIcons: Record<string, React.ReactNode> = {
    Cart: <ShoppingCart className="w-4 h-4" />,
    Shipping: <Truck className="w-4 h-4" />,
    Payment: <CreditCard className="w-4 h-4" />,
    Confirmation: <CheckCircle2 className="w-4 h-4" />,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <CardTitle className="text-lg">Payment Flow Test</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={loadResults} disabled={loading}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <CardDescription>Test checkout flows, payment processing, and webhook delivery</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Run Payment Test Form */}
        <div className="space-y-2">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Target URL</label>
              <Input
                placeholder="https://shop.example.com/checkout"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-48">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Scenario</label>
              <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select scenario" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="successful_payment">Successful Payment</SelectItem>
                  <SelectItem value="declined_card">Declined Card</SelectItem>
                  <SelectItem value="insufficient_funds">Insufficient Funds</SelectItem>
                  <SelectItem value="3ds_authentication">3DS Authentication</SelectItem>
                  <SelectItem value="processing_error">Processing Error</SelectItem>
                  <SelectItem value="webhook_verification">Webhook Verification</SelectItem>
                  <SelectItem value="multi_currency">Multi-Currency</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setShowCustomSelectors(!showCustomSelectors)}
            >
              <Settings2 className="w-4 h-4" />
            </Button>
            <Button onClick={handleRunTest} disabled={running || !targetUrl} size="sm" className="h-9">
              {running ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Zap className="w-4 h-4 mr-1" />}
              {running ? "Testing..." : "Run Payment Test"}
            </Button>
          </div>

          {/* Custom Selectors (expandable) */}
          <Collapsible open={showCustomSelectors} onOpenChange={setShowCustomSelectors}>
            <CollapsibleContent>
              <div className="border rounded-lg p-3 space-y-2 bg-gray-50 mt-2">
                <p className="text-xs font-medium text-gray-500">Custom Selectors (optional)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">Add to Cart</label>
                    <Input
                      placeholder="button.add-to-cart"
                      value={addToCartSelector}
                      onChange={(e) => setAddToCartSelector(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">Checkout</label>
                    <Input
                      placeholder=".checkout-btn"
                      value={checkoutSelector}
                      onChange={(e) => setCheckoutSelector(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">Shipping</label>
                    <Input
                      placeholder=".shipping-form"
                      value={shippingSelector}
                      onChange={(e) => setShippingSelector(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">Payment</label>
                    <Input
                      placeholder=".payment-form"
                      value={paymentSelector}
                      onChange={(e) => setPaymentSelector(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">Submit</label>
                    <Input
                      placeholder="button.pay-now"
                      value={submitSelector}
                      onChange={(e) => setSubmitSelector(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">Confirmation</label>
                    <Input
                      placeholder=".order-confirmation"
                      value={confirmationSelector}
                      onChange={(e) => setConfirmationSelector(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Current Result Detail */}
        {currentResult && (
          <div className="border rounded-lg p-4 space-y-4">
            {/* Checkout Flow Pipeline */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1">
                <ShoppingCart className="w-3.5 h-3.5" /> Checkout Flow Pipeline
              </h4>
              <div className="flex items-start overflow-x-auto pb-2">
                {currentResult.checkoutSteps.map((step, i) => (
                  <PipelineStep
                    key={step.name}
                    step={step}
                    icon={stepIcons[step.name] || <div className="w-4 h-4" />}
                    isLast={i === currentResult.checkoutSteps.length - 1}
                    isExpanded={expandedStep === step.name}
                    onToggle={() =>
                      setExpandedStep(expandedStep === step.name ? null : step.name)
                    }
                  />
                ))}
              </div>
            </div>

            <Separator />

            {/* Overall Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="border-0 shadow-none bg-gray-50">
                <CardContent className="p-3 text-center space-y-1">
                  <div
                    className="text-2xl font-bold"
                    style={{ color: getScoreColor(currentResult.overallScore) }}
                  >
                    {currentResult.overallScore}
                  </div>
                  <p className="text-xs text-gray-500">Payment Reliability</p>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${currentResult.overallScore}%`,
                        backgroundColor: getScoreColor(currentResult.overallScore),
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-none bg-gray-50">
                <CardContent className="p-3 text-center space-y-1">
                  <div
                    className="text-2xl font-bold"
                    style={{ color: getScoreColor(currentResult.checkoutCompletionRate) }}
                  >
                    {currentResult.checkoutCompletionRate}%
                  </div>
                  <p className="text-xs text-gray-500">Checkout Completion</p>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${currentResult.checkoutCompletionRate}%`,
                        backgroundColor: getScoreColor(currentResult.checkoutCompletionRate),
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-none bg-gray-50">
                <CardContent className="p-3 text-center space-y-1">
                  <div className="text-2xl font-bold text-gray-800">
                    {currentResult.webhookDeliveryLatencyAvg > 0
                      ? `${currentResult.webhookDeliveryLatencyAvg}`
                      : "—"}
                    <span className="text-sm font-normal text-gray-400">ms</span>
                  </div>
                  <p className="text-xs text-gray-500">Webhook Latency (avg)</p>
                  {currentResult.webhookDeliveryLatencyP95 > 0 && (
                    <p className="text-[10px] text-gray-400">
                      p95: {currentResult.webhookDeliveryLatencyP95}ms
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Status and meta row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="text-xl font-bold"
                  style={{ color: getScoreColor(currentResult.overallScore) }}
                >
                  {currentResult.overallScore}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        currentResult.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {currentResult.status}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${getScenarioBadgeColor(currentResult.scenario)}`}>
                      {getScenarioLabel(currentResult.scenario)}
                    </Badge>
                    {currentResult.llmUsed && (
                      <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700">
                        AI
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {currentResult.duration > 0 && `${(currentResult.duration / 1000).toFixed(1)}s`}
                    {currentResult.webhookDeliveryLatencyAvg > 0 &&
                      ` • ${currentResult.webhookDeliveryLatencyAvg}ms webhook avg`}
                  </p>
                </div>
              </div>
            </div>

            {/* Summary */}
            {currentResult.summary && (
              <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{currentResult.summary}</p>
            )}

            {/* Scenario Cards */}
            {currentResult.scenarios && currentResult.scenarios.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" /> Test Scenarios
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {currentResult.scenarios.map((scenario, i) => (
                    <ScenarioCard key={i} scenario={scenario} />
                  ))}
                </div>
              </div>
            )}

            {/* Findings */}
            {currentResult.findings && currentResult.findings.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Findings ({currentResult.findings.length})</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {currentResult.findings.slice(0, 10).map((f, i) => (
                    <div key={i} className="border rounded p-2 text-xs">
                      <div className="flex items-center gap-1">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            f.severity === "high"
                              ? "bg-orange-100 text-orange-700"
                              : f.severity === "medium"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {f.severity}
                        </Badge>
                        <span className="font-medium">{f.title}</span>
                      </div>
                      <p className="text-gray-500 mt-0.5">{f.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {currentResult.recommendations && currentResult.recommendations.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Recommendations</h4>
                <ul className="space-y-0.5">
                  {currentResult.recommendations.map((rec, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                      <span className="text-emerald-500 mt-0.5">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <Separator />

        {/* Results Table */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Past Test Sessions</h4>
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No payment tests yet</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {results.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-50 transition-colors ${
                    currentResult?.id === r.id ? "bg-emerald-50 border border-emerald-200" : "border"
                  }`}
                  onClick={() => loadResultDetail(r.id)}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border"
                      style={{
                        borderColor: getScoreColor(r.overallScore),
                        color: getScoreColor(r.overallScore),
                      }}
                    >
                      {r.overallScore}
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        <span className="text-xs font-medium">Payment Test</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            r.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {r.status}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${getScenarioBadgeColor(r.scenario)}`}>
                          {getScenarioLabel(r.scenario)}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-gray-400">
                        {new Date(r.createdAt).toLocaleDateString()} • Score: {r.overallScore}/100
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
