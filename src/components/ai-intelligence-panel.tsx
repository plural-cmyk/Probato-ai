"use client";

/**
 * Probato AI Test Intelligence Panel (M29)
 *
 * Smart Test Selection, Flakiness Prediction, and Impact-Based Prioritization.
 */

import React, { useState, useCallback } from "react";
import {
  BrainCircuit,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Flame,
  Target,
  Zap,
  CheckCircle2,
  HelpCircle,
  XCircle,
  FileSearch,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface AIIntelligencePanelProps {
  projects: { id: string; name: string }[];
}

// ── Classification Badge ──────────────────────────────────────

function ClassificationBadge({ classification }: { classification: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    stable: { bg: "bg-emerald/10", text: "text-emerald", icon: CheckCircle2 },
    flaky: { bg: "bg-amber/10", text: "text-amber", icon: Flame },
    failing: { bg: "bg-warm-red/10", text: "text-warm-red", icon: XCircle },
    unknown: { bg: "bg-gray-100", text: "text-gray-500", icon: HelpCircle },
  };
  const c = config[classification] ?? config.unknown;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`text-[10px] ${c.bg} ${c.text} border-0 gap-1`}>
      <Icon className="h-3 w-3" />
      {classification}
    </Badge>
  );
}

// ── Severity Badge ─────────────────────────────────────────────

function SeverityBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-warm-red" : score >= 60 ? "text-amber" : score >= 40 ? "text-blue-500" : "text-emerald";
  const label = score >= 80 ? "Critical" : score >= 60 ? "High" : score >= 40 ? "Medium" : "Low";
  return (
    <Badge variant="outline" className={`text-[10px] border-0 ${color}`}>
      {label} ({score})
    </Badge>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function AIIntelligencePanel({ projects }: AIIntelligencePanelProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? "");
  const [changedFiles, setChangedFiles] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("flakiness");

  // Results state
  const [flakinessReports, setFlakinessReports] = useState<any[]>([]);
  const [flakinessAlerts, setFlakinessAlerts] = useState<any[]>([]);
  const [selectionResult, setSelectionResult] = useState<any | null>(null);
  const [impactResult, setImpactResult] = useState<any | null>(null);
  const [depStats, setDepStats] = useState<{ edges: number; tests: number } | null>(null);

  function toggleSection(key: string) {
    setExpandedSection((prev) => (prev === key ? null : key));
  }

  // ── Build Dependency Graph ──
  const buildGraph = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading("graph");
    try {
      const res = await fetch("/api/intelligence/dependencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
      const data = await res.json();
      if (res.ok) {
        setDepStats(data);
      } else {
        alert(data.error || "Failed to build dependency graph");
      }
    } catch {
      alert("Failed to build dependency graph");
    } finally {
      setLoading(null);
    }
  }, [selectedProjectId]);

  // ── Run Flakiness Analysis ──
  const runFlakiness = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading("flakiness");
    try {
      const res = await fetch("/api/intelligence/flakiness/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
      const data = await res.json();
      if (res.ok) {
        setFlakinessReports(data.reports ?? []);
        // Also load alerts
        const alertsRes = await fetch(`/api/intelligence/flakiness/alerts?projectId=${selectedProjectId}`);
        if (alertsRes.ok) {
          const alertsData = await alertsRes.json();
          setFlakinessAlerts(alertsData.alerts ?? []);
        }
      } else {
        alert(data.error || "Flakiness analysis failed");
      }
    } catch {
      alert("Flakiness analysis failed");
    } finally {
      setLoading(null);
    }
  }, [selectedProjectId]);

  // ── Smart Select ──
  const smartSelect = useCallback(async () => {
    if (!selectedProjectId || !changedFiles.trim()) return;
    setLoading("select");
    try {
      const files = changedFiles.split(",").map((f) => f.trim()).filter(Boolean);
      const res = await fetch("/api/intelligence/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId, changedFiles: files }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelectionResult(data);
      } else {
        alert(data.error || "Smart selection failed");
      }
    } catch {
      alert("Smart selection failed");
    } finally {
      setLoading(null);
    }
  }, [selectedProjectId, changedFiles]);

  // ── Prioritize Tests ──
  const prioritize = useCallback(async () => {
    if (!selectedProjectId || !changedFiles.trim()) return;
    setLoading("prioritize");
    try {
      const files = changedFiles.split(",").map((f) => f.trim()).filter(Boolean);
      const res = await fetch("/api/intelligence/prioritize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId, changedFiles: files }),
      });
      const data = await res.json();
      if (res.ok) {
        setImpactResult(data);
      } else {
        alert(data.error || "Prioritization failed");
      }
    } catch {
      alert("Prioritization failed");
    } finally {
      setLoading(null);
    }
  }, [selectedProjectId, changedFiles]);

  // ── Load existing reports on project change ──
  const loadExistingReports = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/intelligence/flakiness?projectId=${selectedProjectId}`);
      if (res.ok) {
        const data = await res.json();
        setFlakinessReports(data.reports ?? []);
      }
    } catch {}
  }, [selectedProjectId]);

  React.useEffect(() => {
    loadExistingReports();
  }, [loadExistingReports]);

  // ── Summary Counts ──
  const stableCount = flakinessReports.filter((r) => r.classification === "stable").length;
  const flakyCount = flakinessReports.filter((r) => r.classification === "flaky").length;
  const failingCount = flakinessReports.filter((r) => r.classification === "failing").length;
  const unknownCount = flakinessReports.filter((r) => r.classification === "unknown").length;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-deep-indigo to-electric-violet">
            <BrainCircuit className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-deep-indigo">AI Test Intelligence</h2>
            <p className="text-xs text-muted-foreground">Smart selection, flakiness prediction, impact prioritization</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Project:</Label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-8 rounded-md border px-2 text-xs"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Dependency Graph Section ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4 cursor-pointer" onClick={() => toggleSection("graph")}>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-blue-500" />
            Dependency Graph
            {depStats && <Badge variant="secondary" className="text-[10px] ml-1">{depStats.edges} edges</Badge>}
            <span className="ml-auto">{expandedSection === "graph" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
          </CardTitle>
        </CardHeader>
        {expandedSection === "graph" && (
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={buildGraph} disabled={loading === "graph"}>
                {loading === "graph" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Rebuild Graph
              </Button>
              <span className="text-xs text-muted-foreground">3 credits</span>
              {depStats && (
                <span className="text-xs text-muted-foreground">
                  {depStats.edges} edges across {depStats.tests} tests
                </span>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Smart Selection Section ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4 cursor-pointer" onClick={() => toggleSection("select")}>
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-electric-violet" />
            Smart Test Selection
            {selectionResult && <Badge variant="secondary" className="text-[10px] ml-1">{Array.isArray(selectionResult.selectedTests) ? selectionResult.selectedTests.length : 0} selected</Badge>}
            <span className="ml-auto">{expandedSection === "select" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
          </CardTitle>
        </CardHeader>
        {expandedSection === "select" && (
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Changed files (comma-separated)</Label>
              <Input
                placeholder="src/components/Login.tsx, src/api/auth.ts"
                value={changedFiles}
                onChange={(e) => setChangedFiles(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={smartSelect} disabled={loading === "select" || !changedFiles.trim()}>
                {loading === "select" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Target className="h-3.5 w-3.5 mr-1.5" />}
                Select Tests
              </Button>
              <span className="text-xs text-muted-foreground">5 credits</span>
            </div>
            {selectionResult && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-emerald font-medium">{Array.isArray(selectionResult.selectedTests) ? selectionResult.selectedTests.length : 0} selected</span>
                  <span className="text-muted-foreground">{Array.isArray(selectionResult.skippedTests) ? selectionResult.skippedTests.length : 0} skipped</span>
                  <span className="text-muted-foreground">{selectionResult.coveragePercent?.toFixed(1) ?? 0}% coverage</span>
                </div>
                {selectionResult.rationale && (
                  <p className="text-xs text-muted-foreground">{selectionResult.rationale}</p>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Flakiness Section ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4 cursor-pointer" onClick={() => toggleSection("flakiness")}>
          <CardTitle className="text-sm flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber" />
            Flakiness Analysis
            <Badge variant="secondary" className="text-[10px] ml-1">{flakinessReports.length} tests</Badge>
            <span className="ml-auto">{expandedSection === "flakiness" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
          </CardTitle>
        </CardHeader>
        {expandedSection === "flakiness" && (
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={runFlakiness} disabled={loading === "flakiness"}>
                {loading === "flakiness" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Run Analysis
              </Button>
              <span className="text-xs text-muted-foreground">10 credits</span>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center rounded-lg border p-2">
                <p className="text-lg font-bold text-emerald">{stableCount}</p>
                <p className="text-[10px] text-muted-foreground">Stable</p>
              </div>
              <div className="text-center rounded-lg border p-2">
                <p className="text-lg font-bold text-amber">{flakyCount}</p>
                <p className="text-[10px] text-muted-foreground">Flaky</p>
              </div>
              <div className="text-center rounded-lg border p-2">
                <p className="text-lg font-bold text-warm-red">{failingCount}</p>
                <p className="text-[10px] text-muted-foreground">Failing</p>
              </div>
              <div className="text-center rounded-lg border p-2">
                <p className="text-lg font-bold text-gray-400">{unknownCount}</p>
                <p className="text-[10px] text-muted-foreground">Unknown</p>
              </div>
            </div>

            {/* Reports Table */}
            {flakinessReports.length > 0 && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {flakinessReports.map((report: any) => (
                  <div key={report.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                      report.flakinessScore >= 60 ? "bg-warm-red/10 text-warm-red" : report.flakinessScore >= 20 ? "bg-amber/10 text-amber" : "bg-emerald/10 text-emerald"
                    }`}>
                      {report.flakinessScore}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{report.testCase?.name ?? report.testCaseId}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <ClassificationBadge classification={report.classification} />
                        {report.primaryIndicator && (
                          <span className="text-[10px] text-muted-foreground">{report.primaryIndicator.replace(/_/g, " ")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Alerts */}
            {flakinessAlerts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Recent Alerts</p>
                {flakinessAlerts.slice(0, 5).map((alert: any) => (
                  <div key={alert.id} className="flex items-center gap-2 rounded-md border border-amber/20 bg-amber/5 p-2 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber shrink-0" />
                    <span className="truncate">{alert.message}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Impact Prioritization Section ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4 cursor-pointer" onClick={() => toggleSection("prioritize")}>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-electric-violet" />
            Impact Prioritization
            {impactResult && <Badge variant="secondary" className="text-[10px] ml-1">{impactResult.totalAffected} affected</Badge>}
            <span className="ml-auto">{expandedSection === "prioritize" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
          </CardTitle>
        </CardHeader>
        {expandedSection === "prioritize" && (
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Changed files (comma-separated)</Label>
              <Input
                placeholder="src/components/Login.tsx, src/api/auth.ts"
                value={changedFiles}
                onChange={(e) => setChangedFiles(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={prioritize} disabled={loading === "prioritize" || !changedFiles.trim()}>
                {loading === "prioritize" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                Analyze Impact
              </Button>
              <span className="text-xs text-muted-foreground">20 credits</span>
            </div>
            {impactResult && (
              <div className="space-y-2">
                {/* Summary */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-md bg-warm-red/5 p-2">
                    <p className="text-sm font-bold text-warm-red">{impactResult.criticalCount}</p>
                    <p className="text-[10px] text-muted-foreground">Critical</p>
                  </div>
                  <div className="rounded-md bg-amber/5 p-2">
                    <p className="text-sm font-bold text-amber">{impactResult.highCount}</p>
                    <p className="text-[10px] text-muted-foreground">High</p>
                  </div>
                  <div className="rounded-md bg-blue-50 p-2">
                    <p className="text-sm font-bold text-blue-500">{impactResult.mediumCount}</p>
                    <p className="text-[10px] text-muted-foreground">Medium</p>
                  </div>
                  <div className="rounded-md bg-emerald/5 p-2">
                    <p className="text-sm font-bold text-emerald">{impactResult.lowCount}</p>
                    <p className="text-[10px] text-muted-foreground">Low</p>
                  </div>
                </div>

                {/* Priority List */}
                {Array.isArray(impactResult.priorityOrder) && impactResult.priorityOrder.length > 0 && (
                  <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                    {impactResult.priorityOrder.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 rounded-md border p-2">
                        <SeverityBadge score={item.priorityScore ?? 0} />
                        <span className="text-xs truncate flex-1">{item.testCaseId}</span>
                        <span className="text-[10px] text-muted-foreground">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
