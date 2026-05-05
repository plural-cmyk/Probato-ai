"use client";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  Play,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Globe,
  Zap,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Trash2,
  Eye,
  X,
} from "lucide-react";

interface SyntheticMonitoringPanelProps {
  onClose: () => void;
}

interface Checkpoint {
  id: string;
  name: string;
  url: string;
  steps: any[];
  expectedOutcome?: string;
  intervalMinutes: number;
  severity: string;
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: string;
  runCount: number;
  failCount: number;
  avgResponseTime: number;
  createdAt: string;
  project?: { id: string; name: string };
  _count?: { results: number };
}

interface CheckpointResult {
  id: string;
  status: string;
  responseTime: number;
  error?: string;
  stepResults: any[];
  lcp?: number;
  fid?: number;
  cls?: number;
  ttfb?: number;
  domContentLoaded?: number;
  fullPageLoad?: number;
  hasScreenshot?: boolean;
  createdAt: string;
}

interface Baseline {
  id: string;
  url: string;
  metricName: string;
  mean: number;
  stdDev: number;
  p50: number;
  p75: number;
  p95: number;
  sampleCount: number;
  warningThreshold: number;
  criticalThreshold: number;
  lastComputedAt: string;
  project?: { id: string; name: string };
  _count?: { regressions: number };
}

interface Regression {
  id: string;
  metricName: string;
  currentValue: number;
  baselineValue: number;
  degradationPercent: number;
  severity: string;
  status: string;
  hasScreenshot?: boolean;
  createdAt: string;
  baseline?: { id: string; url: string; metricName: string; mean: number };
  project?: { id: string; name: string };
}

interface DashboardData {
  summary: {
    totalCheckpoints: number;
    enabledCheckpoints: number;
    criticalCheckpoints: number;
    recentResults: { total: number; passed: number; failed: number; error: number };
    regressions: { openWarning: number; openCritical: number; total: number };
    avgWebVitals: {
      lcp: number | null;
      fid: number | null;
      cls: number | null;
      ttfb: number | null;
    };
  };
}

export default function SyntheticMonitoringPanel({ onClose }: SyntheticMonitoringPanelProps) {
  const [activeTab, setActiveTab] = useState("checkpoints");
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [results, setResults] = useState<CheckpointResult[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [regressions, setRegressions] = useState<Regression[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedCheckpoint, setExpandedCheckpoint] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newSteps, setNewSteps] = useState('[{"type":"navigate","value":"/"}]');
  const [newInterval, setNewInterval] = useState("5");
  const [newSeverity, setNewSeverity] = useState("informational");
  const [creating, setCreating] = useState(false);

  // Regression filters
  const [regressionStatusFilter, setRegressionStatusFilter] = useState("open");
  const [regressionSeverityFilter, setRegressionSeverityFilter] = useState("all");

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/monitoring/dashboard");
      if (res.ok) {
        const data = await res.json();
        setDashboard(data);
        setCheckpoints(data.checkpoints || []);
        setBaselines(data.baselines || []);
        setRegressions(data.openRegressions || []);
      }
    } catch (err) {
      console.error("Failed to load monitoring dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const loadResults = useCallback(async (checkpointId: string) => {
    try {
      const res = await fetch(`/api/monitoring/checkpoints/${checkpointId}/results`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }
    } catch (err) {
      console.error("Failed to load results:", err);
    }
  }, []);

  const loadRegressions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (regressionStatusFilter) params.set("status", regressionStatusFilter);
      if (regressionSeverityFilter !== "all") params.set("severity", regressionSeverityFilter);
      const res = await fetch(`/api/monitoring/regressions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRegressions(data.regressions || []);
      }
    } catch (err) {
      console.error("Failed to load regressions:", err);
    }
  }, [regressionStatusFilter, regressionSeverityFilter]);

  useEffect(() => {
    if (activeTab === "regressions") {
      loadRegressions();
    }
  }, [activeTab, loadRegressions]);

  const handleCreateCheckpoint = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setCreating(true);
    try {
      let parsedSteps;
      try {
        parsedSteps = JSON.parse(newSteps);
      } catch {
        parsedSteps = [{ type: "navigate", value: "/" }];
      }

      const res = await fetch("/api/monitoring/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          url: newUrl,
          steps: parsedSteps,
          intervalMinutes: parseInt(newInterval),
          severity: newSeverity,
        }),
      });

      if (res.ok) {
        setNewName("");
        setNewUrl("");
        setNewSteps('[{"type":"navigate","value":"/"}]');
        setNewInterval("5");
        setNewSeverity("informational");
        setShowCreateForm(false);
        await loadDashboard();
      }
    } catch (err) {
      console.error("Failed to create checkpoint:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleRunCheckpoint = async (id: string) => {
    setRunningId(id);
    try {
      const res = await fetch(`/api/monitoring/checkpoints/${id}/run`, {
        method: "POST",
      });
      if (res.ok) {
        await loadDashboard();
        if (expandedCheckpoint === id) {
          await loadResults(id);
        }
      }
    } catch (err) {
      console.error("Failed to run checkpoint:", err);
    } finally {
      setRunningId(null);
    }
  };

  const handleDeleteCheckpoint = async (id: string) => {
    try {
      const res = await fetch(`/api/monitoring/checkpoints/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadDashboard();
      }
    } catch (err) {
      console.error("Failed to delete checkpoint:", err);
    }
  };

  const handleToggleCheckpoint = async (checkpoint: Checkpoint) => {
    try {
      await fetch(`/api/monitoring/checkpoints/${checkpoint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !checkpoint.enabled }),
      });
      await loadDashboard();
    } catch (err) {
      console.error("Failed to toggle checkpoint:", err);
    }
  };

  const handleRegressionAction = async (id: string, status: string) => {
    try {
      await fetch(`/api/monitoring/regressions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadRegressions();
      await loadDashboard();
    } catch (err) {
      console.error("Failed to update regression:", err);
    }
  };

  const toggleCheckpointExpand = (id: string) => {
    if (expandedCheckpoint === id) {
      setExpandedCheckpoint(null);
      setResults([]);
    } else {
      setExpandedCheckpoint(id);
      loadResults(id);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "passed": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      case "error": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const severityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
      informational: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    };
    return (
      <Badge className={colors[severity] || colors.informational} variant="outline">
        {severity}
      </Badge>
    );
  };

  const formatMs = (ms: number | null | undefined) => {
    if (ms === null || ms === undefined) return "—";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const metricLabel = (name: string) => {
    const labels: Record<string, string> = {
      lcp: "LCP",
      fid: "FID",
      cls: "CLS",
      ttfb: "TTFB",
      domContentLoaded: "DCL",
      fullPageLoad: "Load",
    };
    return labels[name] || name;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading monitoring data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-deep-indigo" />
          <h2 className="text-lg font-semibold">Synthetic Monitoring</h2>
          <Badge variant="outline" className="text-xs">M31</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary Cards */}
      {dashboard && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Checkpoints</span>
              </div>
              <p className="text-2xl font-bold">{dashboard.summary.totalCheckpoints}</p>
              <p className="text-xs text-muted-foreground">{dashboard.summary.enabledCheckpoints} enabled</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-muted-foreground">Recent Results (24h)</span>
              </div>
              <p className="text-2xl font-bold">{dashboard.summary.recentResults.total}</p>
              <p className="text-xs text-muted-foreground">
                {dashboard.summary.recentResults.passed} passed / {dashboard.summary.recentResults.failed} failed
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">Open Regressions</span>
              </div>
              <p className="text-2xl font-bold">{dashboard.summary.regressions.total}</p>
              <p className="text-xs text-muted-foreground">
                {dashboard.summary.regressions.openCritical} critical / {dashboard.summary.regressions.openWarning} warning
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-500" />
                <span className="text-sm text-muted-foreground">Avg Web Vitals</span>
              </div>
              <div className="text-sm space-y-0.5">
                {dashboard.summary.avgWebVitals.lcp !== null && (
                  <p>LCP: {formatMs(dashboard.summary.avgWebVitals.lcp)}</p>
                )}
                {dashboard.summary.avgWebVitals.ttfb !== null && (
                  <p>TTFB: {formatMs(dashboard.summary.avgWebVitals.ttfb)}</p>
                )}
                {dashboard.summary.avgWebVitals.cls !== null && (
                  <p>CLS: {dashboard.summary.avgWebVitals.cls.toFixed(3)}</p>
                )}
                {dashboard.summary.avgWebVitals.lcp === null && (
                  <p className="text-muted-foreground">No data yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="checkpoints">Checkpoints</TabsTrigger>
          <TabsTrigger value="baselines">Baselines</TabsTrigger>
          <TabsTrigger value="regressions">Regressions</TabsTrigger>
          <TabsTrigger value="vitals">Web Vitals</TabsTrigger>
        </TabsList>

        {/* ── Checkpoints Tab ── */}
        <TabsContent value="checkpoints" className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Create Checkpoint
            </Button>
            <Button size="sm" variant="outline" onClick={loadDashboard} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {/* Create Form */}
          {showCreateForm && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">New Synthetic Checkpoint</CardTitle>
                <CardDescription>Define a URL to monitor with optional interaction steps</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      placeholder="Homepage Load Check"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">URL</label>
                    <Input
                      placeholder="https://example.com"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Steps (JSON)</label>
                  <Input
                    placeholder='[{"type":"navigate","value":"/"},{"type":"assert","selector":"h1","value":"Welcome"}]'
                    value={newSteps}
                    onChange={(e) => setNewSteps(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Step types: navigate, assert, wait
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Interval (minutes)</label>
                    <Input
                      type="number"
                      min="5"
                      value={newInterval}
                      onChange={(e) => setNewInterval(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Severity</label>
                    <Select value={newSeverity} onValueChange={setNewSeverity}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="informational">Informational</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreateCheckpoint} disabled={creating || !newName || !newUrl}>
                    {creating ? "Creating..." : "Create"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Checkpoints List */}
          {checkpoints.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No synthetic checkpoints yet.</p>
                <p className="text-sm">Create one to start monitoring your URLs.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {checkpoints.map((cp) => (
                <Card key={cp.id} className={cp.enabled ? "" : "opacity-60"}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {statusIcon(cp.lastRunStatus || "pending")}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{cp.name}</span>
                            {severityBadge(cp.severity)}
                            {!cp.enabled && (
                              <Badge variant="outline" className="text-xs opacity-60">Disabled</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <Globe className="h-3 w-3" />
                            <span className="truncate max-w-[250px]">{cp.url}</span>
                            <span>•</span>
                            <span>{cp.runCount} runs</span>
                            <span>•</span>
                            <span>Avg: {formatMs(cp.avgResponseTime)}</span>
                            {cp.lastRunAt && (
                              <>
                                <span>•</span>
                                <span>Last: {new Date(cp.lastRunAt).toLocaleString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRunCheckpoint(cp.id)}
                          disabled={runningId === cp.id}
                          className="gap-1"
                        >
                          {runningId === cp.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                          Run
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleCheckpoint(cp)}
                          title={cp.enabled ? "Disable" : "Enable"}
                        >
                          {cp.enabled ? "⏸" : "▶"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleCheckpointExpand(cp.id)}
                        >
                          {expandedCheckpoint === cp.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteCheckpoint(cp.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded: Results */}
                    {expandedCheckpoint === cp.id && (
                      <div className="mt-4 border-t pt-4">
                        <h4 className="text-sm font-medium mb-2">Recent Results</h4>
                        {results.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No results yet. Click Run to execute this checkpoint.</p>
                        ) : (
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {results.map((r) => (
                              <div
                                key={r.id}
                                className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm cursor-pointer hover:bg-muted"
                                onClick={() => setExpandedResult(expandedResult === r.id ? null : r.id)}
                              >
                                <div className="flex items-center gap-2">
                                  {statusIcon(r.status)}
                                  <span>{formatMs(r.responseTime)}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(r.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  {r.lcp !== null && r.lcp !== undefined && <span>LCP:{formatMs(r.lcp)}</span>}
                                  {r.ttfb !== null && r.ttfb !== undefined && <span>TTFB:{formatMs(r.ttfb)}</span>}
                                  {r.cls !== null && r.cls !== undefined && <span>CLS:{r.cls.toFixed(3)}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Baselines Tab ── */}
        <TabsContent value="baselines" className="space-y-4">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={loadDashboard} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {baselines.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No performance baselines yet.</p>
                <p className="text-sm">Baselines are created automatically when checkpoints run.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">URL</th>
                        <th className="text-left p-3 font-medium">Metric</th>
                        <th className="text-right p-3 font-medium">p50</th>
                        <th className="text-right p-3 font-medium">p75</th>
                        <th className="text-right p-3 font-medium">p95</th>
                        <th className="text-right p-3 font-medium">Samples</th>
                        <th className="text-right p-3 font-medium">Warning</th>
                        <th className="text-right p-3 font-medium">Critical</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baselines.map((bl) => (
                        <tr key={bl.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3 max-w-[200px] truncate">{bl.url}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-xs">{metricLabel(bl.metricName)}</Badge>
                          </td>
                          <td className="p-3 text-right">{formatMs(bl.p50)}</td>
                          <td className="p-3 text-right">{formatMs(bl.p75)}</td>
                          <td className="p-3 text-right">{formatMs(bl.p95)}</td>
                          <td className="p-3 text-right">{bl.sampleCount}</td>
                          <td className="p-3 text-right text-amber-600">{bl.warningThreshold}%</td>
                          <td className="p-3 text-right text-red-600">{bl.criticalThreshold}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Regressions Tab ── */}
        <TabsContent value="regressions" className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={regressionStatusFilter} onValueChange={setRegressionStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={regressionSeverityFilter} onValueChange={setRegressionSeverityFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={loadRegressions} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {regressions.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                <p>No regressions found.</p>
                <p className="text-sm">Performance is within expected baselines.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {regressions.map((reg) => (
                <Card key={reg.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {reg.severity === "critical" ? (
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-amber-500" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {metricLabel(reg.metricName)}
                            </Badge>
                            {severityBadge(reg.severity)}
                            <Badge
                              variant="outline"
                              className={
                                reg.status === "open"
                                  ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                                  : reg.status === "acknowledged"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                              }
                            >
                              {reg.status}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {reg.baseline?.url && (
                              <span className="truncate max-w-[250px] inline-block">{reg.baseline.url}</span>
                            )}
                            <span className="ml-2">
                              Current: {formatMs(reg.currentValue)} vs Baseline: {formatMs(reg.baselineValue)}
                            </span>
                            <span className="ml-2 font-medium text-red-500">
                              +{reg.degradationPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {reg.status === "open" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRegressionAction(reg.id, "acknowledged")}
                            className="text-xs"
                          >
                            Acknowledge
                          </Button>
                        )}
                        {(reg.status === "open" || reg.status === "acknowledged") && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRegressionAction(reg.id, "resolved")}
                              className="text-xs text-emerald-600"
                            >
                              Resolve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRegressionAction(reg.id, "dismissed")}
                              className="text-xs text-muted-foreground"
                            >
                              Dismiss
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Web Vitals Tab ── */}
        <TabsContent value="vitals" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Core Web Vitals Explanation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <h4 className="font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-red-500" /> LCP
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Largest Contentful Paint. Good: &lt;2.5s, Needs Improvement: 2.5-4s, Poor: &gt;4s
                  </p>
                </div>
                <div className="space-y-1">
                  <h4 className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" /> FID
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    First Input Delay. Good: &lt;100ms, Needs Improvement: 100-300ms, Poor: &gt;300ms
                  </p>
                </div>
                <div className="space-y-1">
                  <h4 className="font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" /> CLS
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Cumulative Layout Shift. Good: &lt;0.1, Needs Improvement: 0.1-0.25, Poor: &gt;0.25
                  </p>
                </div>
                <div className="space-y-1">
                  <h4 className="font-medium flex items-center gap-2">
                    <Globe className="h-4 w-4 text-purple-500" /> TTFB
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Time to First Byte. Good: &lt;800ms, Needs Improvement: 800-1800ms, Poor: &gt;1800ms
                  </p>
                </div>
                <div className="space-y-1">
                  <h4 className="font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" /> DCL
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    DOM Content Loaded. Measures when HTML is fully parsed. Typically &lt;1s for good UX.
                  </p>
                </div>
                <div className="space-y-1">
                  <h4 className="font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-500" /> Load
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Full Page Load. Measures complete page load including all resources. Target &lt;3s.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Latest Web Vitals from checkpoints */}
          {baselines.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Performance Baseline Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {baselines.map((bl) => (
                    <div key={bl.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{metricLabel(bl.metricName)}</Badge>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">{bl.url}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span>p50: <strong>{formatMs(bl.p50)}</strong></span>
                        <span>p95: <strong>{formatMs(bl.p95)}</strong></span>
                        <span className="text-muted-foreground">({bl.sampleCount} samples)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
