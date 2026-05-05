"use client";

/**
 * MessagingTestPanel — Cross-Device Messaging & Notification Testing (M26)
 *
 * Features:
 * - Run new messaging tests with configurable selectors
 * - Visualize conversation flow between sender/receiver
 * - Message, notification, and delivery check results
 * - Test session history
 * - LLM-generated insights
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
import {
  MessageSquare,
  Play,
  RefreshCw,
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Send,
  ArrowRight,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Settings2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────

interface MessageCheckResult {
  check: string;
  status: "passed" | "failed" | "skipped";
  details: string;
  latencyMs?: number;
}

interface NotificationCheckResult {
  type: string;
  status: "passed" | "failed" | "skipped";
  details: string;
  latencyMs?: number;
}

interface DeliveryCheckResult {
  type: string;
  status: "passed" | "failed" | "skipped";
  details: string;
  latencyMs?: number;
}

interface ConversationEvent {
  timestamp: number;
  agent: string;
  action: string;
  details: string;
}

interface MessagingSessionInfo {
  id: string;
  status: string;
  url: string;
  testMessage: string;
  messageDeliveryMs: number;
  notificationDeliveryMs: number;
  conversationFlow: ConversationEvent[];
  messageChecks: MessageCheckResult[];
  notificationChecks: NotificationCheckResult[];
  deliveryChecks: DeliveryCheckResult[];
  overallScore: number;
  messageScore: number;
  notificationScore: number;
  deliveryScore: number;
  findings: { type: string; severity: string; title: string; description: string; agents: string[] }[];
  recommendations: string[];
  summary?: string;
  llmUsed: boolean;
  duration: number;
  createdAt: string;
  orchestratedSession?: {
    sandboxes: { id: string; agentRole: string; status: string; score: number }[];
  };
}

interface MessagingTestPanelProps {
  projectId: string;
  url?: string;
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

function CheckStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "passed":
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
    case "failed":
      return <XCircle className="w-3.5 h-3.5 text-red-600" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-gray-400" />;
  }
}

function FlowEvent({ event }: { event: ConversationEvent }) {
  const isSender = event.agent === "sender";
  return (
    <div className={`flex items-start gap-2 ${isSender ? "flex-row" : "flex-row-reverse"}`}>
      <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        isSender ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
      }`}>
        {isSender ? "S" : "R"}
      </div>
      <div className={`max-w-[80%] rounded-lg p-2 text-xs ${
        isSender ? "bg-blue-50 text-blue-800" : "bg-green-50 text-green-800"
      }`}>
        <p className="font-medium">{event.action}</p>
        {event.details && <p className="text-[10px] mt-0.5 opacity-70">{event.details}</p>}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function MessagingTestPanel({ projectId, url }: MessagingTestPanelProps) {
  const [sessions, setSessions] = useState<MessagingSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedSession, setSelectedSession] = useState<MessagingSessionInfo | null>(null);
  const [targetUrl, setTargetUrl] = useState(url ?? "");
  const [testMessage, setTestMessage] = useState("PROBATO_TEST_MSG_2024");
  const [showConfig, setShowConfig] = useState(false);
  const [chatInputSelector, setChatInputSelector] = useState("");
  const [notificationBadgeSelector, setNotificationBadgeSelector] = useState("");
  const [deliveryReceiptSelector, setDeliveryReceiptSelector] = useState("");

  useEffect(() => {
    if (url) setTargetUrl(url);
  }, [url]);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/orchestrator/messaging?projectId=${projectId}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
        if (data.sessions?.length > 0 && !selectedSession) {
          loadSessionDetail(data.sessions[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load messaging sessions:", err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadSessionDetail = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/orchestrator/messaging/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSession(data);
      }
    } catch (err) {
      console.error("Failed to load messaging session detail:", err);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleRunTest = async () => {
    if (!targetUrl) return;
    setRunning(true);
    try {
      const res = await fetch("/api/orchestrator/messaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          url: targetUrl,
          testMessage: testMessage || undefined,
          chatInputSelector: chatInputSelector || undefined,
          notificationBadgeSelector: notificationBadgeSelector || undefined,
          deliveryReceiptSelector: deliveryReceiptSelector || undefined,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        await loadSessions();
        if (result.id) {
          await loadSessionDetail(result.id);
        }
      } else {
        const err = await res.json();
        console.error("Messaging test failed:", err.error);
      }
    } catch (err) {
      console.error("Failed to run messaging test:", err);
    } finally {
      setRunning(false);
    }
  };

  const getScoreColor = (score: number) =>
    score >= 80 ? "#22c55e" : score >= 50 ? "#eab308" : score >= 25 ? "#f97316" : "#ef4444";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-lg">Cross-Device Messaging Test</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={loadSessions} disabled={loading}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <CardDescription>Test messaging flows across two browser sandboxes with delivery verification</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Test Config */}
        <div className="space-y-2">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Target URL</label>
              <Input
                placeholder="https://chat.example.com"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-48">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Test Message</label>
              <Input
                placeholder="PROBATO_TEST_MSG"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="h-9"
              />
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setShowConfig(!showConfig)}>
              <Settings2 className="w-4 h-4" />
            </Button>
            <Button onClick={handleRunTest} disabled={running || !targetUrl} size="sm" className="h-9">
              {running ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              {running ? "Testing..." : "Run Test"}
            </Button>
          </div>

          {/* Advanced Config */}
          {showConfig && (
            <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
              <p className="text-xs font-medium text-gray-500">Advanced Selectors (optional)</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 mb-0.5 block">Chat Input</label>
                  <Input
                    placeholder="textarea.chat-input"
                    value={chatInputSelector}
                    onChange={(e) => setChatInputSelector(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 mb-0.5 block">Notification Badge</label>
                  <Input
                    placeholder=".notification-badge"
                    value={notificationBadgeSelector}
                    onChange={(e) => setNotificationBadgeSelector(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 mb-0.5 block">Delivery Receipt</label>
                  <Input
                    placeholder=".delivery-tick"
                    value={deliveryReceiptSelector}
                    onChange={(e) => setDeliveryReceiptSelector(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Selected Session Detail */}
        {selectedSession && (
          <div className="border rounded-lg p-4 space-y-3">
            {/* Score Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold" style={{ color: getScoreColor(selectedSession.overallScore) }}>
                  {selectedSession.overallScore}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    <Badge variant="outline" className={`text-xs ${
                      selectedSession.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {selectedSession.status}
                    </Badge>
                    {selectedSession.llmUsed && (
                      <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700">AI</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedSession.duration > 0 && `${(selectedSession.duration / 1000).toFixed(1)}s`}
                    {selectedSession.messageDeliveryMs > 0 && ` • ${selectedSession.messageDeliveryMs}ms delivery`}
                  </p>
                </div>
              </div>
            </div>

            {/* Score Bars */}
            <div className="grid grid-cols-3 gap-3">
              <ScoreBar score={selectedSession.messageScore} label="Message" color={getScoreColor(selectedSession.messageScore)} />
              <ScoreBar score={selectedSession.notificationScore} label="Notification" color={getScoreColor(selectedSession.notificationScore)} />
              <ScoreBar score={selectedSession.deliveryScore} label="Delivery" color={getScoreColor(selectedSession.deliveryScore)} />
            </div>

            {/* Summary */}
            {selectedSession.summary && (
              <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{selectedSession.summary}</p>
            )}

            {/* Agent Sandboxes */}
            {selectedSession.orchestratedSession?.sandboxes && (
              <div className="flex gap-2">
                {selectedSession.orchestratedSession.sandboxes.map((sandbox) => (
                  <div key={sandbox.id} className="flex-1 border rounded p-2 flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      sandbox.agentRole === "sender" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                    }`}>
                      {sandbox.agentRole === "sender" ? "S" : "R"}
                    </div>
                    <div>
                      <p className="text-xs font-medium capitalize">{sandbox.agentRole}</p>
                      <p className="text-[10px] text-gray-400">{sandbox.score}/100</p>
                    </div>
                    {sandbox.status === "done" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600 ml-auto" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-600 ml-auto" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Conversation Flow */}
            {selectedSession.conversationFlow && selectedSession.conversationFlow.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-sm font-medium flex items-center gap-1">
                  <ArrowRight className="w-3.5 h-3.5" /> Conversation Flow
                </h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {selectedSession.conversationFlow.map((event, i) => (
                    <FlowEvent key={i} event={event} />
                  ))}
                </div>
              </div>
            )}

            {/* Check Results */}
            <div className="grid grid-cols-3 gap-3">
              {/* Message Checks */}
              <div className="space-y-1">
                <h5 className="text-xs font-medium flex items-center gap-1">
                  <Send className="w-3 h-3" /> Message
                </h5>
                {selectedSession.messageChecks.map((check, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px]">
                    <CheckStatusIcon status={check.status} />
                    <span className="truncate">{check.check.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
              {/* Notification Checks */}
              <div className="space-y-1">
                <h5 className="text-xs font-medium flex items-center gap-1">
                  <Bell className="w-3 h-3" /> Notification
                </h5>
                {selectedSession.notificationChecks.map((check, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px]">
                    <CheckStatusIcon status={check.status} />
                    <span className="truncate capitalize">{check.type}</span>
                  </div>
                ))}
              </div>
              {/* Delivery Checks */}
              <div className="space-y-1">
                <h5 className="text-xs font-medium flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Delivery
                </h5>
                {selectedSession.deliveryChecks.map((check, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px]">
                    <CheckStatusIcon status={check.status} />
                    <span className="truncate capitalize">{check.type}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Findings */}
            {selectedSession.findings && selectedSession.findings.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Findings ({selectedSession.findings.length})</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {selectedSession.findings.slice(0, 10).map((f, i) => (
                    <div key={i} className="border rounded p-2 text-xs">
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className={`text-[10px] ${
                          f.severity === "high" ? "bg-orange-100 text-orange-700" :
                          f.severity === "medium" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-700"
                        }`}>
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
            {selectedSession.recommendations && selectedSession.recommendations.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Recommendations</h4>
                <ul className="space-y-0.5">
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
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No messaging tests yet</p>
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
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border"
                      style={{ borderColor: getScoreColor(s.overallScore), color: getScoreColor(s.overallScore) }}>
                      {s.overallScore}
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        <span className="text-xs font-medium">Messaging Test</span>
                        <Badge variant="outline" className={`text-[10px] ${
                          s.status === "completed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}>
                          {s.status}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-gray-400">
                        {new Date(s.createdAt).toLocaleDateString()} • {s.messageScore}m/{s.notificationScore}n/{s.deliveryScore}d
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
