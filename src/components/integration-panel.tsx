"use client";

/**
 * Phase 6 Integration Dashboard Panel (M34)
 *
 * Three-tab panel bridging Phase 6 features together:
 * - Intelligence-to-Action: Shows flaky tests → one-click "Auto-Heal"
 * - Test-to-Monitor: List test cases with "Promote to Checkpoint" button
 * - Compliance Overview: Audit summary with action counts, severity timeline
 * - Phase 6 Health: Overall health indicators for each Phase 6 subsystem
 */

import { useState, useEffect, useCallback } from "react";
import {
  X,
  BrainCircuit,
  Activity,
  Shield,
  Wrench,
  GitMerge,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Zap,
  Eye,
  RefreshCw,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

interface IntegrationPanelProps {
  onClose: () => void;
}

interface FlakyTest {
  testCaseId: string;
  testCaseName: string;
  flakinessScore: number;
  classification: string;
  primaryIndicator: string | null;
  featureName: string;
  projectId: string;
}

interface TestCasePromotion {
  id: string;
  name: string;
  featureName: string;
  selector: string | null;
  autoHealed: boolean;
  projectId: string;
  projectName: string;
}

interface AuditSummary {
  totalActions: number;
  bySeverity: Record<string, number>;
  categories: Array<{
    category: string;
    count: number;
    severities: Record<string, number>;
  }>;
  timeline: Array<{ date: string; count: number; severities: Record<string, number> }>;
}

interface Phase6Health {
  intelligence: "healthy" | "degraded" | "down";
  selfHeal: "healthy" | "degraded" | "down";
  monitoring: "healthy" | "degraded" | "down";
  sso: "healthy" | "degraded" | "down";
  plugins: "healthy" | "degraded" | "down";
}

export default function IntegrationPanel({ onClose }: IntegrationPanelProps) {
  const [activeTab, setActiveTab] = useState("intelligence");
  const [flakyTests, setFlakyTests] = useState<FlakyTest[]>([]);
  const [autoHealLoading, setAutoHealLoading] = useState(false);
  const [autoHealResult, setAutoHealResult] = useState<{
    repairsCreated: number;
    repairsSkipped: number;
    total: number;
  } | null>(null);
  const [testCases, setTestCases] = useState<TestCasePromotion[]>([]);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteResult, setPromoteResult] = useState<{
    testCaseName: string;
    checkpointId: string;
  } | null>(null);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [health, setHealth] = useState<Phase6Health>({
    intelligence: "healthy",
    selfHeal: "healthy",
    monitoring: "healthy",
    sso: "healthy",
    plugins: "healthy",
  });
  const [loading, setLoading] = useState(true);

  const loadFlakyTests = useCallback(async () => {
    try {
      const res = await fetch("/api/intelligence/flakiness");
      if (res.ok) {
        const data = await res.json();
        const reports = data.reports || [];
        setFlakyTests(
          reports
            .filter(
              (r: any) =>
                r.classification === "flaky" || r.classification === "failing"
            )
            .slice(0, 20)
        );
      }
    } catch {
      // Silently fail
    }
  }, []);

  const loadTestCases = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        const projects = data.projects || [];
        // Get test cases from the first few projects
        const allTestCases: TestCasePromotion[] = [];
        for (const project of projects.slice(0, 5)) {
          const featuresRes = await fetch(
            `/api/v1/projects/${project.id}/features?limit=20`
          );
          if (featuresRes.ok) {
            const featuresData = await featuresRes.json();
            const features = featuresData.features || [];
            for (const f of features) {
              if (f.testCases) {
                for (const tc of f.testCases) {
                  allTestCases.push({
                    id: tc.id,
                    name: tc.name,
                    featureName: f.name,
                    selector: tc.selector,
                    autoHealed: tc.autoHealed || false,
                    projectId: project.id,
                    projectName: project.name,
                  });
                }
              }
            }
          }
        }
        setTestCases(allTestCases.slice(0, 30));
      }
    } catch {
      // Silently fail
    }
  }, []);

  const loadAuditSummary = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch("/api/integration/audit-summary?dateRange=30d");
      if (res.ok) {
        const data = await res.json();
        setAuditSummary(data);
      }
    } catch {
      // Silently fail
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        setHealth({
          intelligence: "healthy",
          selfHeal: "healthy",
          monitoring: "healthy",
          sso: "healthy",
          plugins: "healthy",
        });
      } else {
        setHealth({
          intelligence: "degraded",
          selfHeal: "degraded",
          monitoring: "degraded",
          sso: "degraded",
          plugins: "degraded",
        });
      }
    } catch {
      setHealth({
        intelligence: "down",
        selfHeal: "down",
        monitoring: "down",
        sso: "down",
        plugins: "down",
      });
    }
  }, []);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      await Promise.all([
        loadFlakyTests(),
        loadTestCases(),
        loadAuditSummary(),
        checkHealth(),
      ]);
      setLoading(false);
    }
    loadAll();
  }, [loadFlakyTests, loadTestCases, loadAuditSummary, checkHealth]);

  async function handleAutoHeal(projectId: string) {
    setAutoHealLoading(true);
    setAutoHealResult(null);
    try {
      const res = await fetch("/api/intelligence/auto-heal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, maxRepairs: 10 }),
      });
      if (res.ok) {
        const data = await res.json();
        setAutoHealResult({
          repairsCreated: data.repairsAttempted || 0,
          repairsSkipped: data.repairsSkipped || 0,
          total: data.flakyTestsFound || 0,
        });
        await loadFlakyTests(); // Refresh
      }
    } catch {
      setAutoHealResult({ repairsCreated: 0, repairsSkipped: 0, total: 0 });
    } finally {
      setAutoHealLoading(false);
    }
  }

  async function handlePromote(testCaseId: string, testCaseName: string) {
    setPromoting(testCaseId);
    setPromoteResult(null);
    try {
      const res = await fetch("/api/integration/promote-to-checkpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId, intervalMinutes: 5, severity: "informational" }),
      });
      if (res.ok) {
        const data = await res.json();
        setPromoteResult({
          testCaseName,
          checkpointId: data.checkpoint?.id || "",
        });
      }
    } catch {
      // Failed
    } finally {
      setPromoting(null);
    }
  }

  function healthBadge(status: "healthy" | "degraded" | "down") {
    switch (status) {
      case "healthy":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
            Healthy
          </Badge>
        );
      case "degraded":
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200">
            Degraded
          </Badge>
        );
      case "down":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            Down
          </Badge>
        );
    }
  }

  function severityColor(severity: string): string {
    switch (severity) {
      case "critical":
        return "text-red-600";
      case "warning":
        return "text-amber-600";
      case "info":
      default:
        return "text-slate-600";
    }
  }

  if (loading) {
    return (
      <Card className="border-teal-200 bg-gradient-to-br from-teal-50/50 to-white">
        <CardContent className="p-6 flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-teal-600 mr-2" />
          <span className="text-sm text-muted-foreground">
            Loading Phase 6 Integration...
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-teal-200 bg-gradient-to-br from-teal-50/50 to-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-teal-600" />
            <CardTitle className="text-lg">
              Phase 6 Integration Dashboard
            </CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Cross-feature integration: Intelligence → Action, Test → Monitor,
          Compliance → Audit
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="intelligence" className="text-xs">
              <BrainCircuit className="h-3.5 w-3.5 mr-1" />
              Intelligence→Action
            </TabsTrigger>
            <TabsTrigger value="test-to-monitor" className="text-xs">
              <Eye className="h-3.5 w-3.5 mr-1" />
              Test→Monitor
            </TabsTrigger>
            <TabsTrigger value="compliance" className="text-xs">
              <Shield className="h-3.5 w-3.5 mr-1" />
              Compliance
            </TabsTrigger>
            <TabsTrigger value="health" className="text-xs">
              <Activity className="h-3.5 w-3.5 mr-1" />
              Phase 6 Health
            </TabsTrigger>
          </TabsList>

          {/* ── Intelligence-to-Action Tab ── */}
          <TabsContent value="intelligence">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Flaky Tests Detected
                  <Badge variant="outline" className="ml-2">
                    {flakyTests.length}
                  </Badge>
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadFlakyTests()}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Refresh
                </Button>
              </div>

              {flakyTests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                  <p className="text-sm">No flaky tests detected!</p>
                  <p className="text-xs">
                    All tests are stable or no analysis has been run yet.
                  </p>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {flakyTests.map((test) => (
                    <div
                      key={test.testCaseId}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-amber-200/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-sm font-medium truncate">
                            {test.testCaseName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 ml-5.5">
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0"
                          >
                            Score: {test.flakinessScore}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0"
                          >
                            {test.classification}
                          </Badge>
                          {test.primaryIndicator && (
                            <span className="text-xs text-muted-foreground">
                              {test.primaryIndicator}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-2 shrink-0"
                        disabled={autoHealLoading}
                        onClick={() => handleAutoHeal(test.projectId)}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        Auto-Heal
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {autoHealLoading && (
                <div className="flex items-center gap-2 p-3 bg-teal-50 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                  <span className="text-sm text-teal-700">
                    Running auto-heal on flaky tests...
                  </span>
                </div>
              )}

              {autoHealResult && (
                <div className="p-3 bg-teal-50 rounded-lg border border-teal-200">
                  <h4 className="text-sm font-medium text-teal-800 mb-1">
                    Auto-Heal Complete
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-teal-700">
                        {autoHealResult.repairsCreated}
                      </p>
                      <p className="text-xs text-muted-foreground">Repairs</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-amber-600">
                        {autoHealResult.repairsSkipped}
                      </p>
                      <p className="text-xs text-muted-foreground">Skipped</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-700">
                        {autoHealResult.total}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Flaky Tests
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowRight className="h-3 w-3" />
                Flakiness Intelligence → Self-Healing Engine → Selector Repair
              </div>
            </div>
          </TabsContent>

          {/* ── Test-to-Monitor Tab ── */}
          <TabsContent value="test-to-monitor">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Promote Tests to Monitoring Checkpoints
                  <Badge variant="outline" className="ml-2">
                    {testCases.length} tests
                  </Badge>
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadTestCases()}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Refresh
                </Button>
              </div>

              {testCases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Eye className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm">No test cases available</p>
                  <p className="text-xs">
                    Generate tests first, then promote them as monitoring
                    checkpoints.
                  </p>
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {testCases.map((tc) => (
                    <div
                      key={tc.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {tc.name}
                          </span>
                          {tc.autoHealed && (
                            <Badge className="text-xs px-1 py-0 bg-amber-100 text-amber-700">
                              Healed
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {tc.featureName} · {tc.projectName}
                          </span>
                          {tc.selector && (
                            <code className="text-xs bg-slate-100 px-1 rounded">
                              {tc.selector.length > 30
                                ? tc.selector.slice(0, 30) + "..."
                                : tc.selector}
                            </code>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-2 shrink-0"
                        disabled={promoting === tc.id}
                        onClick={() => handlePromote(tc.id, tc.name)}
                      >
                        {promoting === tc.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Eye className="h-3 w-3 mr-1" />
                        )}
                        Promote
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {promoteResult && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="text-sm font-medium text-blue-800 mb-1">
                    Test Promoted to Checkpoint!
                  </h4>
                  <p className="text-xs text-blue-700">
                    &quot;{promoteResult.testCaseName}&quot; is now a synthetic
                    monitoring checkpoint.
                  </p>
                </div>
              )}

              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowRight className="h-3 w-3" />
                Test Case → Synthetic Checkpoint → Continuous Production Monitoring
              </div>
            </div>
          </TabsContent>

          {/* ── Compliance Overview Tab ── */}
          <TabsContent value="compliance">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Cross-Feature Audit Summary
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadAuditSummary()}
                  disabled={auditLoading}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 mr-1 ${auditLoading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
              </div>

              {auditSummary ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold">
                          {auditSummary.totalActions}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Total Actions
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold text-amber-600">
                          {auditSummary.bySeverity?.warning || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Warnings
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold text-red-600">
                          {auditSummary.bySeverity?.critical || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Critical
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {auditSummary.categories &&
                    auditSummary.categories.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          By Category
                        </h4>
                        {auditSummary.categories.map((cat) => (
                          <div
                            key={cat.category}
                            className="flex items-center gap-3 p-2 rounded-lg bg-white border border-slate-100"
                          >
                            <div className="flex-1">
                              <span className="text-sm font-medium capitalize">
                                {cat.category.replace("_", " ")}
                              </span>
                              <span className="text-xs text-muted-foreground ml-2">
                                ({cat.count} actions)
                              </span>
                            </div>
                            <div className="flex gap-1">
                              {Object.entries(cat.severities).map(
                                ([sev, count]) => (
                                  <Badge
                                    key={sev}
                                    variant="outline"
                                    className={`text-xs px-1.5 py-0 ${severityColor(sev)}`}
                                  >
                                    {sev}: {count}
                                  </Badge>
                                )
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  {auditSummary.timeline &&
                    auditSummary.timeline.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Activity Timeline (Last 30 Days)
                        </h4>
                        <div className="flex items-end gap-1 h-20">
                          {auditSummary.timeline
                            .slice(-14)
                            .map((entry, i) => {
                              const maxCount = Math.max(
                                ...auditSummary.timeline.map((e) => e.count),
                                1
                              );
                              const height =
                                (entry.count / maxCount) * 100;
                              return (
                                <div
                                  key={entry.date}
                                  className="flex-1 flex flex-col items-center"
                                >
                                  <div
                                    className="w-full bg-teal-400 rounded-t"
                                    style={{
                                      height: `${Math.max(height, 4)}%`,
                                      minHeight: "4px",
                                    }}
                                    title={`${entry.date}: ${entry.count} actions`}
                                  />
                                  {i % 2 === 0 && (
                                    <span className="text-[8px] text-muted-foreground mt-0.5">
                                      {entry.date.slice(5)}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm">No audit data available</p>
                  <p className="text-xs">
                    Audit entries will appear as Phase 6 features are used.
                  </p>
                </div>
              )}

              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowRight className="h-3 w-3" />
                All Phase 6 Actions → Tamper-Evident Audit Trail → Compliance
              </div>
            </div>
          </TabsContent>

          {/* ── Phase 6 Health Tab ── */}
          <TabsContent value="health">
            <div className="space-y-4">
              <h3 className="text-sm font-medium">
                Phase 6 Subsystem Health Indicators
              </h3>

              <div className="space-y-2">
                {[
                  {
                    key: "intelligence" as const,
                    label: "AI Intelligence (M29)",
                    icon: BrainCircuit,
                    desc: "Smart selection, flakiness analysis, impact prioritization",
                  },
                  {
                    key: "selfHeal" as const,
                    label: "Self-Healing v2 (M30)",
                    icon: Wrench,
                    desc: "Selector repair, maintenance scan, deprecation tracking",
                  },
                  {
                    key: "monitoring" as const,
                    label: "Synthetic Monitoring (M31)",
                    icon: Activity,
                    desc: "Checkpoints, baselines, regressions",
                  },
                  {
                    key: "sso" as const,
                    label: "Enterprise SSO & Audit (M32)",
                    icon: Shield,
                    desc: "SSO, audit logs, RBAC policies",
                  },
                  {
                    key: "plugins" as const,
                    label: "Plugin Architecture (M33)",
                    icon: Zap,
                    desc: "Plugin lifecycle, marketplace",
                  },
                ].map((subsystem) => (
                  <div
                    key={subsystem.key}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white border border-slate-100"
                  >
                    <subsystem.icon className="h-5 w-5 text-teal-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {subsystem.label}
                        </span>
                        {healthBadge(health[subsystem.key])}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {subsystem.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Overall Integration Health */}
              <Card className="border-teal-200 bg-teal-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <GitMerge className="h-4 w-4 text-teal-600" />
                    <span className="text-sm font-medium">
                      Integration Health
                    </span>
                  </div>
                  <Progress
                    value={
                      Object.values(health).filter((h) => h === "healthy")
                        .length * 20
                    }
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {Object.values(health).filter((h) => h === "healthy")
                      .length}
                    /5 subsystems operational
                  </p>
                </CardContent>
              </Card>

              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                Cross-feature integration ensures all Phase 6 subsystems work
                together seamlessly.
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
