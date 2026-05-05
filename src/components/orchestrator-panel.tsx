"use client";

/**
 * OrchestratorPanel — Multi-device orchestrated test dashboard (M25)
 *
 * Features:
 * - Overall session score as circular gauge
 * - Agent sandbox cards with status, role, score
 * - Sync event log timeline
 * - Scenario type selector (messaging, call, payment, custom)
 * - Session history list
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Monitor,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Users,
  Radio,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────

interface SandboxInfo {
  id: string;
  agentRole: string;
  status: string;
  score: number;
}

interface SessionInfo {
  id: string;
  scenarioType: string;
  status: string;
  url: string;
  overallScore: number;
  summary?: string;
  findings: { type: string; severity: string; title: string; description: string; agents: string[] }[];
  recommendations: string[];
  llmUsed: boolean;
  duration: number;
  sandboxes: SandboxInfo[];
  _count?: { syncEvents: number };
  createdAt: string;
}

interface OrchestratorPanelProps {
  projectId: string;
  url?: string;
}

// ── Sub-Components ─────────────────────────────────────────────

function ScoreCircle({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80 ? "#22c55e" : score >= 50 ? "#eab308" : score >= 25 ? "#f97316" : "#ef4444";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e7eb" strokeWidth="4" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth="4"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-current font-bold"
        style={{ fontSize: size * 0.28, transform: "rotate(90deg)", transformOrigin: "center" }}
        fill={color}
      >
        {score}
      </text>
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { color: string; icon: React.ReactNode }> = {
    pending: { color: "bg-gray-100 text-gray-700", icon: <Clock className="w-3 h-3" /> },
    running: { color: "bg-blue-100 text-blue-700", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    completed: { color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-3 h-3" /> },
    failed: { color: "bg-red-100 text-red-700", icon: <XCircle className="w-3 h-3" /> },
    aborted: { color: "bg-orange-100 text-orange-700", icon: <AlertTriangle className="w-3 h-3" /> },
    provisioning: { color: "bg-purple-100 text-purple-700", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    ready: { color: "bg-cyan-100 text-cyan-700", icon: <CircleDot className="w-3 h-3" /> },
    done: { color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-3 h-3" /> },
    error: { color: "bg-red-100 text-red-700", icon: <XCircle className="w-3 h-3" /> },
  };
  const v = variants[status] ?? { color: "bg-gray-100 text-gray-700", icon: <CircleDot className="w-3 h-3" /> };

  return (
    <Badge variant="outline" className={`${v.color} text-xs gap-1`}>
      {v.icon}
      {status}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-800 border-red-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    low: "bg-blue-100 text-blue-800 border-blue-200",
    info: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return (
    <Badge variant="outline" className={`${colors[severity] ?? colors.info} text-xs`}>
      {severity}
    </Badge>
  );
}

function ScenarioIcon({ type }: { type: string }) {
  switch (type) {
    case "messaging": return <Radio className="w-4 h-4" />;
    case "call": return <Monitor className="w-4 h-4" />;
    case "payment": return <CircleDot className="w-4 h-4" />;
    default: return <Users className="w-4 h-4" />;
  }
}

function FindingCard({ finding }: { finding: { type: string; severity: string; title: string; description: string; agents: string[] } }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
      <div
        className="flex items-start justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <span className="text-sm font-medium">{finding.title}</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>
      {expanded && (
        <div className="mt-2 space-y-1">
          <p className="text-sm text-gray-600">{finding.description}</p>
          <div className="flex gap-1">
            {finding.agents.map((a) => (
              <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>
            ))}
          </div>
          <Badge variant="outline" className="text-xs">{finding.type}</Badge>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function OrchestratorPanel({ projectId, url }: OrchestratorPanelProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [scenarioType, setScenarioType] = useState<string>("custom");
  const [targetUrl, setTargetUrl] = useState(url ?? "");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Update URL prop
  useEffect(() => {
    if (url) setTargetUrl(url);
  }, [url]);

  // Load sessions
  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/orchestrator/sessions?projectId=${projectId}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
        if (data.sessions?.length > 0 && !selectedSession) {
          // Load detail for the most recent session
          const latestId = data.sessions[0].id;
          loadSessionDetail(latestId);
        }
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadSessionDetail = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/orchestrator/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSession(data);
      }
    } catch (err) {
      console.error("Failed to load session detail:", err);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Run new session
  const handleRunSession = async () => {
    if (!targetUrl) return;
    setRunning(true);
    try {
      const res = await fetch("/api/orchestrator/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          url: targetUrl,
          scenarioType,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        await loadSessions();
        if (result.sessionId) {
          await loadSessionDetail(result.sessionId);
        }
      } else {
        const err = await res.json();
        console.error("Session failed:", err.error);
      }
    } catch (err) {
      console.error("Failed to run session:", err);
    } finally {
      setRunning(false);
    }
  };

  // Abort session
  const handleAbort = async (sessionId: string) => {
    try {
      await fetch(`/api/orchestrator/sessions/${sessionId}/abort`, { method: "POST" });
      await loadSessions();
    } catch (err) {
      console.error("Abort failed:", err);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-lg">Multi-Device Orchestrator</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={loadSessions} disabled={loading}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <CardDescription>Orchestrate multi-browser test sessions with sync coordination</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* New Session Form */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Target URL</label>
            <Input
              placeholder="https://example.com"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="w-40">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Scenario</label>
            <Select value={scenarioType} onValueChange={setScenarioType}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="messaging">Messaging</SelectItem>
                <SelectItem value="call">Call Flow</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleRunSession} disabled={running || !targetUrl} size="sm" className="h-9">
            {running ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
            {running ? "Running..." : "Run Test"}
          </Button>
        </div>

        {/* Latest Session Detail */}
        {selectedSession && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ScoreCircle score={selectedSession.overallScore} size={56} />
                <div>
                  <div className="flex items-center gap-2">
                    <ScenarioIcon type={selectedSession.scenarioType} />
                    <span className="font-medium capitalize">{selectedSession.scenarioType}</span>
                    <StatusBadge status={selectedSession.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedSession.duration > 0 && `${(selectedSession.duration / 1000).toFixed(1)}s`}
                    {selectedSession.llmUsed && " • LLM analyzed"}
                    {selectedSession._count && ` • ${selectedSession._count.syncEvents} sync events`}
                  </p>
                </div>
              </div>
              {selectedSession.status === "running" && (
                <Button variant="destructive" size="sm" onClick={() => handleAbort(selectedSession.id)}>
                  Abort
                </Button>
              )}
            </div>

            {/* Summary */}
            {selectedSession.summary && (
              <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{selectedSession.summary}</p>
            )}

            {/* Agent Sandboxes */}
            {selectedSession.sandboxes && selectedSession.sandboxes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-1">
                  <Monitor className="w-3.5 h-3.5" /> Agents ({selectedSession.sandboxes.length})
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedSession.sandboxes.map((sandbox) => (
                    <div key={sandbox.id} className="border rounded p-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ScoreCircle score={sandbox.score} size={36} />
                        <div>
                          <p className="text-sm font-medium capitalize">{sandbox.agentRole}</p>
                          <StatusBadge status={sandbox.status} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Findings */}
            {selectedSession.findings && selectedSession.findings.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Findings ({selectedSession.findings.length})</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {selectedSession.findings.slice(0, 10).map((f, i) => (
                    <FindingCard key={i} finding={f} />
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {selectedSession.recommendations && selectedSession.recommendations.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Recommendations</h4>
                <ul className="space-y-1">
                  {selectedSession.recommendations.map((rec, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                      <span className="text-blue-500 mt-0.5">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Session History */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Session History</h4>
          {loading && sessions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No orchestrated sessions yet</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedSession?.id === s.id ? "bg-blue-50 border border-blue-200" : "border"
                  }`}
                  onClick={() => loadSessionDetail(s.id)}
                >
                  <div className="flex items-center gap-2">
                    <ScoreCircle score={s.overallScore} size={32} />
                    <div>
                      <div className="flex items-center gap-1">
                        <ScenarioIcon type={s.scenarioType} />
                        <span className="text-xs font-medium capitalize">{s.scenarioType}</span>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(s.createdAt).toLocaleDateString()} •{" "}
                        {s.sandboxes?.length ?? 0} agents
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-3 h-3 text-gray-400 transition-transform ${
                      expandedSession === s.id ? "rotate-180" : ""
                    }`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
