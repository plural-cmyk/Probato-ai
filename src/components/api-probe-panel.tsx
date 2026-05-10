"use client";

/**
 * Probato API Security Probe Panel (M24)
 *
 * Displays API security probe results with:
 *  - 4 sub-scores: API Security, CSRF, Rate Limiting, IDOR
 *  - Findings organized by category with expandable details
 *  - Endpoint discovery summary
 *  - Depth selector (quick / standard / deep)
 *  - Probe history
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, ChevronRight, ChevronDown, Loader2, AlertTriangle,
  ExternalLink, RefreshCw, Eye, Bug, Lock, Zap, Key, Globe,
  Gauge, Fingerprint, Server, ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Types ────────────────────────────────────────────────────────

interface APISecurityFinding {
  type: string; severity: string; title: string; description: string;
  evidence: string; endpoint: string; method: string; statusCode?: number;
  recommendation: string; reference?: string;
}

interface CSRFFinding {
  type: string; severity: string; title: string; description: string;
  evidence: string; endpoint: string; method: string;
  recommendation: string; reference?: string;
}

interface RateLimitFinding {
  type: string; severity: string; title: string; description: string;
  evidence: string; endpoint: string; method: string;
  requestsTested: number; blockedAfter?: number;
  recommendation: string; reference?: string;
}

interface IDORFinding {
  type: string; severity: string; title: string; description: string;
  evidence: string; endpoint: string; method: string;
  idPattern: string; recommendation: string; reference?: string;
}

interface APIProbeData {
  id: string; status: string; url: string;
  overallScore: number; apiSecurityScore: number; csrfScore: number;
  rateLimitScore: number; idorScore: number;
  apiFindings: APISecurityFinding[]; csrfFindings: CSRFFinding[];
  rateLimitFindings: RateLimitFinding[]; idorFindings: IDORFinding[];
  endpoints: Array<{ url: string; method: string; type: string }>;
  recommendations: string[];
  duration: number; llmUsed: boolean; error?: string; createdAt: string;
}

interface APIProbePanelProps {
  projectId: string;
  url?: string;
}

// ── Configs ──────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  critical: { label: "Critical", color: "text-red-700", bgColor: "bg-red-50 dark:bg-red-950/20", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  high: { label: "High", color: "text-orange-700", bgColor: "bg-orange-50 dark:bg-orange-950/20", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  medium: { label: "Medium", color: "text-amber-700", bgColor: "bg-amber-50 dark:bg-amber-950/20", icon: <Bug className="w-3.5 h-3.5" /> },
  low: { label: "Low", color: "text-blue-700", bgColor: "bg-blue-50 dark:bg-blue-950/20", icon: <Eye className="w-3.5 h-3.5" /> },
  info: { label: "Info", color: "text-gray-700", bgColor: "bg-gray-50 dark:bg-gray-950/20", icon: <Eye className="w-3.5 h-3.5" /> },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  api: { label: "API Security", icon: <Server className="w-3.5 h-3.5" /> },
  csrf: { label: "CSRF", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  rate_limit: { label: "Rate Limit", icon: <Gauge className="w-3.5 h-3.5" /> },
  idor: { label: "IDOR", icon: <Key className="w-3.5 h-3.5" /> },
};

// ── Score Circle ─────────────────────────────────────────────────

function MiniScore({ score, label, size = 50 }: { score: number; label: string; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  let color = "#10b981";
  if (score < 40) color = "#ef4444";
  else if (score < 70) color = "#f59e0b";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="3"
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-500" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Generic Finding Card ─────────────────────────────────────────

function FindingCard({ finding, category }: {
  finding: { severity: string; title: string; description: string; evidence: string; recommendation: string; reference?: string; endpoint: string; method: string };
  category: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.info;
  const catConfig = CATEGORY_CONFIG[category];

  return (
    <div className="rounded-lg border bg-white dark:bg-zinc-900">
      <button className="w-full px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs shrink-0 ${sev.color} ${sev.bgColor} border-0`}>
            <span className="mr-1">{sev.icon}</span>{sev.label}
          </Badge>
          {catConfig && (
            <Badge variant="outline" className="text-xs shrink-0">
              <span className="mr-1">{catConfig.icon}</span>{catConfig.label}
            </Badge>
          )}
          <span className="text-sm font-medium truncate flex-1">{finding.title}</span>
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-3 pb-3 space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-2">{finding.description}</p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 p-2">
              <span className="font-medium text-gray-500">Endpoint:</span>
              <code className="block mt-0.5 text-gray-700 dark:text-gray-300 break-all">{(finding.endpoint ?? "").substring(0, 150)}</code>
            </div>
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 p-2">
              <span className="font-medium text-gray-500">Method:</span>
              <p className="mt-0.5 text-gray-700 dark:text-gray-300">{finding.method}</p>
            </div>
          </div>

          {finding.evidence && (
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 p-2">
              <span className="text-xs font-medium text-gray-500">Evidence:</span>
              <code className="block text-xs mt-0.5 text-gray-700 dark:text-gray-300 break-all">{(finding.evidence ?? "").substring(0, 300)}</code>
            </div>
          )}

          <div className="rounded-md bg-green-50 dark:bg-green-950/20 p-2">
            <span className="text-xs font-medium text-green-700 dark:text-green-400">Recommendation:</span>
            <p className="text-xs mt-0.5 text-green-800 dark:text-green-300">{finding.recommendation}</p>
          </div>

          {finding.reference && (
            <a href={finding.reference} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              <ExternalLink className="w-3 h-3" />Learn more
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────

export default function APIProbePanel({ projectId, url }: APIProbePanelProps) {
  const [probes, setProbes] = useState<APIProbeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "api" | "csrf" | "rate_limit" | "idor">("all");
  const [probeDepth, setProbeDepth] = useState<"quick" | "standard" | "deep">("standard");
  const [latestResult, setLatestResult] = useState<APIProbeData | null>(null);

  const loadProbes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/security/api-probes?projectId=${projectId}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setProbes(data.probes ?? []);
        if (data.probes?.length > 0) {
          const detailRes = await fetch(`/api/security/api-probes/${data.probes[0].id}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setLatestResult(detailData.probe as APIProbeData);
          }
        }
      }
    } catch (error) { console.error("Failed to load API probes:", error); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { loadProbes(); }, [loadProbes]);

  const handleRunProbe = useCallback(async () => {
    if (!url) return;
    setProbing(true);
    try {
      const res = await fetch("/api/security/api-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, url, probeDepth, checkAPISecurity: true, checkCSRF: true, checkRateLimit: true, checkIDOR: true }),
      });
      if (res.ok) {
        const result = await res.json();
        setLatestResult({
          id: `apiprobe-${Date.now()}`, status: "completed", url,
          overallScore: result.overallScore ?? 0, apiSecurityScore: result.apiSecurityScore ?? 0,
          csrfScore: result.csrfScore ?? 0, rateLimitScore: result.rateLimitScore ?? 0,
          idorScore: result.idorScore ?? 0, apiFindings: result.apiFindings ?? [],
          csrfFindings: result.csrfFindings ?? [], rateLimitFindings: result.rateLimitFindings ?? [],
          idorFindings: result.idorFindings ?? [], endpoints: result.endpoints ?? [],
          recommendations: result.recommendations ?? [], duration: result.duration ?? 0,
          llmUsed: result.llmUsed ?? false, error: result.error, createdAt: new Date().toISOString(),
        });
        await loadProbes();
      }
    } catch (error) { console.error("Failed to run API probe:", error); }
    finally { setProbing(false); }
  }, [projectId, url, probeDepth, loadProbes]);

  const apiFindings = latestResult?.apiFindings ?? [];
  const csrfFindings = latestResult?.csrfFindings ?? [];
  const rateLimitFindings = latestResult?.rateLimitFindings ?? [];
  const idorFindings = latestResult?.idorFindings ?? [];
  const allFindings = [...apiFindings, ...csrfFindings, ...rateLimitFindings, ...idorFindings];

  const filteredFindings = categoryFilter === "all" ? allFindings
    : categoryFilter === "api" ? apiFindings
    : categoryFilter === "csrf" ? csrfFindings
    : categoryFilter === "rate_limit" ? rateLimitFindings
    : idorFindings;

  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950/20">
            <Server className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <CardTitle className="text-base">API Security Probe</CardTitle>
            <CardDescription className="text-xs">
              API endpoints, CSRF, rate limiting &amp; IDOR
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Button size="sm" className="h-7 text-xs gap-1" onClick={handleRunProbe} disabled={probing || !url}>
            {probing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Server className="w-3 h-3" />}
            Run Probe
          </Button>

          <div className="flex gap-0.5 rounded-md border text-xs">
            {(["quick", "standard", "deep"] as const).map((depth) => (
              <button key={depth} className={`px-2 py-1 text-xs capitalize transition-colors ${
                probeDepth === depth ? "bg-primary text-primary-foreground rounded-sm" : "text-muted-foreground hover:bg-muted"
              }`} onClick={() => setProbeDepth(depth)}>{depth}</button>
            ))}
          </div>

          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={loadProbes} disabled={loading}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />Refresh
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
            <Server className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No API security probe yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              {url ? "Click 'Run Probe' to test API endpoints, CSRF, rate limiting & IDOR."
                : "Set a sandbox URL to enable API security probing."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Score Row */}
            <div className="flex items-center justify-around">
              <MiniScore score={latestResult.overallScore} label="Overall" size={56} />
              <MiniScore score={latestResult.apiSecurityScore} label="API" />
              <MiniScore score={latestResult.csrfScore} label="CSRF" />
              <MiniScore score={latestResult.rateLimitScore} label="Rate Limit" />
              <MiniScore score={latestResult.idorScore} label="IDOR" />
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Globe className="w-3 h-3" />{latestResult.endpoints?.length ?? 0} endpoints
              </span>
              <span className="text-muted-foreground">{latestResult.duration}ms</span>
              {latestResult.llmUsed && (
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200">AI Enhanced</Badge>
              )}
            </div>

            {/* Severity Summary */}
            {allFindings.length > 0 && (
              <div className="flex items-center gap-3 text-xs">
                {criticalCount > 0 && (
                  <span className="flex items-center gap-1 text-red-600"><AlertTriangle className="w-3 h-3" />{criticalCount} critical</span>
                )}
                {highCount > 0 && (
                  <span className="flex items-center gap-1 text-orange-600"><AlertTriangle className="w-3 h-3" />{highCount} high</span>
                )}
                <span className="text-muted-foreground">{allFindings.length} finding{allFindings.length !== 1 ? "s" : ""}</span>
              </div>
            )}

            {/* Category Filter Tabs */}
            <div className="flex gap-1 flex-wrap">
              <button className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                categoryFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`} onClick={() => setCategoryFilter("all")}>All ({allFindings.length})</button>
              <button className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                categoryFilter === "api" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`} onClick={() => setCategoryFilter("api")}><Server className="w-3 h-3" />API ({apiFindings.length})</button>
              <button className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                categoryFilter === "csrf" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`} onClick={() => setCategoryFilter("csrf")}><ShieldCheck className="w-3 h-3" />CSRF ({csrfFindings.length})</button>
              <button className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                categoryFilter === "rate_limit" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`} onClick={() => setCategoryFilter("rate_limit")}><Gauge className="w-3 h-3" />Rate ({rateLimitFindings.length})</button>
              <button className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                categoryFilter === "idor" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`} onClick={() => setCategoryFilter("idor")}><Key className="w-3 h-3" />IDOR ({idorFindings.length})</button>
            </div>

            {/* Findings List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredFindings.map((finding, i) => (
                <FindingCard key={`f-${i}`} finding={finding as any}
                  category={apiFindings.includes(finding as any) ? "api"
                    : csrfFindings.includes(finding as any) ? "csrf"
                    : rateLimitFindings.includes(finding as any) ? "rate_limit" : "idor"} />
              ))}
              {filteredFindings.length === 0 && allFindings.length > 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No findings in this category.</p>
              )}
              {allFindings.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-green-600 font-medium">No API security vulnerabilities found!</p>
                  <p className="text-xs text-muted-foreground mt-1">The API passed all security checks.</p>
                </div>
              )}
            </div>

            {/* Recommendations */}
            {latestResult.recommendations?.length > 0 && (
              <div className="pt-3 border-t space-y-1">
                <h5 className="text-xs font-semibold text-gray-500">Recommendations</h5>
                {latestResult.recommendations.map((rec, i) => (
                  <p key={i} className="text-xs text-gray-600 dark:text-gray-400">• {rec}</p>
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
                      <Badge variant="outline" className={`text-xs shrink-0 ${
                        probe.status === "completed" ? "bg-green-50 text-green-700"
                        : probe.status === "failed" ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-700"
                      }`}>{probe.status}</Badge>
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
