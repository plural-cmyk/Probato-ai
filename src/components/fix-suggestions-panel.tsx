"use client";

/**
 * Probato Fix Suggestion Panel
 *
 * Displays AI-generated fix suggestions for failed test results.
 * Features:
 *  - Confidence indicator with color coding
 *  - Diff viewer (side-by-side or inline)
 *  - Approve/Reject/Apply action buttons
 *  - Fix type badges
 *  - Expandable reasoning section
 *  - Suggestion history with status tracking
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Lightbulb, CheckCircle2, XCircle, Play, ChevronRight, ChevronDown,
  Loader2, AlertTriangle, Code2, FileCode2, Wrench, Settings, Link2,
  Shield, ThumbsUp, ThumbsDown, RotateCcw, Eye, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

// ── Types ────────────────────────────────────────────────────────

interface FixSuggestionData {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  confidence: number;
  diff?: string | null;
  originalCode?: string | null;
  suggestedCode?: string | null;
  reasoning?: string | null;
  errorMessage?: string | null;
  stepIndex?: number | null;
  reviewNote?: string | null;
  appliedAt?: string | null;
  createdAt: string;
  testResult?: {
    id: string;
    testName: string;
    status: string;
    error?: string | null;
  } | null;
  testCase?: {
    id: string;
    name: string;
  } | null;
}

interface FixSuggestionsPanelProps {
  projectId: string;
  testRunId?: string;
  onSuggestionApplied?: () => void;
}

// ── Fix Type Config ──────────────────────────────────────────────

const FIX_TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bgColor: string }> = {
  selector_fix: {
    icon: <Code2 className="w-3.5 h-3.5" />,
    label: "Selector Fix",
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
  },
  assertion_fix: {
    icon: <Shield className="w-3.5 h-3.5" />,
    label: "Assertion Fix",
    color: "text-amber-600",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
  },
  code_fix: {
    icon: <FileCode2 className="w-3.5 h-3.5" />,
    label: "Code Fix",
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-950/20",
  },
  config_fix: {
    icon: <Settings className="w-3.5 h-3.5" />,
    label: "Config Fix",
    color: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-950/20",
  },
  dependency_fix: {
    icon: <Link2 className="w-3.5 h-3.5" />,
    label: "Dependency Fix",
    color: "text-orange-600",
    bgColor: "bg-orange-50 dark:bg-orange-950/20",
  },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  pending: {
    label: "Pending Review",
    color: "text-amber-700",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  approved: {
    label: "Approved",
    color: "text-blue-700",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    icon: <ThumbsUp className="w-3.5 h-3.5" />,
  },
  rejected: {
    label: "Rejected",
    color: "text-red-700",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    icon: <ThumbsDown className="w-3.5 h-3.5" />,
  },
  applied: {
    label: "Applied",
    color: "text-green-700",
    bgColor: "bg-green-50 dark:bg-green-950/20",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  failed: {
    label: "Failed",
    color: "text-red-700",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

// ── Confidence Indicator ─────────────────────────────────────────

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100);
  let color = "text-gray-500";
  let barColor = "bg-gray-400";
  let label = "Uncertain";

  if (percentage >= 90) {
    color = "text-green-600";
    barColor = "bg-green-500";
    label = "Very Confident";
  } else if (percentage >= 70) {
    color = "text-blue-600";
    barColor = "bg-blue-500";
    label = "Confident";
  } else if (percentage >= 50) {
    color = "text-amber-600";
    barColor = "bg-amber-500";
    label = "Possible";
  } else {
    color = "text-red-600";
    barColor = "bg-red-500";
    label = "Uncertain";
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percentage}%` }} />
      </div>
      <span className={`text-xs font-medium ${color}`}>{percentage}%</span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}

// ── Diff Viewer ──────────────────────────────────────────────────

function DiffViewer({ diff }: { diff: string }) {
  if (!diff) return null;

  const lines = diff.split("\n");

  return (
    <div className="rounded-md border overflow-hidden text-xs font-mono">
      <div className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs text-gray-500 border-b">
        Diff
      </div>
      <div className="max-h-60 overflow-y-auto">
        {lines.map((line, i) => {
          let lineClass = "px-3 py-0.5";
          if (line.startsWith("+") && !line.startsWith("+++")) {
            lineClass += " bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400";
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            lineClass += " bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400";
          } else if (line.startsWith("@@")) {
            lineClass += " bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400";
          } else {
            lineClass += " text-gray-600 dark:text-gray-400";
          }

          return (
            <div key={i} className={lineClass}>
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Code Block ───────────────────────────────────────────────────

function CodeBlock({ label, code }: { label: string; code: string }) {
  if (!code) return null;

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs text-gray-500 border-b flex items-center gap-1.5">
        <FileCode2 className="w-3 h-3" />
        {label}
      </div>
      <pre className="px-3 py-2 text-xs font-mono overflow-x-auto max-h-40 bg-zinc-950 text-zinc-100">
        {code.substring(0, 3000)}
        {code.length > 3000 ? "\n... (truncated)" : ""}
      </pre>
    </div>
  );
}

// ── Single Suggestion Card ───────────────────────────────────────

function SuggestionCard({
  suggestion,
  onApprove,
  onReject,
  onApply,
  isProcessing,
}: {
  suggestion: FixSuggestionData;
  onApprove: (id: string) => void;
  onReject: (id: string, note?: string) => void;
  onApply: (id: string) => void;
  isProcessing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showDiff, setShowDiff] = useState(false);

  const typeConfig = FIX_TYPE_CONFIG[suggestion.type] ?? FIX_TYPE_CONFIG.code_fix;
  const statusConfig = STATUS_CONFIG[suggestion.status] ?? STATUS_CONFIG.pending;
  const isPending = suggestion.status === "pending";
  const isApproved = suggestion.status === "approved";
  const isApplied = suggestion.status === "applied";
  const hasDiff = !!suggestion.diff;
  const hasCode = !!suggestion.originalCode || !!suggestion.suggestedCode;

  return (
    <div className="rounded-lg border bg-white dark:bg-zinc-900">
      {/* Header */}
      <button
        className="w-full px-3 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-2">
          <div className={`flex items-center justify-center w-7 h-7 rounded-md shrink-0 mt-0.5 ${typeConfig.bgColor} ${typeConfig.color}`}>
            {typeConfig.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium truncate">{suggestion.title}</span>
              <Badge variant="outline" className={`text-xs shrink-0 ${statusConfig.color} ${statusConfig.bgColor} border-0`}>
                <span className="mr-1">{statusConfig.icon}</span>
                {statusConfig.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={`text-xs shrink-0 ${typeConfig.color} ${typeConfig.bgColor}`}>
                {typeConfig.label}
              </Badge>
              <ConfidenceIndicator confidence={suggestion.confidence} />
            </div>
            {suggestion.errorMessage && (
              <p className="text-xs text-red-500 mt-1 truncate">
                Error: {suggestion.errorMessage.substring(0, 100)}
              </p>
            )}
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t px-3 pb-3 space-y-3">
          {/* Description */}
          <div className="pt-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {suggestion.description}
            </p>
          </div>

          {/* Reasoning */}
          {suggestion.reasoning && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Lightbulb className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-400">AI Reasoning</span>
              </div>
              <p className="text-xs text-blue-800 dark:text-blue-300">{suggestion.reasoning}</p>
            </div>
          )}

          {/* Diff Toggle */}
          {(hasDiff || hasCode) && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setShowDiff(!showDiff)}
              >
                <Eye className="w-3 h-3" />
                {showDiff ? "Hide" : "Show"} {hasDiff ? "Diff" : "Code Changes"}
              </Button>

              {showDiff && (
                <div className="mt-2 space-y-2">
                  {suggestion.diff && <DiffViewer diff={suggestion.diff} />}
                  {suggestion.originalCode && (
                    <CodeBlock label="Original Code" code={suggestion.originalCode} />
                  )}
                  {suggestion.suggestedCode && (
                    <CodeBlock label="Suggested Code" code={suggestion.suggestedCode} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Review Note (if any) */}
          {suggestion.reviewNote && (
            <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-md p-2">
              <span className="font-medium">Review Note:</span> {suggestion.reviewNote}
            </div>
          )}

          {/* Applied Info */}
          {isApplied && suggestion.appliedAt && (
            <div className="text-xs text-green-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              Applied on {new Date(suggestion.appliedAt).toLocaleString()}
              {suggestion.testCase && (
                <span className="text-gray-400 ml-1">
                  (Test case: {suggestion.testCase.name})
                </span>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {isPending && (
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => onApprove(suggestion.id)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ThumbsUp className="w-3 h-3" />
                )}
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setShowRejectNote(!showRejectNote)}
                disabled={isProcessing}
              >
                <ThumbsDown className="w-3 h-3" />
                Reject
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => onApply(suggestion.id)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                Apply Fix
              </Button>
            </div>
          )}

          {isApproved && !isApplied && (
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => onApply(suggestion.id)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                Apply Fix
              </Button>
              <span className="text-xs text-gray-400">This suggestion has been approved and is ready to apply.</span>
            </div>
          )}

          {/* Reject Note Input */}
          {showRejectNote && (
            <div className="space-y-2 pt-1">
              <Textarea
                placeholder="Optional: Why are you rejecting this fix? (helps improve suggestions)"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="text-xs min-h-[60px]"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    onReject(suggestion.id, rejectNote || undefined);
                    setShowRejectNote(false);
                    setRejectNote("");
                  }}
                  disabled={isProcessing}
                >
                  Confirm Reject
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setShowRejectNote(false);
                    setRejectNote("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Timestamp */}
          <div className="text-xs text-gray-400 pt-1">
            Created {new Date(suggestion.createdAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Panel Component ─────────────────────────────────────────

export default function FixSuggestionsPanel({
  projectId,
  testRunId,
  onSuggestionApplied,
}: FixSuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<FixSuggestionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "applied" | "rejected">("all");
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  // Load suggestions
  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ projectId, limit: "50" });
      if (testRunId) params.set("testRunId", testRunId);
      if (filter !== "all") params.set("status", filter);

      const res = await fetch(`/api/fix-suggestions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      }
    } catch (error) {
      console.error("Failed to load fix suggestions:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId, testRunId, filter]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  // Approve suggestion
  const handleApprove = useCallback(async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/fix-suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (res.ok) {
        await loadSuggestions();
      }
    } catch (error) {
      console.error("Failed to approve suggestion:", error);
    } finally {
      setProcessingId(null);
    }
  }, [loadSuggestions]);

  // Reject suggestion
  const handleReject = useCallback(async (id: string, note?: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/fix-suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", reviewNote: note }),
      });
      if (res.ok) {
        await loadSuggestions();
      }
    } catch (error) {
      console.error("Failed to reject suggestion:", error);
    } finally {
      setProcessingId(null);
    }
  }, [loadSuggestions]);

  // Apply suggestion
  const handleApply = useCallback(async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/fix-suggestions/${id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await loadSuggestions();
        onSuggestionApplied?.();
      }
    } catch (error) {
      console.error("Failed to apply suggestion:", error);
    } finally {
      setProcessingId(null);
    }
  }, [loadSuggestions, onSuggestionApplied]);

  // Generate fix suggestions for a test result
  const handleGenerateForResult = useCallback(async (
    testResultId: string,
    testRunIdForGen: string,
    stepIndex: number
  ) => {
    setGeneratingFor(testResultId);
    try {
      const res = await fetch("/api/fix-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testResultId,
          testRunId: testRunIdForGen,
          projectId,
          stepIndex,
        }),
      });
      if (res.ok) {
        await loadSuggestions();
      }
    } catch (error) {
      console.error("Failed to generate fix suggestions:", error);
    } finally {
      setGeneratingFor(null);
    }
  }, [projectId, loadSuggestions]);

  // Stats
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const approvedCount = suggestions.filter((s) => s.status === "approved").length;
  const appliedCount = suggestions.filter((s) => s.status === "applied").length;
  const rejectedCount = suggestions.filter((s) => s.status === "rejected").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/10">
            <Lightbulb className="h-4 w-4 text-amber" />
          </div>
          <div>
            <CardTitle className="text-base">Fix Suggestions ({suggestions.length})</CardTitle>
            <CardDescription className="text-xs">
              AI-powered fix suggestions for failed tests
            </CardDescription>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 mt-3">
          {[
            { key: "all", label: "All", count: suggestions.length },
            { key: "pending", label: "Pending", count: pendingCount },
            { key: "approved", label: "Approved", count: approvedCount },
            { key: "applied", label: "Applied", count: appliedCount },
            { key: "rejected", label: "Rejected", count: rejectedCount },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              onClick={() => setFilter(key as typeof filter)}
            >
              {label} {count > 0 && `(${count})`}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No fix suggestions yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Fix suggestions are automatically generated when tests fail.
              Run a test to see AI-powered suggestions here.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onApprove={handleApprove}
                onReject={handleReject}
                onApply={handleApply}
                isProcessing={processingId === suggestion.id}
              />
            ))}
          </div>
        )}

        {/* Summary Footer */}
        {suggestions.length > 0 && (
          <div className="mt-4 pt-3 border-t flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              {pendingCount} pending
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="w-3 h-3 text-blue-500" />
              {approvedCount} approved
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              {appliedCount} applied
            </span>
            <span className="flex items-center gap-1">
              <ThumbsDown className="w-3 h-3 text-red-500" />
              {rejectedCount} rejected
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
