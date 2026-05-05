"use client";

/**
 * Probato Media Verification Panel (M21)
 *
 * Displays media verification results with:
 *  - Overall score (circular progress indicator)
 *  - Image & Video sub-scores
 *  - Image check cards with status, dimensions, alt text
 *  - Video check cards with status, readyState, duration, frame captures
 *  - Tab filter (All / Images / Videos)
 *  - Capture Frames toggle
 *  - Verification history
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Camera, Image, Video, ChevronRight, ChevronDown, Loader2,
  AlertTriangle, RefreshCw, Eye, CheckCircle2, XCircle, ImageOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// ── Types ────────────────────────────────────────────────────────

interface ImageCheckResult {
  src: string;
  status: "ok" | "broken" | "hidden" | "distorted" | "error";
  httpStatus?: number;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
  alt: string;
  rendered: boolean;
  cssHidden: boolean;
  error?: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
}

interface VideoCheckResult {
  src: string;
  status: "ok" | "error" | "no_source" | "load_failed" | "playback_failed";
  readyState: number;
  duration: number;
  error?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  frameCaptures: string[];
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
}

interface MediaVerificationData {
  id: string;
  status: string;
  url: string;
  overallScore: number;
  imageScore: number;
  videoScore: number;
  audioScore: number;
  imageChecks: ImageCheckResult[];
  videoChecks: VideoCheckResult[];
  summary: {
    totalImages: number;
    brokenImages: number;
    hiddenImages: number;
    distortedImages: number;
    totalVideos: number;
    errorVideos: number;
    noSourceVideos: number;
  };
  duration: number;
  llmUsed: boolean;
  error?: string;
  createdAt: string;
}

interface MediaVerificationPanelProps {
  url: string;
  projectId?: string;
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
    icon: <Eye className="w-3.5 h-3.5" />,
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

// ── Image Status Config ──────────────────────────────────────────

const IMAGE_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  ok: {
    label: "OK",
    color: "text-green-700",
    bgColor: "bg-green-50 dark:bg-green-950/20",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  broken: {
    label: "Broken",
    color: "text-red-700",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    icon: <XCircle className="w-3 h-3" />,
  },
  hidden: {
    label: "Hidden",
    color: "text-yellow-700",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/20",
    icon: <Eye className="w-3 h-3" />,
  },
  distorted: {
    label: "Distorted",
    color: "text-orange-700",
    bgColor: "bg-orange-50 dark:bg-orange-950/20",
    icon: <ImageOff className="w-3 h-3" />,
  },
  error: {
    label: "Error",
    color: "text-red-700",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    icon: <XCircle className="w-3 h-3" />,
  },
};

// ── Video Status Config ──────────────────────────────────────────

const VIDEO_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  ok: {
    label: "OK",
    color: "text-green-700",
    bgColor: "bg-green-50 dark:bg-green-950/20",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  error: {
    label: "Error",
    color: "text-red-700",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    icon: <XCircle className="w-3 h-3" />,
  },
  no_source: {
    label: "No Source",
    color: "text-red-700",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    icon: <ImageOff className="w-3 h-3" />,
  },
  load_failed: {
    label: "Load Failed",
    color: "text-red-700",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    icon: <XCircle className="w-3 h-3" />,
  },
  playback_failed: {
    label: "Playback Failed",
    color: "text-orange-700",
    bgColor: "bg-orange-50 dark:bg-orange-950/20",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
};

const READY_STATE_LABELS: Record<number, string> = {
  0: "HAVE_NOTHING",
  1: "HAVE_METADATA",
  2: "HAVE_CURRENT_DATA",
  3: "HAVE_FUTURE_DATA",
  4: "HAVE_ENOUGH_DATA",
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

// ── Image Check Card ─────────────────────────────────────────────

function ImageCheckCard({ check }: { check: ImageCheckResult }) {
  const [expanded, setExpanded] = useState(false);
  const statusConfig = IMAGE_STATUS_CONFIG[check.status] ?? IMAGE_STATUS_CONFIG.error;
  const severityConfig = SEVERITY_CONFIG[check.severity] ?? SEVERITY_CONFIG.info;

  const truncateSrc = (src: string, maxLen = 60) => {
    if (!src) return "(empty)";
    return src.length > maxLen ? src.substring(0, maxLen) + "..." : src;
  };

  return (
    <div className="rounded-lg border bg-white dark:bg-zinc-900">
      <button
        className="w-full px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs shrink-0 ${statusConfig.color} ${statusConfig.bgColor} border-0`}
          >
            <span className="mr-1">{statusConfig.icon}</span>
            {statusConfig.label}
          </Badge>
          <span className="text-sm font-mono text-gray-600 dark:text-gray-400 truncate flex-1">
            {truncateSrc(check.src)}
          </span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-3 pb-3 space-y-2">
          {/* Dimensions */}
          <div className="flex items-center gap-3 pt-2 text-xs">
            <span className="text-muted-foreground">Natural:</span>
            <span className="font-mono">{check.naturalWidth}×{check.naturalHeight}</span>
            <span className="text-muted-foreground">Display:</span>
            <span className="font-mono">{check.displayWidth}×{check.displayHeight}</span>
          </div>

          {/* Alt text */}
          <div className="text-xs">
            <span className="text-muted-foreground">Alt: </span>
            {check.alt ? (
              <span className="text-gray-700 dark:text-gray-300">&quot;{check.alt}&quot;</span>
            ) : (
              <span className="text-red-600 font-medium">Missing alt text</span>
            )}
          </div>

          {/* CSS Hidden indicator */}
          {check.cssHidden && (
            <div className="flex items-center gap-1 text-xs text-yellow-700">
              <Eye className="w-3 h-3" />
              <span>CSS hidden (display:none, visibility:hidden, or opacity:0)</span>
            </div>
          )}

          {/* HTTP Status */}
          {check.httpStatus && (
            <div className="text-xs">
              <span className="text-muted-foreground">HTTP Status: </span>
              <span className={check.httpStatus >= 400 ? "text-red-600" : "text-green-600"}>
                {check.httpStatus}
              </span>
            </div>
          )}

          {/* Error */}
          {check.error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/20 p-2">
              <span className="text-xs font-medium text-red-700 dark:text-red-400">Error:</span>
              <p className="text-xs mt-0.5 text-red-800 dark:text-red-300">{check.error}</p>
            </div>
          )}

          {/* Description */}
          <p className="text-sm text-gray-600 dark:text-gray-400">{check.description}</p>

          {/* Severity */}
          <Badge
            variant="outline"
            className={`text-xs shrink-0 ${severityConfig.color} ${severityConfig.bgColor} border-0`}
          >
            <span className="mr-1">{severityConfig.icon}</span>
            {severityConfig.label}
          </Badge>
        </div>
      )}
    </div>
  );
}

// ── Video Check Card ─────────────────────────────────────────────

function VideoCheckCard({ check }: { check: VideoCheckResult }) {
  const [expanded, setExpanded] = useState(false);
  const statusConfig = VIDEO_STATUS_CONFIG[check.status] ?? VIDEO_STATUS_CONFIG.error;
  const severityConfig = SEVERITY_CONFIG[check.severity] ?? SEVERITY_CONFIG.info;

  const truncateSrc = (src: string, maxLen = 60) => {
    if (!src) return "(empty)";
    return src.length > maxLen ? src.substring(0, maxLen) + "..." : src;
  };

  const formatDuration = (d: number) => {
    if (d < 0 || d === 0) return "Unknown";
    if (d === Infinity) return "Live stream";
    const mins = Math.floor(d / 60);
    const secs = Math.floor(d % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="rounded-lg border bg-white dark:bg-zinc-900">
      <button
        className="w-full px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs shrink-0 ${statusConfig.color} ${statusConfig.bgColor} border-0`}
          >
            <span className="mr-1">{statusConfig.icon}</span>
            {statusConfig.label}
          </Badge>
          <Video className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="text-sm font-mono text-gray-600 dark:text-gray-400 truncate flex-1">
            {truncateSrc(check.src)}
          </span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-3 pb-3 space-y-2">
          {/* ReadyState */}
          <div className="flex items-center gap-2 pt-2 text-xs">
            <span className="text-muted-foreground">ReadyState:</span>
            <span className="font-mono">
              {check.readyState} ({READY_STATE_LABELS[check.readyState] ?? "UNKNOWN"})
            </span>
          </div>

          {/* Duration */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Duration:</span>
            <span>{formatDuration(check.duration)}</span>
          </div>

          {/* Audio/Video track indicators */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">Audio:</span>
              {check.hasAudio ? (
                <span className="text-green-600 flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Yes
                </span>
              ) : (
                <span className="text-gray-400 flex items-center gap-0.5">
                  <XCircle className="w-3 h-3" /> No
                </span>
              )}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">Video:</span>
              {check.hasVideo ? (
                <span className="text-green-600 flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Yes
                </span>
              ) : (
                <span className="text-gray-400 flex items-center gap-0.5">
                  <XCircle className="w-3 h-3" /> No
                </span>
              )}
            </span>
          </div>

          {/* Error */}
          {check.error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/20 p-2">
              <span className="text-xs font-medium text-red-700 dark:text-red-400">Error:</span>
              <p className="text-xs mt-0.5 text-red-800 dark:text-red-300">{check.error}</p>
            </div>
          )}

          {/* Frame captures */}
          {check.frameCaptures && check.frameCaptures.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-gray-500">Frame Captures:</span>
              <div className="flex gap-2 flex-wrap">
                {check.frameCaptures.map((frame, i) => (
                  <img
                    key={i}
                    src={`data:image/png;base64,${frame}`}
                    alt={`Video frame ${i + 1}`}
                    className="w-20 h-14 object-cover rounded border border-gray-200 dark:border-gray-700"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <p className="text-sm text-gray-600 dark:text-gray-400">{check.description}</p>

          {/* Severity */}
          <Badge
            variant="outline"
            className={`text-xs shrink-0 ${severityConfig.color} ${severityConfig.bgColor} border-0`}
          >
            <span className="mr-1">{severityConfig.icon}</span>
            {severityConfig.label}
          </Badge>
        </div>
      )}
    </div>
  );
}

// ── Main Panel Component ─────────────────────────────────────────

export default function MediaVerificationPanel({ url, projectId }: MediaVerificationPanelProps) {
  const [verifications, setVerifications] = useState<MediaVerificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [latestResult, setLatestResult] = useState<MediaVerificationData | null>(null);
  const [tabFilter, setTabFilter] = useState<"all" | "images" | "videos">("all");
  const [captureFrames, setCaptureFrames] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState(url);

  // Sync url prop to local state
  useEffect(() => {
    setVerifyUrl(url);
  }, [url]);

  const loadVerifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "10" });
      if (projectId) params.set("projectId", projectId);
      const res = await fetch(`/api/media/verifications?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVerifications(data.verifications ?? []);
        if (data.verifications?.length > 0) {
          // Load the most recent verification with full detail
          const detailRes = await fetch(`/api/media/verifications/${data.verifications[0].id}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            const v = detailData.verification as MediaVerificationData;
            // Ensure imageChecks and videoChecks are arrays
            setLatestResult({
              ...v,
              imageChecks: Array.isArray(v.imageChecks) ? v.imageChecks : [],
              videoChecks: Array.isArray(v.videoChecks) ? v.videoChecks : [],
              summary: v.summary ?? {
                totalImages: 0, brokenImages: 0, hiddenImages: 0,
                distortedImages: 0, totalVideos: 0, errorVideos: 0, noSourceVideos: 0,
              },
            });
          }
        }
      }
    } catch (error) {
      console.error("Failed to load media verifications:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadVerifications();
  }, [loadVerifications]);

  const handleRunVerify = useCallback(async () => {
    if (!verifyUrl.trim()) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/media/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: verifyUrl,
          projectId,
          checkImages: true,
          checkVideos: true,
          captureFrames,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        const v = result.verification as MediaVerificationData;
        setLatestResult({
          ...v,
          imageChecks: Array.isArray(v?.imageChecks) ? v.imageChecks : [],
          videoChecks: Array.isArray(v?.videoChecks) ? v.videoChecks : [],
          summary: v?.summary ?? {
            totalImages: 0, brokenImages: 0, hiddenImages: 0,
            distortedImages: 0, totalVideos: 0, errorVideos: 0, noSourceVideos: 0,
          },
        });
        await loadVerifications();
      } else {
        const data = await res.json().catch(() => ({ error: "Verification failed" }));
        console.error("Media verification failed:", data.error);
      }
    } catch (error) {
      console.error("Failed to run media verification:", error);
    } finally {
      setVerifying(false);
    }
  }, [verifyUrl, projectId, captureFrames, loadVerifications]);

  // Filtered checks
  const allImageChecks = latestResult?.imageChecks ?? [];
  const allVideoChecks = latestResult?.videoChecks ?? [];

  const filteredChecks = (() => {
    switch (tabFilter) {
      case "images": return allImageChecks.map((c, i) => ({ type: "image" as const, data: c, key: `img-${i}` }));
      case "videos": return allVideoChecks.map((c, i) => ({ type: "video" as const, data: c, key: `vid-${i}` }));
      default: return [
        ...allImageChecks.map((c, i) => ({ type: "image" as const, data: c, key: `img-${i}` })),
        ...allVideoChecks.map((c, i) => ({ type: "video" as const, data: c, key: `vid-${i}` })),
      ];
    }
  })();

  // Severity summary
  const allChecks = [
    ...allImageChecks.map((c) => c.severity),
    ...allVideoChecks.map((c) => c.severity),
  ];
  const criticalCount = allChecks.filter((s) => s === "critical").length;
  const highCount = allChecks.filter((s) => s === "high").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10">
            <Camera className="h-4 w-4 text-rose-600" />
          </div>
          <div>
            <CardTitle className="text-base">Media Verification</CardTitle>
            <CardDescription className="text-xs">
              Check images and videos for issues
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleRunVerify}
            disabled={verifying || !verifyUrl}
          >
            {verifying ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Camera className="w-3 h-3" />
            )}
            Run Verify
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={loadVerifications}
            disabled={loading}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <Switch
              id="capture-frames"
              checked={captureFrames}
              onCheckedChange={setCaptureFrames}
              className="scale-75"
            />
            <Label htmlFor="capture-frames" className="text-xs text-muted-foreground cursor-pointer">
              Capture Frames
            </Label>
          </div>
        </div>

        {/* URL Input */}
        <div className="mt-2">
          <Input
            type="url"
            placeholder="https://example.com"
            value={verifyUrl}
            onChange={(e) => setVerifyUrl(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : !latestResult ? (
          <div className="text-center py-8">
            <Camera className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No media verification yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              {verifyUrl
                ? "Click 'Run Verify' to check images and videos for issues."
                : "Set a URL to enable media verification."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Score Row */}
            <div className="flex items-center gap-4">
              <ScoreCircle score={latestResult.overallScore} />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Image className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Image Score:</span>
                  <span className="text-xs font-medium">{latestResult.imageScore}/100</span>
                </div>
                <div className="flex items-center gap-2">
                  <Video className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Video Score:</span>
                  <span className="text-xs font-medium">{latestResult.videoScore}/100</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Duration:</span>
                  <span className="text-xs font-medium">{(latestResult.duration / 1000).toFixed(1)}s</span>
                </div>
              </div>
            </div>

            {/* Summary Row */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-md bg-muted/50 p-2">
                <div className="text-lg font-bold">{latestResult.summary.totalImages}</div>
                <div className="text-xs text-muted-foreground">Images</div>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <div className="text-lg font-bold text-red-600">{latestResult.summary.brokenImages}</div>
                <div className="text-xs text-muted-foreground">Broken</div>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <div className="text-lg font-bold text-yellow-600">{latestResult.summary.hiddenImages}</div>
                <div className="text-xs text-muted-foreground">Hidden</div>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <div className="text-lg font-bold text-orange-600">{latestResult.summary.distortedImages}</div>
                <div className="text-xs text-muted-foreground">Distorted</div>
              </div>
            </div>

            {/* Video summary row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted/50 p-2">
                <div className="text-lg font-bold">{latestResult.summary.totalVideos}</div>
                <div className="text-xs text-muted-foreground">Videos</div>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <div className="text-lg font-bold text-red-600">{latestResult.summary.errorVideos}</div>
                <div className="text-xs text-muted-foreground">Error</div>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <div className="text-lg font-bold text-red-600">{latestResult.summary.noSourceVideos}</div>
                <div className="text-xs text-muted-foreground">No Source</div>
              </div>
            </div>

            {/* Severity Summary */}
            {(criticalCount > 0 || highCount > 0) && (
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
                  {allChecks.length} check{allChecks.length !== 1 ? "s" : ""}
                </span>
                {latestResult.llmUsed && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200">
                    AI Enhanced
                  </Badge>
                )}
              </div>
            )}

            {/* Tab Filter */}
            <div className="flex gap-1 flex-wrap">
              <button
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  tabFilter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                onClick={() => setTabFilter("all")}
              >
                All ({allImageChecks.length + allVideoChecks.length})
              </button>
              <button
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  tabFilter === "images"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                onClick={() => setTabFilter("images")}
              >
                <Image className="w-3 h-3" />
                Images ({allImageChecks.length})
              </button>
              <button
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  tabFilter === "videos"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                onClick={() => setTabFilter("videos")}
              >
                <Video className="w-3 h-3" />
                Videos ({allVideoChecks.length})
              </button>
            </div>

            {/* Check Results List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredChecks.map(({ type, data, key }) =>
                type === "image" ? (
                  <ImageCheckCard key={key} check={data as ImageCheckResult} />
                ) : (
                  <VideoCheckCard key={key} check={data as VideoCheckResult} />
                )
              )}
              {filteredChecks.length === 0 && (allImageChecks.length + allVideoChecks.length) > 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No checks in this category.
                </p>
              )}
              {allImageChecks.length === 0 && allVideoChecks.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-green-600 font-medium">No media issues found!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All images and videos passed the checks.
                  </p>
                </div>
              )}
            </div>

            {/* Verification History */}
            {verifications.length > 1 && (
              <div className="pt-3 border-t">
                <h5 className="text-xs font-semibold text-gray-500 mb-2">Verification History</h5>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {verifications.slice(1, 6).map((v) => (
                    <button
                      key={v.id}
                      className="flex items-center gap-2 text-xs text-muted-foreground w-full text-left hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
                      onClick={async () => {
                        try {
                          const detailRes = await fetch(`/api/media/verifications/${v.id}`);
                          if (detailRes.ok) {
                            const detailData = await detailRes.json();
                            const dv = detailData.verification as MediaVerificationData;
                            setLatestResult({
                              ...dv,
                              imageChecks: Array.isArray(dv.imageChecks) ? dv.imageChecks : [],
                              videoChecks: Array.isArray(dv.videoChecks) ? dv.videoChecks : [],
                              summary: dv.summary ?? {
                                totalImages: 0, brokenImages: 0, hiddenImages: 0,
                                distortedImages: 0, totalVideos: 0, errorVideos: 0, noSourceVideos: 0,
                              },
                            });
                          }
                        } catch (error) {
                          console.error("Failed to load verification detail:", error);
                        }
                      }}
                    >
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${
                          v.status === "completed" ? "bg-green-50 text-green-700"
                          : v.status === "failed" ? "bg-red-50 text-red-700"
                          : "bg-gray-50 text-gray-700"
                        }`}
                      >
                        {v.status}
                      </Badge>
                      <span>Score: {v.overallScore}</span>
                      <span className="truncate flex-1">{new Date(v.createdAt).toLocaleString()}</span>
                    </button>
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
