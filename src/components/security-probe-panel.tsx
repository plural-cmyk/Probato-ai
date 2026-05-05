"use client";

/**
 * Probato Security Probe Panel (M23)
 *
 * Displays active security probe results with:
 *  - Overall score + XSS/Auth sub-scores (circular progress indicators)
 *  - XSS findings: reflected, DOM-based, stored indicators, input vectors
 *  - Auth findings: CSRF, session, redirect, bypass, rate limiting
 *  - Payloads tested counter
 *  - Category filter tabs (XSS / Auth)
 *  - Expandable findings with details, evidence, and recommendations
 *  - Run Probe button with depth selector (quick / standard / deep)
 *  - Probe history
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert, ChevronRight, ChevronDown, Loader2, AlertTriangle,
  ExternalLink, RefreshCw, Eye, Bug, Lock, Zap, Key, Globe,
  Fingerprint, ArrowRightLeft, Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Types ────────────────────────────────────────────────────────

interface XSSProbeFinding {
  type: "reflected" | "dom_based" | "stored_indicator" | "input_vector";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string;
  payload: string;
  injectionPoint: string;
  reflected: boolean;
  sanitized: boolean;
  recommendation: string;
  reference?: string;
}

interface AuthProbeFinding {
  type: "missing_csrf" | "weak_session" | "open_redirect" | "auth_bypass_indicator" |
        "insecure_login" | "credential_exposure" | "session_fixation_indicator" |
        "broken_auth_flow" | "missing_rate_limit";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string;
  endpoint: string;
  method: string;
  recommendation: string;
  reference?: string;
}

interface SecurityProbeData {
  id: string;
  status: string;
  url: string;
  overallScore: number;
  xssScore: number;
  authScore: number;
  xssFindings: XSSProbeFinding[];
  authFindings: AuthProbeFinding[];
  payloadsTested: string[];
  authEndpoints: string[];
  recommendations: string[];
  duration: number;
  llmUsed: boolean;
  error?: string;
  createdAt: string;
}

interface SecurityProbePanelProps {
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

const XSS_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  reflected: { label: "Reflected XSS", icon: <Zap className="w-3.5 h-3.5" /> },
  dom_based: { label: "DOM-based", icon: <Globe className="w-3.5 h-3.5" /> },
  stored_indicator: { label: "Stored Indicator", icon: <Bug className="w-3.5 h-3.5" /> },
  input_vector: { label: "Input Vector", icon: <ArrowRightLeft className="w-3.5 h-3.5" /> },
};

const AUTH_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  missing_csrf: { label: "Missing CSRF", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  weak_session: { label: "Weak Session", icon: <Key className="w-3.5 h-3.5" /> },
  open_redirect: { label: "Open Redirect", icon: <ArrowRightLeft className="w-3.5 h-3.5" /> },
  auth_bypass_indicator: { label: "Auth Bypass", icon: <Lock className="w-3.5 h-3.5" /> },
  insecure_login: { label: "Insecure Login", icon: <Fingerprint className="w-3.5 h-3.5" /> },
  credential_exposure: { label: "Cred Exposure", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  session_fixation_indicator: { label: "Session Fixation", icon: <Key className="w-3.5 h-3.5" /> },
  broken_auth_flow: { label: "Broken Auth", icon: <Lock className="w-3.5 h-3.5" /> },
  missing_rate_limit: { label: "No Rate Limit", icon: <Gauge className="w-3.5 h-3.5" /> },
};

// ── Score Circle ─────────────────────────────────────────────────

function ScoreCircle({ score, size = 60, label }: { score: number; size?: number; label?: string }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  let color = "#10b981"; // green
  if (score < 40) color = "#ef4444"; // red
  else if (score < 70) color = "#f59e0b"; // amber

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="3"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}

// ── XSS Finding Card ─────────────────────────────────────────────

function XSSFindingCard({ finding }: { finding: XSSProbeFinding }) {
  const [expanded, setExpanded] = useState(false);
  const severityConfig = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.info;
  const typeConfig = XSS_TYPE_CONFIG[finding.type];

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
          {typeConfig && (
            <Badge variant="outline" className="text-xs shrink-0">
              <span className="mr-1">{typeConfig.icon}</span>
              {typeConfig.label}
            </Badge>
          )}
          {finding.reflected && (
            <Badge variant="outline" className={`text-xs shrink-0 ${finding.sanitized ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
              {finding.sanitized ? "Sanitized" : "UNSANITIZED"}
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

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 p-2">
              <span className="font-medium text-gray-500">Injection Point:</span>
              <p className="mt-0.5 text-gray-700 dark:text-gray-300 break-all">{finding.injectionPoint}</p>
            </div>
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 p-2">
              <span className="font-medium text-gray-500">Payload:</span>
              <code className="block mt-0.5 text-gray-700 dark:text-gray-300 break-all">
                {finding.payload.substring(0, 100)}
              </code>
            </div>
          </div>

          {finding.evidence && (
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 p-2">
              <span className="text-xs font-medium text-gray-500">Evidence:</span>
              <code className="block text-xs mt-0.5 text-gray-700 dark:text-gray-300 break-all">
                {finding.evidence.substring(0, 300)}
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

// ── Auth Finding Card ─────────────────────────────────────────────

function AuthFindingCard({ finding }: { finding: AuthProbeFinding }) {
  const [expanded, setExpanded] = useState(false);
  const severityConfig = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.info;
  const typeConfig = AUTH_TYPE_CONFIG[finding.type];

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
          {typeConfig && (
            <Badge variant="outline" className="text-xs shrink-0">
              <span className="mr-1">{typeConfig.icon}</span>
              {typeConfig.label}
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

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 p-2">
              <span className="font-medium text-gray-500">Endpoint:</span>
              <code className="block mt-0.5 text-gray-700 dark:text-gray-300 break-all">
                {finding.endpoint.substring(0, 150)}
              </code>
            </div>
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 p-2">
              <span className="font-medium text-gray-500">Method:</span>
              <p className="mt-0.5 text-gray-700 dark:text-gray-300">{finding.method}</p>
            </div>
          </div>

          {finding.evidence && (
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 p-2">
              <span className="text-xs font-medium text-gray-500">Evidence:</span>
              <code className="block text-xs mt-0.5 text-gray-700 dark:text-gray-300 break-all">
                {finding.evidence.substring(0, 300)}
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

export default function SecurityProbePanel({ projectId, url }: SecurityProbePanelProps) {
  const [probes, setProbes] = useState<SecurityProbeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "xss" | "auth">("all");
  const [probeDepth, setProbeDepth] = useState<"quick" | "standard" | "deep">("standard");
  const [latestResult, setLatestResult] = useState<SecurityProbeData | null>(null);

  const loadProbes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/security/probes?projectId=${projectId}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setProbes(data.probes ?? []);
        if (data.probes?.length > 0) {
          // Load the most recent probe with full findings
          const detailRes = await fetch(`/api/security/probes/${data.probes[0].id}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setLatestResult(detailData.probe as SecurityProbeData);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load security probes:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProbes();
  }, [loadProbes]);

  const handleRunProbe = useCallback(async () => {
    if (!url) return;
    setProbing(true);
    try {
      const res = await fetch("/api/security/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          url,
          probeDepth,
          probeXSS: true,
          probeAuth: true,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setLatestResult({
          id: `probe-${Date.now()}`,
          status: "completed",
          url,
          overallScore: result.overallScore ?? 0,
          xssScore: result.xssScore ?? 0,
          authScore: result.authScore ?? 0,
          xssFindings: result.xssFindings ?? [],
          authFindings: result.authFindings ?? [],
          payloadsTested: result.payloadsTested ?? [],
          authEndpoints: result.authEndpoints ?? [],
          recommendations: result.recommendations ?? [],
          duration: result.duration ?? 0,
          llmUsed: result.llmUsed ?? false,
          error: result.error,
          createdAt: new Date().toISOString(),
        });
        await loadProbes();
      }
    } catch (error) {
      console.error("Failed to run security probe:", error);
    } finally {
      setProbing(false);
    }
  }, [projectId, url, probeDepth, loadProbes]);

  // Combined and filtered findings
  const xssFindings = latestResult?.xssFindings ?? [];
  const authFindings = latestResult?.authFindings ?? [];

  const filteredXSS = categoryFilter === "auth" ? [] : xssFindings;
  const filteredAuth = categoryFilter === "xss" ? [] : authFindings;
  const totalFiltered = filteredXSS.length + filteredAuth.length;

  // Severity summary
  const allFindings = [...xssFindings, ...authFindings];
  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/20">
            <ShieldAlert className="h-4 w-4 text-orange-600" />
          </div>
          <div>
            <CardTitle className="text-base">Active Security Probe</CardTitle>
            <CardDescription className="text-xs">
              XSS injection testing &amp; auth probing
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleRunProbe}
            disabled={probing || !url}
          >
            {probing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ShieldAlert className="w-3 h-3" />
            )}
            Run Probe
          </Button>

          {/* Depth selector */}
          <div className="flex gap-0.5 rounded-md border text-xs">
            {(["quick", "standard", "deep"] as const).map((depth) => (
              <button
                key={depth}
                className={`px-2 py-1 text-xs capitalize transition-colors ${
                  probeDepth === depth
                    ? "bg-primary text-primary-foreground rounded-sm"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => setProbeDepth(depth)}
              >
                {depth}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={loadProbes}
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
            <ShieldAlert className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No security probe yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              {url
                ? "Click 'Run Probe' to actively test for XSS and auth vulnerabilities."
                : "Set a sandbox or repo URL to enable security probing."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Score Row */}
            <div className="flex items-center justify-around">
              <ScoreCircle score={latestResult.overallScore} label="Overall" />
              <ScoreCircle score={latestResult.xssScore} label="XSS" />
              <ScoreCircle score={latestResult.authScore} label="Auth" />
            </div>

            {/* Payloads tested & Stats */}
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Zap className="w-3 h-3" />
                {latestResult.payloadsTested?.length ?? 0} payloads tested
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Globe className="w-3 h-3" />
                {latestResult.authEndpoints?.length ?? 0} auth endpoints
              </span>
              <span className="text-muted-foreground">
                {latestResult.duration}ms
              </span>
              {latestResult.llmUsed && (
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200">
                  AI Enhanced
                </Badge>
              )}
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
              </div>
            )}

            {/* Category Filter Tabs */}
            <div className="flex gap-1">
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
              <button
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  categoryFilter === "xss"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                onClick={() => setCategoryFilter("xss")}
              >
                <Zap className="w-3 h-3" />
                XSS ({xssFindings.length})
              </button>
              <button
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  categoryFilter === "auth"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                onClick={() => setCategoryFilter("auth")}
              >
                <Lock className="w-3 h-3" />
                Auth ({authFindings.length})
              </button>
            </div>

            {/* Findings List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredXSS.map((finding, i) => (
                <XSSFindingCard key={`xss-${finding.title}-${i}`} finding={finding} />
              ))}
              {filteredAuth.map((finding, i) => (
                <AuthFindingCard key={`auth-${finding.title}-${i}`} finding={finding} />
              ))}
              {totalFiltered === 0 && allFindings.length > 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No findings in this category.
                </p>
              )}
              {allFindings.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-green-600 font-medium">No active vulnerabilities found!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The page passed all XSS and auth probe checks.
                  </p>
                </div>
              )}
            </div>

            {/* Recommendations */}
            {latestResult.recommendations?.length > 0 && (
              <div className="pt-3 border-t space-y-1">
                <h5 className="text-xs font-semibold text-gray-500">Recommendations</h5>
                {latestResult.recommendations.map((rec, i) => (
                  <p key={i} className="text-xs text-gray-600 dark:text-gray-400">
                    • {rec}
                  </p>
                ))}
              </div>
            )}

            {/* Probe History */}
            {probes.length > 1 && (
              <div className="pt-3 border-t">
                <h5 className="text-xs font-semibold text-gray-500 mb-2">Probe History</h5>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {probes.slice(1, 6).map((probe) => (
                    <div key={probe.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${
                          probe.status === "completed" ? "bg-green-50 text-green-700"
                          : probe.status === "failed" ? "bg-red-50 text-red-700"
                          : "bg-gray-50 text-gray-700"
                        }`}
                      >
                        {probe.status}
                      </Badge>
                      <span>Score: {probe.overallScore}</span>
                      <span className="truncate flex-1">{new Date(probe.createdAt).toLocaleString()}</span>
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
