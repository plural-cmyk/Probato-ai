"use client";

/**
 * Probato Live Test View
 *
 * Real-time test execution viewer that streams step-by-step results
 * from the server. Shows:
 *  - Live browser screenshots as each step completes
 *  - Step-by-step progress feed with status icons
 *  - Console errors and network failures captured during execution
 *  - Step replay — click any completed step to see its screenshot
 *  - Cancel button to abort a running test
 *  - Overall progress bar and summary
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Play, Square, RotateCcw, CheckCircle2, XCircle, AlertTriangle,
  SkipForward, Clock, ChevronRight, ChevronDown,
  Globe, Terminal, Wifi, Loader2, Camera, Eye, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// ── Types ────────────────────────────────────────────────────────

interface LiveStep {
  index: number;
  action: { type: string; label: string; url?: string; value?: string };
  status: "pending" | "running" | "passed" | "failed" | "skipped" | "error";
  duration?: number;
  screenshot?: string;
  actualText?: string;
  actualUrl?: string;
  error?: string;
  consoleMessages: { level: string; text: string }[];
  networkRequests: { method: string; url: string; status: number }[];
}

interface LiveTestViewProps {
  /** Called when user starts a test run */
  onRunTest: (url: string, preset: string) => Promise<Response | null>;
  /** Whether a test is currently running */
  isRunning: boolean;
  /** Called when user cancels a test */
  onCancel: () => void;
  /** Called when the live test stream completes (success or error) */
  onComplete?: () => void;
}

// ── Status Icon Component ────────────────────────────────────────

function StepStatusIcon({ status }: { status: LiveStep["status"] }) {
  switch (status) {
    case "passed":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-500" />;
    case "error":
      return <AlertTriangle className="w-4 h-4 text-red-600" />;
    case "running":
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case "skipped":
      return <SkipForward className="w-4 h-4 text-gray-400" />;
    case "pending":
    default:
      return <Clock className="w-4 h-4 text-gray-300" />;
  }
}

function StepStatusBadge({ status }: { status: LiveStep["status"] }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    passed: "default",
    failed: "destructive",
    error: "destructive",
    running: "secondary",
    skipped: "outline",
    pending: "outline",
  };
  return (
    <Badge variant={variants[status] ?? "outline"} className="text-xs">
      {status}
    </Badge>
  );
}

// ── Action Type Icon ─────────────────────────────────────────────

function ActionTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "navigate":
    case "waitForNavigation":
      return <Globe className="w-3.5 h-3.5 text-blue-500" />;
    case "click":
    case "submit":
      return <Zap className="w-3.5 h-3.5 text-amber-500" />;
    case "fill":
    case "select":
    case "check":
    case "uncheck":
      return <Terminal className="w-3.5 h-3.5 text-purple-500" />;
    case "screenshot":
      return <Camera className="w-3.5 h-3.5 text-cyan-500" />;
    case "assertText":
    case "assertVisible":
    case "assertUrl":
      return <Eye className="w-3.5 h-3.5 text-green-600" />;
    case "wait":
    case "waitForSelector":
      return <Clock className="w-3.5 h-3.5 text-gray-500" />;
    default:
      return <Globe className="w-3.5 h-3.5 text-gray-400" />;
  }
}

// ── Main Component ───────────────────────────────────────────────

export default function LiveTestView({ onRunTest, isRunning, onCancel, onComplete }: LiveTestViewProps) {
  // ── State ──
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "passed" | "failed" | "error">("idle");
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [totalSteps, setTotalSteps] = useState(0);
  const [url, setUrl] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [consoleEvents, setConsoleEvents] = useState<{ level: string; text: string; stepIndex: number }[]>([]);
  const [networkEvents, setNetworkEvents] = useState<{ method: string; url: string; status: number; stepIndex: number }[]>([]);

  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Timer ──
  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startTimeRef.current);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // ── Reset state ──
  const resetState = useCallback(() => {
    setSteps([]);
    setRunId(null);
    setRunStatus("idle");
    setSelectedStep(null);
    setTotalSteps(0);
    setElapsed(0);
    setExpandedSteps(new Set());
    setConsoleEvents([]);
    setNetworkEvents([]);
  }, []);

  // ── Start Live Test ──
  const handleStartTest = useCallback(async () => {
    if (!url.trim()) return;

    resetState();
    setRunStatus("running");

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const response = await onRunTest(url, "smoke");

      if (!response || !response.body) {
        setRunStatus("error");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (each event is newline-delimited)
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);
            processEvent(event);
          } catch (parseError) {
            console.warn("[Live View] Failed to parse event:", line, parseError);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          processEvent(event);
        } catch { /* ignore */ }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        console.log("[Live View] Test cancelled by user");
      } else {
        console.error("[Live View] Stream error:", error);
        setRunStatus("error");
      }
    } finally {
      // Always notify parent that the stream has ended
      onComplete?.();
    }
  }, [url, onRunTest, resetState, onComplete]);

  // ── Process incoming events ──
  const processEvent = useCallback((event: Record<string, unknown>) => {
    switch (event.type) {
      case "run_start": {
        setRunId(event.runId as string);
        setTotalSteps(event.totalSteps as number);
        // Initialize steps array
        const initialSteps: LiveStep[] = [];
        for (let i = 0; i < (event.totalSteps as number); i++) {
          initialSteps.push({
            index: i,
            action: { type: "pending", label: `Step ${i + 1}` },
            status: "pending",
            consoleMessages: [],
            networkRequests: [],
          });
        }
        setSteps(initialSteps);
        break;
      }

      case "step_start": {
        const stepIndex = event.stepIndex as number;
        setSteps((prev) =>
          prev.map((s, i) =>
            i === stepIndex
              ? { ...s, status: "running", action: event.action as LiveStep["action"] }
              : s
          )
        );
        break;
      }

      case "step_complete": {
        const stepIndex = event.stepIndex as number;
        const stepData = event as Record<string, unknown>;
        setSteps((prev) =>
          prev.map((s, i) =>
            i === stepIndex
              ? {
                  ...s,
                  status: stepData.status as LiveStep["status"],
                  duration: stepData.duration as number,
                  screenshot: stepData.screenshot as string | undefined,
                  actualText: stepData.actualText as string | undefined,
                  actualUrl: stepData.actualUrl as string | undefined,
                  error: stepData.error as string | undefined,
                  action: stepData.action as LiveStep["action"],
                }
              : s
          )
        );

        // Auto-select first completed step
        setSelectedStep((prev) => prev ?? stepIndex);
        break;
      }

      case "step_skipped": {
        const stepIndex = event.stepIndex as number;
        setSteps((prev) =>
          prev.map((s, i) =>
            i === stepIndex
              ? { ...s, status: "skipped", action: (event as Record<string, unknown>).action as LiveStep["action"] }
              : s
          )
        );
        break;
      }

      case "console": {
        setConsoleEvents((prev) => [
          ...prev,
          {
            level: event.level as string,
            text: event.text as string,
            stepIndex: event.stepIndex as number,
          },
        ]);
        // Add to step's console messages
        const stepIndex = event.stepIndex as number;
        setSteps((prev) =>
          prev.map((s, i) =>
            i === stepIndex
              ? {
                  ...s,
                  consoleMessages: [
                    ...s.consoleMessages,
                    { level: event.level as string, text: event.text as string },
                  ],
                }
              : s
          )
        );
        break;
      }

      case "network": {
        setNetworkEvents((prev) => [
          ...prev,
          {
            method: event.method as string,
            url: event.url as string,
            status: event.status as number,
            stepIndex: event.stepIndex as number,
          },
        ]);
        // Add to step's network requests
        const stepIndex = event.stepIndex as number;
        setSteps((prev) =>
          prev.map((s, i) =>
            i === stepIndex
              ? {
                  ...s,
                  networkRequests: [
                    ...s.networkRequests,
                    {
                      method: event.method as string,
                      url: event.url as string,
                      status: event.status as number,
                    },
                  ],
                }
              : s
          )
        );
        break;
      }

      case "error": {
        console.error("[Live View] Error:", event.message);
        break;
      }

      case "run_complete": {
        setRunStatus(event.status as "passed" | "failed" | "error");
        break;
      }
    }
  }, []);

  // ── Cancel Test ──
  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    onCancel();
    setRunStatus((prev) => (prev === "running" ? "error" : prev));
  }, [onCancel]);

  // ── Toggle Step Expand ──
  const toggleStep = useCallback((index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // ── Computed Values ──
  const completedSteps = steps.filter((s) => s.status !== "pending" && s.status !== "running").length;
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  const selectedStepData = selectedStep !== null ? steps[selectedStep] : null;
  const passedCount = steps.filter((s) => s.status === "passed").length;
  const failedCount = steps.filter((s) => s.status === "failed" || s.status === "error").length;
  const formatDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${(s % 60).toFixed(0)}s` : `${(ms / 1000).toFixed(1)}s`;
  };

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* ── Control Bar ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <Globe className="w-4 h-4 text-gray-500 shrink-0" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter URL to test (e.g., https://example.com)"
                className="flex-1 px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isRunning}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isRunning && url.trim()) {
                    handleStartTest();
                  }
                }}
              />
            </div>

            {isRunning ? (
              <Button variant="destructive" size="sm" onClick={handleCancel} className="gap-1.5">
                <Square className="w-3.5 h-3.5" /> Cancel
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleStartTest}
                disabled={!url.trim()}
                className="gap-1.5"
              >
                <Play className="w-3.5 h-3.5" /> Run Live Test
              </Button>
            )}

            {runStatus !== "idle" && !isRunning && (
              <Button variant="outline" size="sm" onClick={resetState} className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </Button>
            )}
          </div>

          {/* Progress Bar */}
          {isRunning && (
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  Step {completedSteps} of {totalSteps}
                  {passedCount > 0 && <span className="text-green-600 ml-2">{passedCount} passed</span>}
                  {failedCount > 0 && <span className="text-red-600 ml-2">{failedCount} failed</span>}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {formatElapsed(elapsed)}
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Main Content: 2-column layout ── */}
      {steps.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── Left: Step Progress Feed ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Step Progress
                {runStatus === "running" && (
                  <Badge variant="secondary" className="ml-auto animate-pulse">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running
                  </Badge>
                )}
                {runStatus === "passed" && (
                  <Badge className="ml-auto bg-green-500">All Passed</Badge>
                )}
                {runStatus === "failed" && (
                  <Badge variant="destructive" className="ml-auto">Failed</Badge>
                )}
                {runStatus === "error" && (
                  <Badge variant="destructive" className="ml-auto">Error</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-y-auto space-y-1 p-2">
              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className={`rounded-md border cursor-pointer transition-colors ${
                    selectedStep === idx
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted/50"
                  }`}
                  onClick={() => {
                    setSelectedStep(idx);
                    if (step.status !== "pending") toggleStep(idx);
                  }}
                >
                  {/* Step Header */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <StepStatusIcon status={step.status} />
                    <ActionTypeIcon type={step.action.type} />
                    <span className="text-sm flex-1 truncate">
                      {step.action.label || `${step.action.type} step`}
                    </span>
                    {step.duration != null && step.status !== "pending" && step.status !== "running" && (
                      <span className="text-xs text-gray-400">{formatDuration(step.duration)}</span>
                    )}
                    {step.status !== "pending" && step.status !== "running" && (
                      expandedSteps.has(idx) ? (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      )
                    )}
                  </div>

                  {/* Expanded Detail */}
                  {expandedSteps.has(idx) && step.status !== "pending" && step.status !== "running" && (
                    <div className="px-3 pb-2 pl-9 space-y-1.5">
                      <StepStatusBadge status={step.status} />

                      {step.error && (
                        <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded p-2 font-mono">
                          {step.error}
                        </div>
                      )}

                      {step.actualText && (
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Text:</span> {step.actualText}
                        </div>
                      )}

                      {step.actualUrl && (
                        <div className="text-xs text-gray-600 truncate">
                          <span className="font-medium">URL:</span> {step.actualUrl}
                        </div>
                      )}

                      {step.consoleMessages.length > 0 && (
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-gray-500">Console:</span>
                          {step.consoleMessages.map((msg, mi) => (
                            <div
                              key={mi}
                              className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                                msg.level === "error"
                                  ? "text-red-600 bg-red-50 dark:bg-red-950/20"
                                  : msg.level === "warn"
                                  ? "text-amber-600 bg-amber-50 dark:bg-amber-950/20"
                                  : "text-gray-500"
                              }`}
                            >
                              [{msg.level}] {msg.text}
                            </div>
                          ))}
                        </div>
                      )}

                      {step.networkRequests.length > 0 && (
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-gray-500">Network:</span>
                          {step.networkRequests.map((req, ri) => (
                            <div
                              key={ri}
                              className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                                req.status >= 400
                                  ? "text-red-600 bg-red-50 dark:bg-red-950/20"
                                  : "text-gray-500"
                              }`}
                            >
                              {req.method} {req.status} {req.url.length > 60 ? req.url.substring(0, 60) + "..." : req.url}
                            </div>
                          ))}
                        </div>
                      )}

                      {step.screenshot && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStep(idx);
                          }}
                        >
                          <Camera className="w-3 h-3" /> View Screenshot
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ── Right: Screenshot Viewer ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Browser View
                {selectedStepData && (
                  <span className="text-xs text-gray-400 font-normal ml-2">
                    Step {selectedStepData.index + 1}: {selectedStepData.action.label}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedStepData?.screenshot ? (
                <div className="space-y-2">
                  <div className="relative rounded-md overflow-hidden border bg-gray-100 dark:bg-gray-900">
                    <img
                      src={`data:image/png;base64,${selectedStepData.screenshot}`}
                      alt={`Step ${selectedStepData.index + 1} screenshot`}
                      className="w-full h-auto"
                    />
                    {/* Status overlay */}
                    <div
                      className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium ${
                        selectedStepData.status === "passed"
                          ? "bg-green-500 text-white"
                          : selectedStepData.status === "failed" || selectedStepData.status === "error"
                          ? "bg-red-500 text-white"
                          : "bg-gray-500 text-white"
                      }`}
                    >
                      {selectedStepData.status.toUpperCase()}
                    </div>
                  </div>

                  {/* Step navigation */}
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selectedStep === 0}
                      onClick={() => {
                        const prev = steps
                          .slice(0, selectedStep ?? 0)
                          .reverse()
                          .find((s) => s.screenshot);
                        if (prev) setSelectedStep(prev.index);
                      }}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-gray-500">
                      {selectedStepData.index + 1} / {steps.length}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selectedStep === steps.length - 1}
                      onClick={() => {
                        const next = steps
                          .slice((selectedStep ?? 0) + 1)
                          .find((s) => s.screenshot);
                        if (next) setSelectedStep(next.index);
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : isRunning ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-3" />
                  <p className="text-sm">Waiting for first screenshot...</p>
                  <p className="text-xs text-gray-300 mt-1">
                    The browser is starting up
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Globe className="w-10 h-10 mb-3" />
                  <p className="text-sm">No screenshot to display</p>
                  <p className="text-xs text-gray-300 mt-1">
                    Run a live test to see browser screenshots in real-time
                  </p>
                </div>
              )}

              {/* Console & Network Errors Summary */}
              {(consoleEvents.length > 0 || networkEvents.length > 0) && (
                <div className="mt-4 space-y-2 border-t pt-3">
                  <h4 className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                    <Terminal className="w-3 h-3" /> Diagnostics
                  </h4>
                  {consoleEvents
                    .filter((e) => e.level === "error")
                    .slice(0, 3)
                    .map((e, i) => (
                      <div key={i} className="text-xs font-mono text-red-600 bg-red-50 dark:bg-red-950/20 rounded px-2 py-1">
                        <span className="text-gray-400">[console]</span> {e.text}
                      </div>
                    ))}
                  {networkEvents
                    .filter((e) => e.status >= 400)
                    .slice(0, 3)
                    .map((e, i) => (
                      <div key={i} className="text-xs font-mono text-red-600 bg-red-50 dark:bg-red-950/20 rounded px-2 py-1">
                        <span className="text-gray-400">[{e.method} {e.status}]</span>{" "}
                        {e.url.length > 80 ? e.url.substring(0, 80) + "..." : e.url}
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Run Complete Summary ── */}
      {runStatus !== "idle" && runStatus !== "running" && steps.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {runStatus === "passed" ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-500" />
                )}
                <div>
                  <p className="font-medium">
                    {runStatus === "passed" ? "All tests passed!" : "Test run failed"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {passedCount} passed, {failedCount} failed, {steps.filter((s) => s.status === "skipped").length} skipped
                    {" "} in {formatElapsed(elapsed)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={resetState} className="gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Run Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
