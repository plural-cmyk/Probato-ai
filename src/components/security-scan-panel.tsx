"use client";

/**
 * Probato Security Scan Panel
 *
 * Displays security scan results with:
 *  - Overall score (circular progress indicator)
 *  - Findings list with severity badges
 *  - Category filter tabs
 *  - Expandable findings with details
 *  - Run Security Scan button
 *  - Scan history
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Shield, ChevronRight, ChevronDown, Loader2, AlertTriangle,
  ExternalLink, RefreshCw, Eye, Bug, Lock, Globe, Cookie, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Types ────────────────────────────────────────────────────────

interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
  reference?: string;
}

interface SecurityScanData {
  id: string;
  status: string;
  url: string;
  overallScore: number;
  headersScore: number;
  cspScore: number;
  mixedContentScore: number;
  findings: SecurityFinding[];
  recommendations: string[];
  duration: number;
  llmUsed: boolean;
  error?: string;
  createdAt: string;
}

interface SecurityScanPanelProps {
  projectId: string;
  url?: string;
}

// ── Severity Config ──────────────────────────────────────────────

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  critical: {
    label: "Critical",
    color: "text-red-700",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  high: {
    label: "High",
    color: "text-orange-700",
    bgColor: "bg-orange-50 dark:bg-orange-950/20",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  medium: {
    label: "Medium",
    color: "text-amber-700",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
    icon: <Bug className="w-3.5 h-3.5" />,
  },
  low: {
    label: "Low",
    color: "text-blue-700",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    icon: <Eye className="w-3.5 h-3.5" />,
  },
  info: {
    label: "Info",
    color: "text-gray-700",
    bgColor: "bg-gray-50 dark:bg-gray-950/20",
    icon: <Eye className="w-3.5 h-3.5" />,
  },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  headers: { label: "Headers", icon: <Globe className="w-3.5 h-3.5" /> },
  csp: { label: "CSP", icon: <Shield className="w-3.5 h-3.5" /> },
  mixed_content: { label: "Mixed Content", icon: <Lock className="w-3.5 h-3.5" /> },
  xss: { label: "XSS", icon: <Zap className="w-3.5 h-3.5" /> },
  cors: { label: "CORS", icon: <Globe className="w-3.5 h-3.5" /> },
  cookies: { label: "Cookies", icon: <Cookie className="w-3.5 h-3.5" /> },
};

// ── Score Circle ─────────────────────────────────────────────────

function ScoreCircle({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  let color = "#10b981"; // green
  if (score < 40) color = "#ef4444"; // red
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

// ── Finding Card ─────────────────────────────────────────────────

function FindingCard({ finding }: { finding: SecurityFinding }) {
  const [expanded, setExpanded] = useState(false);
  const severityConfig = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.info;
  const categoryConfig = CATEGORY_CONFIG[finding.category];

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
          {categoryConfig && (
            <Badge variant="outline" className="text-xs shrink-0">
              <span className="mr-1">{categoryConfig.icon}</span>
              {categoryConfig.label}
            </Badge>
          )}
          <span className="text-sm font-medium truncate flex-1">{finding.title}</span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-3 pb-3 space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-2">{finding.description}</p>

          {finding.evidence && (
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 p-2">
              <span className="text-xs font-medium text-gray-500">Evidence:</span>
              <code className="block text-xs mt-0.5 text-gray-700 dark:text-gray-300 break-all">
                {(finding.evidence ?? "").substring(0, 300)}
              </code>
            </div>
          )}

          <div className="rounded-md bg-green-50 dark:bg-green-950/20 p-2">
            <span className="text-xs font-medium text-green-700 dark:text-green-400">Recommendation:</span>
            <p className="text-xs mt-0.5 text-green-800 dark:text-green-300">{finding.recommendation}</p>
          </div>

          {finding.reference && (
            <a
              href={finding.reference}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="w-3 h-3" />
              Learn more
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel Component ─────────────────────────────────────────

export default function SecurityScanPanel({ projectId, url }: SecurityScanPanelProps) {
  const [scans, setScans] = useState<SecurityScanData[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [latestResult, setLatestResult] = useState<SecurityScanData | null>(null);

  const loadScans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/security/scans?projectId=${projectId}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setScans(data.scans ?? []);
        if (data.scans?.length > 0) {
          // Load the most recent scan with full findings
          const detailRes = await fetch(`/api/security/scans/${data.scans[0].id}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setLatestResult(detailData.scan as SecurityScanData);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load security scans:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadScans();
  }, [loadScans]);

  const handleRunScan = useCallback(async () => {
    if (!url) return;
    setScanning(true);
    try {
      const res = await fetch("/api/security/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, url }),
      });
      if (res.ok) {
        const result = await res.json();
        setLatestResult({
          id: `scan-${Date.now()}`,
          status: "completed",
          url,
          overallScore: result.overallScore ?? 0,
          headersScore: result.headersScore ?? 0,
          cspScore: result.cspScore ?? 0,
          mixedContentScore: result.mixedContentScore ?? 0,
          findings: result.findings ?? [],
          recommendations: result.recommendations ?? [],
          duration: result.duration ?? 0,
          llmUsed: result.llmUsed ?? false,
          error: result.error,
          createdAt: new Date().toISOString(),
        });
        await loadScans();
      }
    } catch (error) {
      console.error("Failed to run security scan:", error);
    } finally {
      setScanning(false);
    }
  }, [projectId, url, loadScans]);

  // Filtered findings
  const allFindings = latestResult?.findings ?? [];
  const filteredFindings = categoryFilter === "all"
    ? allFindings
    : allFindings.filter((f) => f.category === categoryFilter);

  // Category counts
  const categories = [...new Set(allFindings.map((f) => f.category))];
  const categoryCounts: Record<string, number> = {};
  for (const f of allFindings) {
    categoryCounts[f.category] = (categoryCounts[f.category] ?? 0) + 1;
  }

  // Severity summary
  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/20">
            <Shield className="h-4 w-4 text-red-600" />
          </div>
          <div>
            <CardTitle className="text-base">Security Scan</CardTitle>
            <CardDescription className="text-xs">
              Security vulnerability scanning
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleRunScan}
            disabled={scanning || !url}
          >
            {scanning ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Shield className="w-3 h-3" />
            )}
            Run Scan
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={loadScans}
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
            <Shield className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No security scan yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              {url
                ? "Click 'Run Scan' to check for security vulnerabilities."
                : "Set a sandbox or repo URL to enable security scanning."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Score Row */}
            <div className="flex items-center gap-4">
              <ScoreCircle score={latestResult.overallScore} />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Headers:</span>
                  <span className="text-xs font-medium">{latestResult.headersScore}/100</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">CSP:</span>
                  <span className="text-xs font-medium">{latestResult.cspScore}/100</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Mixed Content:</span>
                  <span className="text-xs font-medium">{latestResult.mixedContentScore}/100</span>
                </div>
              </div>
            </div>

            {/* Severity Summary */}
            {allFindings.length > 0 && (
              <div className="flex items-center gap-3 text-xs">
                {criticalCount > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <AlertTriangle className="w-3 h-3" />
                    {criticalCount} critical
                  </span>
                )}
                {highCount > 0 && (
                  <span className="flex items-center gap-1 text-orange-600">
                    <AlertTriangle className="w-3 h-3" />
                    {highCount} high
                  </span>
                )}
                <span className="text-muted-foreground">
                  {allFindings.length} finding{allFindings.length !== 1 ? "s" : ""}
                </span>
                {latestResult.llmUsed && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200">
                    AI Enhanced
                  </Badge>
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
                  All ({allFindings.length})
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

            {/* Findings List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredFindings.map((finding, i) => (
                <FindingCard key={`${finding.title}-${i}`} finding={finding} />
              ))}
              {filteredFindings.length === 0 && allFindings.length > 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No findings in this category.
                </p>
              )}
              {allFindings.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-green-600 font-medium">No security issues found! 🎉</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The page passed all security checks.
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

            {/* Scan History */}
            {scans.length > 1 && (
              <div className="pt-3 border-t">
                <h5 className="text-xs font-semibold text-gray-500 mb-2">Scan History</h5>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {scans.slice(1, 6).map((scan) => (
                    <div key={scan.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${
                          scan.status === "completed" ? "bg-green-50 text-green-700"
                          : scan.status === "failed" ? "bg-red-50 text-red-700"
                          : "bg-gray-50 text-gray-700"
                        }`}
                      >
                        {scan.status}
                      </Badge>
                      <span>Score: {scan.overallScore}</span>
                      <span className="truncate flex-1">{new Date(scan.createdAt).toLocaleString()}</span>
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
