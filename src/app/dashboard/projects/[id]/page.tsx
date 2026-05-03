"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bug,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  ExternalLink,
  Play,
  RefreshCw,
  FileCode2,
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronRight,
  Timer,
  Zap,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Feature {
  id: string;
  name: string;
  type: string;
  selector?: string | null;
  description?: string | null;
  priority: number;
  route?: string | null;
  dependencies: string[];
  testCases: TestCase[];
  createdAt: string;
}

interface TestCase {
  id: string;
  name: string;
  description?: string | null;
  code: string;
  selector?: string | null;
  autoHealed: boolean;
  updatedAt: string;
}

interface TestRun {
  id: string;
  status: string;
  triggeredBy: string;
  startedAt: string | null;
  endedAt: string | null;
  logs?: string | null;
  createdAt: string;
  results: TestResult[];
}

interface TestResult {
  id: string;
  testName: string;
  featureName?: string | null;
  status: string;
  duration?: number | null;
  error?: string | null;
}

interface ProjectData {
  project: {
    id: string;
    name: string;
    repoUrl: string;
    repoName: string;
    branch: string;
    status: string;
    sandboxId?: string | null;
    sandboxUrl?: string | null;
    lastRunAt?: string | null;
    createdAt: string;
  };
  features: Feature[];
  testRuns: TestRun[];
}

export default function ProjectDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && projectId) {
      loadProjectData();
    }
  }, [status, projectId]);

  async function loadProjectData() {
    setLoading(true);
    try {
      // Load features
      const featuresRes = await fetch(`/api/discover?projectId=${projectId}`);
      const featuresData = await featuresRes.json();

      // Load test runs
      const runsRes = await fetch(`/api/test-runs?projectId=${projectId}`);
      const runsData = await runsRes.json();

      // Load project info
      const projectsRes = await fetch("/api/projects");
      const projectsData = await projectsRes.json();
      const project = projectsData.projects?.find((p: { id: string }) => p.id === projectId);

      setData({
        project: project ?? { id: projectId, name: "Unknown", repoUrl: "", repoName: "", branch: "main", status: "unknown", createdAt: "" },
        features: featuresData.features ?? [],
        testRuns: runsData.runs ?? [],
      });
    } catch (error) {
      console.error("Failed to load project data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function discoverFeatures() {
    setDiscovering(true);
    try {
      const url = data?.project.sandboxUrl || data?.project.repoUrl;
      if (!url) return;

      await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, projectId, clearExisting: true, includeLLM: true }),
      });
      await loadProjectData();
    } catch (error) {
      console.error("Discovery failed:", error);
    } finally {
      setDiscovering(false);
    }
  }

  async function generateAllTests() {
    setGenerating(true);
    try {
      const url = data?.project.sandboxUrl || data?.project.repoUrl;
      await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, url }),
      });
      await loadProjectData();
    } catch (error) {
      console.error("Generation failed:", error);
    } finally {
      setGenerating(false);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-deep-indigo" />
      </div>
    );
  }

  if (!session || !data) return null;

  const { project, features, testRuns } = data;

  // Compute stats
  const totalRuns = testRuns.length;
  const passedRuns = testRuns.filter((r) => r.status === "passed").length;
  const failedRuns = testRuns.filter((r) => r.status === "failed" || r.status === "error").length;
  const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;

  const totalTestCases = features.reduce((sum, f) => sum + f.testCases.length, 0);
  const autoHealedCount = features.reduce(
    (sum, f) => sum + f.testCases.filter((tc) => tc.autoHealed).length,
    0
  );

  return (
    <div className="min-h-screen bg-off-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")} className="mr-3">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-deep-indigo" />
            <span className="font-semibold text-deep-indigo">{project.name}</span>
            <Badge variant="secondary" className="text-xs">{project.status}</Badge>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={discoverFeatures}
              disabled={discovering}
            >
              {discovering ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
              Discover
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={generateAllTests}
              disabled={generating}
            >
              {generating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <FileCode2 className="mr-1 h-3 w-3" />}
              Generate Tests
            </Button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Row */}
        <div className="grid gap-4 sm:grid-cols-5 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Features</CardDescription>
              <CardTitle className="text-3xl">{features.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Test Cases</CardDescription>
              <CardTitle className="text-3xl text-deep-indigo">{totalTestCases}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pass Rate</CardDescription>
              <CardTitle className={`text-3xl ${passRate >= 80 ? "text-emerald" : passRate >= 50 ? "text-amber" : "text-warm-red"}`}>
                {totalRuns > 0 ? `${passRate}%` : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Runs</CardDescription>
              <CardTitle className="text-3xl">{totalRuns}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Auto-Healed</CardDescription>
              <CardTitle className="text-3xl text-electric-violet">{autoHealedCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Features Section */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/10">
                <Sparkles className="h-4 w-4 text-amber" />
              </div>
              <div>
                <CardTitle className="text-base">Features ({features.length})</CardTitle>
                <CardDescription className="text-xs">Discovered testable features for this project</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {features.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">No features discovered yet.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={discoverFeatures}
                  disabled={discovering || !project.sandboxUrl}
                >
                  {discovering ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                  Discover Features
                </Button>
                {!project.sandboxUrl && (
                  <p className="text-xs text-muted-foreground mt-2">Launch a sandbox first to enable discovery</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {features.map((feature) => (
                  <div key={feature.id} className="rounded-lg border bg-white">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors"
                      onClick={() => setExpandedFeature(expandedFeature === feature.id ? null : feature.id)}
                    >
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs ${
                          feature.priority === 1
                            ? "bg-warm-red/10 text-warm-red border-warm-red/20"
                            : feature.priority === 2
                            ? "bg-amber/10 text-amber border-amber/20"
                            : "bg-emerald/10 text-emerald border-emerald/20"
                        }`}
                      >
                        P{feature.priority}
                      </Badge>
                      <Badge variant="secondary" className="shrink-0 text-xs capitalize">{feature.type}</Badge>
                      <span className="text-sm font-medium truncate flex-1">{feature.name}</span>
                      {feature.testCases.length > 0 && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {feature.testCases.length} test{feature.testCases.length > 1 ? "s" : ""}
                        </Badge>
                      )}
                      {expandedFeature === feature.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </button>

                    {expandedFeature === feature.id && (
                      <div className="border-t px-3 py-3 space-y-3">
                        {feature.description && (
                          <p className="text-xs text-muted-foreground">{feature.description}</p>
                        )}
                        {feature.selector && (
                          <div className="text-xs">
                            <strong>Selector:</strong>{" "}
                            <code className="bg-zinc-100 px-1.5 py-0.5 rounded">{feature.selector}</code>
                          </div>
                        )}
                        {feature.route && (
                          <div className="text-xs">
                            <strong>Route:</strong>{" "}
                            <code className="bg-zinc-100 px-1.5 py-0.5 rounded">{feature.route}</code>
                          </div>
                        )}

                        {/* Test Cases */}
                        {feature.testCases.length > 0 && (
                          <div>
                            <h5 className="text-xs font-semibold text-deep-indigo mb-2">Test Cases</h5>
                            <div className="space-y-1.5">
                              {feature.testCases.map((tc) => (
                                <div key={tc.id} className="rounded-md border bg-zinc-50 p-2">
                                  <div className="flex items-center gap-2">
                                    <FileCode2 className="h-3.5 w-3.5 text-deep-indigo shrink-0" />
                                    <span className="text-xs font-medium truncate">{tc.name}</span>
                                    {tc.autoHealed && (
                                      <Badge variant="outline" className="text-xs bg-electric-violet/10 text-electric-violet border-electric-violet/20 shrink-0">
                                        Auto-Healed
                                      </Badge>
                                    )}
                                  </div>
                                  <details className="mt-1">
                                    <summary className="text-xs text-muted-foreground cursor-pointer">View Playwright code</summary>
                                    <pre className="mt-1 bg-zinc-950 text-zinc-100 p-2 rounded text-xs font-mono overflow-x-auto max-h-40">
                                      {tc.code.substring(0, 1500)}
                                    </pre>
                                  </details>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Run History */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-deep-indigo/10">
                <BarChart3 className="h-4 w-4 text-deep-indigo" />
              </div>
              <div>
                <CardTitle className="text-base">Test Run History ({testRuns.length})</CardTitle>
                <CardDescription className="text-xs">Recent test execution results</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {testRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No test runs yet</p>
            ) : (
              <div className="space-y-2">
                {testRuns.slice(0, 20).map((run) => (
                  <div key={run.id} className="rounded-lg border bg-white">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors"
                      onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                    >
                      {run.status === "passed" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald shrink-0" />
                      ) : run.status === "failed" ? (
                        <AlertTriangle className="h-4 w-4 text-warm-red shrink-0" />
                      ) : run.status === "running" ? (
                        <Loader2 className="h-4 w-4 text-electric-violet animate-spin shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-zinc-400 shrink-0" />
                      )}
                      <Badge variant="outline" className={`text-xs shrink-0 capitalize ${
                        run.status === "passed" ? "bg-emerald/10 text-emerald border-emerald/20"
                        : run.status === "failed" ? "bg-warm-red/10 text-warm-red border-warm-red/20"
                        : "bg-zinc-100 text-zinc-500"
                      }`}>
                        {run.status}
                      </Badge>
                      <Badge variant="secondary" className="text-xs shrink-0">{run.triggeredBy}</Badge>
                      <span className="text-xs text-muted-foreground flex-1">
                        {run.startedAt ? new Date(run.startedAt).toLocaleString() : "Not started"}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {run.results.length} result{run.results.length !== 1 ? "s" : ""}
                      </span>
                      {expandedRun === run.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </button>

                    {expandedRun === run.id && run.results.length > 0 && (
                      <div className="border-t px-3 py-2 space-y-1">
                        {run.results.map((result) => (
                          <div key={result.id} className="flex items-center gap-2 py-1">
                            {result.status === "passed" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald shrink-0" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-warm-red shrink-0" />
                            )}
                            <span className="text-xs truncate flex-1">{result.testName}</span>
                            {result.duration && (
                              <span className="text-xs text-muted-foreground shrink-0">{result.duration}ms</span>
                            )}
                            {result.error && (
                              <span className="text-xs text-warm-red truncate max-w-[200px] shrink-0">{result.error.substring(0, 60)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
