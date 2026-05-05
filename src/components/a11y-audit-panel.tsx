"use client";

/**
 * Probato A11y Audit Panel
 *
 * Displays accessibility audit results with:
 *  - Overall score (circular progress indicator)
 *  - WCAG level badge
 *  - Violations list with severity badges
 *  - WCAG criterion badges
 *  - Category filter tabs
 *  - Expandable violations with element HTML, selector, recommendation
 *  - Run Accessibility Audit button
 *  - Pass/incomplete counts summary
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Accessibility, ChevronRight, ChevronDown, Loader2, AlertTriangle,
  ExternalLink, RefreshCw, Eye, Type, Keyboard, Image, FileInput,
  Heading1, Focus, Map, CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Types ────────────────────────────────────────────────────────

interface A11yViolation {
  severity: "critical" | "serious" | "moderate" | "minor";
  wcagCriterion: string;
  category: string;
  title: string;
  description: string;
  selector: string;
  elementHtml: string;
  recommendation: string;
}

interface A11yCheckResult {
  passed: boolean;
  label: string;
  description: string;
}

interface A11yAuditData {
  id: string;
  status: string;
  url: string;
  overallScore: number;
  wcagLevel: string;
  violations: A11yViolation[];
  passes: A11yCheckResult[];
  incomplete: A11yCheckResult[];
  recommendations: string[];
  duration: number;
  llmUsed: boolean;
  error?: string;
  createdAt: string;
}

interface A11yAuditPanelProps {
  projectId: string;
  url?: string;
}

// ── Severity Config ──────────────────────────────────────────────

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  critical: {
    label: "Critical",
    color: "text-purple-700",
    bgColor: "bg-purple-50 dark:bg-purple-950/20",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  serious: {
    label: "Serious",
    color: "text-red-700",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  moderate: {
    label: "Moderate",
    color: "text-amber-700",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  minor: {
    label: "Minor",
    color: "text-blue-700",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    icon: <Eye className="w-3.5 h-3.5" />,
  },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  contrast: { label: "Contrast", icon: <Type className="w-3.5 h-3.5" /> },
  aria: { label: "ARIA", icon: <Accessibility className="w-3.5 h-3.5" /> },
  keyboard: { label: "Keyboard", icon: <Keyboard className="w-3.5 h-3.5" /> },
  images: { label: "Images", icon: <Image className="w-3.5 h-3.5" /> },
  forms: { label: "Forms", icon: <FileInput className="w-3.5 h-3.5" /> },
  headings: { label: "Headings", icon: <Heading1 className="w-3.5 h-3.5" /> },
  focus: { label: "Focus", icon: <Focus className="w-3.5 h-3.5" /> },
  landmarks: { label: "Landmarks", icon: <Map className="w-3.5 h-3.5" /> },
};

// ── Score Circle ─────────────────────────────────────────────────

function ScoreCircle({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  let color = "#10b981"; // green
  if (score < 40) color = "#8b5cf6"; // purple
  else if (score < 70) color = "#f59e0b"; // amber

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="4"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

// ── Violation Card ───────────────────────────────────────────────

function ViolationCard({ violation }: { violation: A11yViolation }) {
  const [expanded, setExpanded] = useState(false);
  const severityConfig = SEVERITY_CONFIG[violation.severity] ?? SEVERITY_CONFIG.minor;
  const categoryConfig = CATEGORY_CONFIG[violation.category];

  const wcagUrl = `https://www.w3.org/WAI/WCAG21/Understanding/${violation.wcagCriterion.replace(/\./g, "-")}.html`;

  return (
    <div className="rounded-lg border bg-white dark:bg-zinc-900">
      <button
        className="w-full px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs shrink-0 ${severityConfig.color} ${severityConfig.bgColor} border-0`}
          >
            <span className="mr-1">{severityConfig.icon}</span>
            {severityConfig.label}
          </Badge>
          <a
            href={wcagUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-blue-600 hover:text-blue-800 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            WCAG {violation.wcagCriterion}
          </a>
          {categoryConfig && (
            <Badge variant="outline" className="text-xs shrink-0">
              <span className="mr-1">{categoryConfig.icon}</span>
              {categoryConfig.label}
            </Badge>
          )}
          <span className="text-sm font-medium truncate flex-1">{violation.title}</span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-3 pb-3 space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-2">{violation.description}</p>

          {violation.selector && (
            <div className="text-xs">
              <strong>Selector:</strong>{" "}
              <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{violation.selector}</code>
            </div>
          )}

          {violation.elementHtml && (
            <div className="rounded-md border overflow-hidden">
              <div className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs text-gray-500 border-b">
                Element HTML
              </div>
              <pre className="px-2 py-1.5 text-xs font-mono overflow-x-auto max-h-24 bg-zinc-950 text-zinc-100">
                {violation.elementHtml.substring(0, 500)}
              </pre>
            </div>
          )}

          <div className="rounded-md bg-green-50 dark:bg-green-950/20 p-2">
            <span className="text-xs font-medium text-green-700 dark:text-green-400">Recommendation:</span>
            <p className="text-xs mt-0.5 text-green-800 dark:text-green-300">{violation.recommendation}</p>
          </div>

          <a
            href={wcagUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <ExternalLink className="w-3 h-3" />
            WCAG {violation.wcagCriterion} Documentation
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main Panel Component ─────────────────────────────────────────

export default function A11yAuditPanel({ projectId, url }: A11yAuditPanelProps) {
  const [audits, setAudits] = useState<A11yAuditData[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [latestResult, setLatestResult] = useState<A11yAuditData | null>(null);

  const loadAudits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accessibility/audits?projectId=${projectId}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setAudits(data.audits ?? []);
        if (data.audits?.length > 0) {
          const detailRes = await fetch(`/api/accessibility/audits/${data.audits[0].id}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setLatestResult(detailData.audit as A11yAuditData);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load a11y audits:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadAudits();
  }, [loadAudits]);

  const handleRunAudit = useCallback(async () => {
    if (!url) return;
    setAuditing(true);
    try {
      const res = await fetch("/api/accessibility/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, url }),
      });
      if (res.ok) {
        const result = await res.json();
        setLatestResult({
          id: `audit-${Date.now()}`,
          status: "completed",
          url,
          overallScore: result.overallScore ?? 0,
          wcagLevel: "AA",
          violations: result.violations ?? [],
          passes: result.passes ?? [],
          incomplete: result.incomplete ?? [],
          recommendations: result.recommendations ?? [],
          duration: result.duration ?? 0,
          llmUsed: result.llmUsed ?? false,
          error: result.error,
          createdAt: new Date().toISOString(),
        });
        await loadAudits();
      }
    } catch (error) {
      console.error("Failed to run a11y audit:", error);
    } finally {
      setAuditing(false);
    }
  }, [projectId, url, loadAudits]);

  // Filtered violations
  const allViolations = latestResult?.violations ?? [];
  const filteredViolations = categoryFilter === "all"
    ? allViolations
    : allViolations.filter((v) => v.category === categoryFilter);

  // Category counts
  const categories = [...new Set(allViolations.map((v) => v.category))];
  const categoryCounts: Record<string, number> = {};
  for (const v of allViolations) {
    categoryCounts[v.category] = (categoryCounts[v.category] ?? 0) + 1;
  }

  // Severity summary
  const criticalCount = allViolations.filter((v) => v.severity === "critical").length;
  const seriousCount = allViolations.filter((v) => v.severity === "serious").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/20">
            <Accessibility className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <CardTitle className="text-base">Accessibility Audit</CardTitle>
            <CardDescription className="text-xs">
              WCAG compliance checking
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleRunAudit}
            disabled={auditing || !url}
          >
            {auditing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Accessibility className="w-3 h-3" />
            )}
            Run Audit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={loadAudits}
            disabled={loading}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : !latestResult ? (
          <div className="text-center py-8">
            <Accessibility className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No accessibility audit yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              {url
                ? "Click 'Run Audit' to check for WCAG compliance issues."
                : "Set a sandbox or repo URL to enable accessibility auditing."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Score Row */}
            <div className="flex items-center gap-4">
              <ScoreCircle score={latestResult.overallScore} />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    WCAG {latestResult.wcagLevel}
                  </Badge>
                  {latestResult.llmUsed && (
                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200">
                      AI Enhanced
                    </Badge>
                  )}
                </div>
                {/* Pass/Fail summary */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="w-3 h-3" />
                    {latestResult.passes.length} pass
                  </span>
                  <span className="flex items-center gap-1 text-red-600">
                    <XCircle className="w-3 h-3" />
                    {allViolations.length} violation{allViolations.length !== 1 ? "s" : ""}
                  </span>
                  {latestResult.incomplete.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      {latestResult.incomplete.length} incomplete
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Severity Summary */}
            {allViolations.length > 0 && (
              <div className="flex items-center gap-3 text-xs">
                {criticalCount > 0 && (
                  <span className="flex items-center gap-1 text-purple-600">
                    <AlertTriangle className="w-3 h-3" />
                    {criticalCount} critical
                  </span>
                )}
                {seriousCount > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <AlertTriangle className="w-3 h-3" />
                    {seriousCount} serious
                  </span>
                )}
              </div>
            )}

            {/* Category Filter Tabs */}
            {categories.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                <button
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                    categoryFilter === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  onClick={() => setCategoryFilter("all")}
                >
                  All ({allViolations.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                      categoryFilter === cat
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {CATEGORY_CONFIG[cat]?.icon}
                    {CATEGORY_CONFIG[cat]?.label ?? cat} ({categoryCounts[cat] ?? 0})
                  </button>
                ))}
              </div>
            )}

            {/* Violations List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredViolations.map((violation, i) => (
                <ViolationCard key={`${violation.title}-${i}`} violation={violation} />
              ))}
              {filteredViolations.length === 0 && allViolations.length > 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No violations in this category.
                </p>
              )}
              {allViolations.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-green-600 font-medium">No accessibility violations found! 🎉</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The page meets the checked WCAG criteria.
                  </p>
                </div>
              )}
            </div>

            {/* Recommendations */}
            {latestResult.recommendations.length > 0 && (
              <div className="pt-3 border-t space-y-1">
                <h5 className="text-xs font-semibold text-gray-500">Recommendations</h5>
                {latestResult.recommendations.map((rec, i) => (
                  <p key={i} className="text-xs text-gray-600 dark:text-gray-400">
                    • {rec}
                  </p>
                ))}
              </div>
            )}

            {/* Audit History */}
            {audits.length > 1 && (
              <div className="pt-3 border-t">
                <h5 className="text-xs font-semibold text-gray-500 mb-2">Audit History</h5>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {audits.slice(1, 6).map((audit) => (
                    <div key={audit.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${
                          audit.status === "completed" ? "bg-green-50 text-green-700"
                          : audit.status === "failed" ? "bg-red-50 text-red-700"
                          : "bg-gray-50 text-gray-700"
                        }`}
                      >
                        {audit.status}
                      </Badge>
                      <span>Score: {audit.overallScore}</span>
                      <span className="truncate flex-1">{new Date(audit.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
