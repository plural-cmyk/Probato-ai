"use client";

/**
 * Probato Test Intelligence Panel (M20)
 *
 * A comprehensive analytics dashboard providing intelligent insights
 * across all test data. Features:
 *   - Health Score gauge (0-100)
 *   - Pass Rate Trend sparkline
 *   - Duration Trend sparkline
 *   - Flaky Tests detection
 *   - Failure Clusters grouped by reason
 *   - Auto-Heal Analytics
 *   - Slowest Tests list
 *   - Feature Risk Scores
 *   - Security & A11y Score Trends
 *   - AI-generated Recommendations
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  Flame,
  Gauge,
  Lightbulb,
  Loader2,
  Pulse,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
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
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ────────────────────────────────────────────────────────

interface IntelligenceData {
  healthScore: number;
  summary: {
    totalRuns: number;
    passedRuns: number;
    failedRuns: number;
    errorRuns: number;
    passRate: number;
    totalResults: number;
    passedResults: number;
    failedResults: number;
    avgDuration: number;
    totalFeatures: number;
    totalSchedules: number;
    activeSchedules: number;
  };
  passRateTrend: { date: string; value: number | null }[];
  durationTrend: { date: string; value: number | null }[];
  flakyTests: {
    testName: string;
    featureName: string | null;
    passCount: number;
    failCount: number;
    totalRuns: number;
    flakeRate: number;
    recentPattern: string[];
  }[];
  failureClusters: {
    category: string;
    count: number;
    examples: string[];
    affectedFeatures: number;
  }[];
  autoHealAnalytics: {
    totalHeals: number;
    appliedHeals: number;
    rejectedHeals: number;
    pendingHeals: number;
    successRate: number;
    avgConfidence: number;
    byType: Record<string, { total: number; applied: number }>;
  };
  slowestTests: {
    id: string;
    testName: string;
    featureName: string | null;
    duration: number;
    status: string;
    projectName: string;
    createdAt: string;
  }[];
  riskScores: {
    featureId: string;
    featureName: string;
    featureType: string;
    projectName: string;
    riskScore: number;
    flakeRate: number;
    failRate: number;
    avgDuration: number;
    lastFailedAt: string | null;
    autoHealCount: number;
    failCluster: string | null;
  }[];
  securityA11yTrend: {
    security: { date: string; score: number | null; severity: string | null }[];
    a11y: { date: string; score: number | null; level: string | null }[];
  };
  recommendations: {
    id: string;
    priority: "critical" | "high" | "medium" | "low";
    title: string;
    description: string;
    action: string;
    category: string;
  }[];
}

interface TestIntelligencePanelProps {
  /** Available projects for filtering */
  projects: { id: string; name: string }[];
}

// ── Sparkline Component ──────────────────────────────────────────

function Sparkline({
  data,
  width = 200,
  height = 40,
  color = "#7C3AED",
  showArea = true,
}: {
  data: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  showArea?: boolean;
}) {
  const validData = data.filter((v): v is number => v !== null);
  if (validData.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ width, height }}>
        Not enough data
      </div>
    );
  }

  const min = Math.min(...validData);
  const max = Math.max(...validData);
  const range = max - min || 1;
  const padding = 2;

  const points = validData.map((v, i) => ({
    x: padding + (i / (validData.length - 1)) * (width - 2 * padding),
    y: height - padding - ((v - min) / range) * (height - 2 * padding),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {showArea && (
        <path d={areaPath} fill={color} fillOpacity={0.1} />
      )}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.length > 0 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={color} />
      )}
    </svg>
  );
}

// ── Health Score Gauge ───────────────────────────────────────────

function HealthScoreGauge({ score }: { score: number }) {
  const color =
    score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : score >= 40 ? "#EF4444" : "#DC2626";
  const label =
    score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Needs Attention" : "Critical";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#E5E7EB" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 314.16} 314.16`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>{score}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Health</span>
        </div>
      </div>
      <Badge
        className="mt-2 text-[10px]"
        style={{
          backgroundColor: `${color}15`,
          color,
          borderColor: `${color}30`,
        }}
      >
        {label}
      </Badge>
    </div>
  );
}

// ── Mini Stat Card ───────────────────────────────────────────────

function MiniStat({
  icon: Icon,
  label,
  value,
  subtext,
  trend,
  trendLabel,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-deep-indigo/5 shrink-0">
        <Icon className="h-4 w-4 text-deep-indigo" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-lg font-bold text-deep-indigo">{value}</p>
          {trend && trendLabel && (
            <span className={`text-[10px] flex items-center gap-0.5 ${
              trend === "up" ? "text-emerald" : trend === "down" ? "text-warm-red" : "text-muted-foreground"
            }`}>
              {trend === "up" ? <TrendingUp className="h-3 w-3" /> : trend === "down" ? <TrendingDown className="h-3 w-3" /> : null}
              {trendLabel}
            </span>
          )}
        </div>
        {subtext && <p className="text-[10px] text-muted-foreground truncate">{subtext}</p>}
      </div>
    </div>
  );
}

// ── Priority Badge ───────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    critical: { bg: "bg-red-100", text: "text-red-700", label: "Critical" },
    high: { bg: "bg-amber-100", text: "text-amber-700", label: "High" },
    medium: { bg: "bg-blue-100", text: "text-blue-700", label: "Medium" },
    low: { bg: "bg-gray-100", text: "text-gray-600", label: "Low" },
  };
  const c = config[priority] ?? config.low;
  return (
    <Badge variant="outline" className={`text-[10px] ${c.bg} ${c.text} border-0`}>
      {c.label}
    </Badge>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function TestIntelligencePanel({ projects }: TestIntelligencePanelProps) {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("14");
  const [expandedSection, setExpandedSection] = useState<string | null>("recommendations");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedProject !== "all") params.set("projectId", selectedProject);
      params.set("days", dateRange);

      const res = await fetch(`/api/dashboard/intelligence?${params}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || d.details || "Failed to load intelligence data");
      }
      const d = await res.json();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [selectedProject, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function toggleSection(key: string) {
    setExpandedSection((prev) => (prev === key ? null : key));
  }

  // ── Loading State ──
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 text-electric-violet animate-spin" />
        <p className="text-sm text-muted-foreground">Analyzing test intelligence...</p>
      </div>
    );
  }

  // ── Error State ──
  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="h-8 w-8 text-warm-red" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { healthScore, summary, passRateTrend, durationTrend, flakyTests, failureClusters, autoHealAnalytics, slowestTests, riskScores, securityA11yTrend, recommendations } = data;

  const formatDuration = (ms: number) =>
    ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* ── Header Bar ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-deep-indigo to-electric-violet">
            <BrainCircuit className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-deep-indigo">Test Intelligence</h2>
            <p className="text-xs text-muted-foreground">Analytics & insights for your test suite</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ── Health Score + Quick Stats Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Health Score */}
        <Card className="border-border/50 flex items-center justify-center py-4">
          <HealthScoreGauge score={healthScore} />
        </Card>

        {/* Quick Stats */}
        <Card className="border-border/50 lg:col-span-3">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat
                icon={Activity}
                label="Total Runs"
                value={summary.totalRuns}
                subtext={`${summary.passedRuns} passed, ${summary.failedRuns} failed`}
                trend={summary.passRate >= 80 ? "up" : summary.passRate >= 50 ? "neutral" : "down"}
                trendLabel={`${summary.passRate}% pass`}
              />
              <MiniStat
                icon={Clock}
                label="Avg Duration"
                value={formatDuration(summary.avgDuration)}
                subtext={`${summary.totalResults} total results`}
              />
              <MiniStat
                icon={Flame}
                label="Flaky Tests"
                value={flakyTests.length}
                subtext={flakyTests.length > 0 ? "Intermittent failures" : "No flakiness detected"}
                trend={flakyTests.length === 0 ? "up" : flakyTests.length <= 2 ? "neutral" : "down"}
              />
              <MiniStat
                icon={Zap}
                label="Auto-Heal Rate"
                value={`${autoHealAnalytics.successRate}%`}
                subtext={`${autoHealAnalytics.appliedHeals} of ${autoHealAnalytics.totalHeals} applied`}
                trend={autoHealAnalytics.successRate >= 70 ? "up" : autoHealAnalytics.successRate >= 40 ? "neutral" : "down"}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Trend Charts Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pass Rate Trend */}
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald" />
              Pass Rate Trend
              <span className="ml-auto text-xs text-muted-foreground font-normal">
                Last {dateRange} days
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Sparkline
              data={passRateTrend.map((d) => d.value)}
              width={280}
              height={50}
              color="#10B981"
            />
            <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
              <span>{passRateTrend[0]?.date}</span>
              <span>{passRateTrend[passRateTrend.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>

        {/* Duration Trend */}
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Duration Trend
              <span className="ml-auto text-xs text-muted-foreground font-normal">
                Avg per run
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Sparkline
              data={durationTrend.map((d) => d.value)}
              width={280}
              height={50}
              color="#3B82F6"
            />
            <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
              <span>{durationTrend[0]?.date}</span>
              <span>{durationTrend[durationTrend.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Recommendations Section ── */}
      {recommendations.length > 0 && (
        <Card className="border-border/50">
          <CardHeader
            className="pb-2 pt-4 px-4 cursor-pointer"
            onClick={() => toggleSection("recommendations")}
          >
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber" />
              Recommendations
              <Badge variant="secondary" className="text-[10px] ml-1">{recommendations.length}</Badge>
              <span className="ml-auto">
                {expandedSection === "recommendations" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedSection === "recommendations" && (
            <CardContent className="px-4 pb-4 space-y-2">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    rec.priority === "critical"
                      ? "border-warm-red/30 bg-warm-red/5"
                      : rec.priority === "high"
                      ? "border-amber/30 bg-amber/5"
                      : "border-border"
                  }`}
                >
                  <PriorityBadge priority={rec.priority} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-deep-indigo">{rec.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs text-electric-violet shrink-0 gap-1">
                    {rec.action} <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Flaky Tests Section ── */}
      {flakyTests.length > 0 && (
        <Card className="border-border/50">
          <CardHeader
            className="pb-2 pt-4 px-4 cursor-pointer"
            onClick={() => toggleSection("flaky")}
          >
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber" />
              Flaky Tests
              <Badge variant="secondary" className="text-[10px] ml-1">{flakyTests.length}</Badge>
              <span className="ml-auto">
                {expandedSection === "flaky" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedSection === "flaky" && (
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {flakyTests.map((ft, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                    <div className="flex items-center gap-1 shrink-0">
                      <Flame className="h-4 w-4 text-amber" />
                      <Badge variant="outline" className="text-[10px] border-amber/30 text-amber">
                        {Math.round(ft.flakeRate * 100)}% flake
                      </Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ft.testName}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {ft.passCount}P / {ft.failCount}F of {ft.totalRuns} runs
                        </span>
                        <div className="flex gap-0.5">
                          {ft.recentPattern.map((p, j) => (
                            <span
                              key={j}
                              className={`inline-block w-3 h-3 rounded-sm text-[7px] flex items-center justify-center font-bold ${
                                p === "P" ? "bg-emerald/20 text-emerald" : "bg-warm-red/20 text-warm-red"
                              }`}
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Failure Clusters + Risk Scores Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Failure Clusters */}
        <Card className="border-border/50">
          <CardHeader
            className="pb-2 pt-4 px-4 cursor-pointer"
            onClick={() => toggleSection("clusters")}
          >
            <CardTitle className="text-sm flex items-center gap-2">
              <XCircle className="h-4 w-4 text-warm-red" />
              Failure Clusters
              <Badge variant="secondary" className="text-[10px] ml-1">{failureClusters.length}</Badge>
              <span className="ml-auto">
                {expandedSection === "clusters" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedSection === "clusters" && (
            <CardContent className="px-4 pb-4">
              {failureClusters.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No failures detected in this period</p>
              ) : (
                <div className="space-y-3">
                  {failureClusters.map((cluster, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize">{cluster.category}</Badge>
                          <span className="text-sm font-medium">{cluster.count} failures</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {cluster.affectedFeatures} feature{cluster.affectedFeatures !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <Progress
                        value={Math.min(100, (cluster.count / (summary.totalResults || 1)) * 100 * 5)}
                        className="h-1.5 [&>div]:bg-warm-red"
                      />
                      {cluster.examples.length > 0 && (
                        <div className="pl-2 space-y-0.5">
                          {cluster.examples.map((ex, j) => (
                            <p key={j} className="text-[10px] text-muted-foreground font-mono truncate">{ex}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Feature Risk Scores */}
        <Card className="border-border/50">
          <CardHeader
            className="pb-2 pt-4 px-4 cursor-pointer"
            onClick={() => toggleSection("risks")}
          >
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="h-4 w-4 text-electric-violet" />
              Feature Risk Scores
              <Badge variant="secondary" className="text-[10px] ml-1">{riskScores.length}</Badge>
              <span className="ml-auto">
                {expandedSection === "risks" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedSection === "risks" && (
            <CardContent className="px-4 pb-4">
              {riskScores.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No risk data available yet</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {riskScores.slice(0, 10).map((rs, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border p-2.5">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                          rs.riskScore >= 70
                            ? "bg-warm-red/10 text-warm-red"
                            : rs.riskScore >= 40
                            ? "bg-amber/10 text-amber"
                            : "bg-emerald/10 text-emerald"
                        }`}
                      >
                        {rs.riskScore}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{rs.featureName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {rs.failRate > 0 && (
                            <span className="text-[10px] text-warm-red">{Math.round(rs.failRate * 100)}% fail</span>
                          )}
                          {rs.flakeRate > 0 && (
                            <span className="text-[10px] text-amber">{Math.round(rs.flakeRate * 100)}% flake</span>
                          )}
                          <span className="text-[10px] text-muted-foreground">{formatDuration(rs.avgDuration)}</span>
                        </div>
                      </div>
                      <Progress
                        value={rs.riskScore}
                        className={`w-16 h-1.5 ${
                          rs.riskScore >= 70
                            ? "[&>div]:bg-warm-red"
                            : rs.riskScore >= 40
                            ? "[&>div]:bg-amber"
                            : "[&>div]:bg-emerald"
                        }`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* ── Auto-Heal Analytics + Slowest Tests Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Auto-Heal Analytics */}
        <Card className="border-border/50">
          <CardHeader
            className="pb-2 pt-4 px-4 cursor-pointer"
            onClick={() => toggleSection("autoheal")}
          >
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-electric-violet" />
              Auto-Heal Analytics
              <span className="ml-auto">
                {expandedSection === "autoheal" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedSection === "autoheal" && (
            <CardContent className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center rounded-lg border p-3">
                  <p className="text-2xl font-bold text-electric-violet">{autoHealAnalytics.successRate}%</p>
                  <p className="text-[10px] text-muted-foreground">Success Rate</p>
                </div>
                <div className="text-center rounded-lg border p-3">
                  <p className="text-2xl font-bold text-deep-indigo">{autoHealAnalytics.avgConfidence}%</p>
                  <p className="text-[10px] text-muted-foreground">Avg Confidence</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-emerald/5 p-2">
                  <p className="text-sm font-bold text-emerald">{autoHealAnalytics.appliedHeals}</p>
                  <p className="text-[10px] text-muted-foreground">Applied</p>
                </div>
                <div className="rounded-md bg-warm-red/5 p-2">
                  <p className="text-sm font-bold text-warm-red">{autoHealAnalytics.rejectedHeals}</p>
                  <p className="text-[10px] text-muted-foreground">Rejected</p>
                </div>
                <div className="rounded-md bg-amber/5 p-2">
                  <p className="text-sm font-bold text-amber">{autoHealAnalytics.pendingHeals}</p>
                  <p className="text-[10px] text-muted-foreground">Pending</p>
                </div>
              </div>
              {Object.keys(autoHealAnalytics.byType).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">By Type</p>
                  <div className="space-y-1.5">
                    {Object.entries(autoHealAnalytics.byType).map(([type, stats]) => (
                      <div key={type} className="flex items-center justify-between text-xs">
                        <span className="capitalize">{type}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{stats.applied}/{stats.total}</span>
                          <Progress
                            value={stats.total > 0 ? (stats.applied / stats.total) * 100 : 0}
                            className="w-16 h-1.5 [&>div]:bg-electric-violet"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Slowest Tests */}
        <Card className="border-border/50">
          <CardHeader
            className="pb-2 pt-4 px-4 cursor-pointer"
            onClick={() => toggleSection("slowest")}
          >
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Slowest Tests
              <span className="ml-auto">
                {expandedSection === "slowest" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedSection === "slowest" && (
            <CardContent className="px-4 pb-4">
              {slowestTests.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No test duration data available</p>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {slowestTests.map((test, i) => (
                    <div key={test.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600 shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{test.testName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {test.projectName} &middot; {new Date(test.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-blue-600">{formatDuration(test.duration)}</p>
                        <Badge variant={test.status === "passed" ? "default" : "destructive"} className="text-[10px]">
                          {test.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* ── Security & A11y Trend Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Security Trend */}
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald" />
              Security Score Trend
              <Badge variant="secondary" className="text-[10px] ml-1">
                {securityA11yTrend.security.length} scans
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {securityA11yTrend.security.length >= 2 ? (
              <>
                <Sparkline
                  data={securityA11yTrend.security.map((s) => s.score)}
                  width={280}
                  height={50}
                  color="#10B981"
                />
                <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                  <span>{securityA11yTrend.security[0]?.date}</span>
                  <span>{securityA11yTrend.security[securityA11yTrend.security.length - 1]?.date}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {securityA11yTrend.security.length === 0 ? "No security scans yet" : "Need more scans for trend data"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* A11y Trend */}
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-500" />
              Accessibility Score Trend
              <Badge variant="secondary" className="text-[10px] ml-1">
                {securityA11yTrend.a11y.length} audits
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {securityA11yTrend.a11y.length >= 2 ? (
              <>
                <Sparkline
                  data={securityA11yTrend.a11y.map((a) => a.score)}
                  width={280}
                  height={50}
                  color="#3B82F6"
                />
                <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                  <span>{securityA11yTrend.a11y[0]?.date}</span>
                  <span>{securityA11yTrend.a11y[securityA11yTrend.a11y.length - 1]?.date}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {securityA11yTrend.a11y.length === 0 ? "No a11y audits yet" : "Need more audits for trend data"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
