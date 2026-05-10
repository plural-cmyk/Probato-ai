"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Github,
  Rocket,
  Search,
  Play,
  Sparkles,
  SkipForward,
  Loader2,
  AlertCircle,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────────────

interface OnboardingState {
  id: string;
  currentStep: string;
  completedSteps: string[];
  skipped: boolean;
  repoUrl: string | null;
  projectId: string | null;
  featureCount: number;
  testRunId: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
}

type StepKey = "welcome" | "connect_repo" | "discover" | "first_test" | "complete";

const STEPS: { key: StepKey; label: string; icon: React.ReactNode }[] = [
  { key: "welcome", label: "Welcome", icon: <Rocket className="size-4" /> },
  { key: "connect_repo", label: "Connect", icon: <Github className="size-4" /> },
  { key: "discover", label: "Discover", icon: <Search className="size-4" /> },
  { key: "first_test", label: "Test", icon: <Play className="size-4" /> },
  { key: "complete", label: "Done", icon: <Sparkles className="size-4" /> },
];

const STEP_ORDER: StepKey[] = ["welcome", "connect_repo", "discover", "first_test", "complete"];

// ── Helpers ────────────────────────────────────────────────────────

function extractRepoName(url: string): string {
  return url.replace(/\.git$/, "").split("/").pop() || "untitled";
}

function stepIndex(key: StepKey): number {
  return STEP_ORDER.indexOf(key);
}

// ── Animation Variants ─────────────────────────────────────────────

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

// ── Main Component ─────────────────────────────────────────────────

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<StepKey>("welcome");
  const [completedSteps, setCompletedSteps] = useState<StepKey[]>([]);
  const [direction, setDirection] = useState(1);

  // Step 2 state
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [connecting, setConnecting] = useState(false);
  const [repoError, setRepoError] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectSource, setProjectSource] = useState<"repo" | "url">("url");
  const [liveUrl, setLiveUrl] = useState("");

  // Step 3 state
  const [discovering, setDiscovering] = useState(false);
  const [featureCount, setFeatureCount] = useState(0);
  const [discoverError, setDiscoverError] = useState("");
  const [discoveryDone, setDiscoveryDone] = useState(false);

  // Step 4 state
  const [testUrl, setTestUrl] = useState("https://probato-ai.vercel.app");
  const [testPreset, setTestPreset] = useState("smoke");
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: string;
    testRunId?: string;
    summary?: { total: number; passed: number; failed: number };
  } | null>(null);
  const [testError, setTestError] = useState("");

  // ── Auth guard & initial data fetch ──────────────────────────────

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  const fetchOnboardingState = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding");
      if (res.ok) {
        const data = await res.json();
        const ob: OnboardingState = data.onboarding;

        if (ob.completedAt || ob.dismissedAt || ob.skipped) {
          router.push("/dashboard");
          return;
        }

        const cs = ob.completedSteps as StepKey[];
        setCompletedSteps(cs);
        setCurrentStep((ob.currentStep as StepKey) || "welcome");

        // Restore step-specific state
        if (ob.projectId) setProjectId(ob.projectId);
        if (ob.repoUrl) setRepoUrl(ob.repoUrl);
        if (ob.featureCount) {
          setFeatureCount(ob.featureCount);
          setDiscoveryDone(true);
        }
        if (ob.testRunId) {
          setTestResult({ status: "passed", testRunId: ob.testRunId });
        }

        // If a project has a sandboxUrl, pre-fill test URL
        if (ob.projectId) {
          const projRes = await fetch(`/api/projects`);
          if (projRes.ok) {
            const projData = await projRes.json();
            const proj = projData.projects?.find((p: { id: string }) => p.id === ob.projectId);
            if (proj?.sandboxUrl) setTestUrl(proj.sandboxUrl);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch onboarding state:", err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchOnboardingState();
    }
  }, [status, fetchOnboardingState]);

  // ── Step Navigation ──────────────────────────────────────────────

  function goToStep(step: StepKey) {
    setDirection(stepIndex(step) > stepIndex(currentStep) ? 1 : -1);
    setCurrentStep(step);
  }

  const completeStep = useCallback(async (step: StepKey, metadata: Record<string, unknown> = {}) => {
    try {
      await fetch("/api/onboarding/complete-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, ...metadata }),
      });
      setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
    } catch (err) {
      console.error("Failed to complete step:", err);
    }
  }, []);

  async function skipOnboarding() {
    await fetch("/api/onboarding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skipped: true, currentStep: "welcome" }),
    });
    router.push("/dashboard");
  }

  // ── Step 2: Connect Repo ─────────────────────────────────────────

  async function handleConnectRepo() {
    setConnecting(true);
    setRepoError("");

    try {
      let res: Response;

      if (projectSource === "url") {
        if (!liveUrl.trim()) {
          setRepoError("Please enter a live URL");
          setConnecting(false);
          return;
        }
        res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ liveUrl: liveUrl.trim(), source: "url" }),
        });
      } else {
        if (!repoUrl.trim()) {
          setRepoError("Please enter a repository URL");
          setConnecting(false);
          return;
        }
        const name = extractRepoName(repoUrl);
        res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl: repoUrl.trim(), repoName: name, branch: branch.trim() || "main" }),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        setRepoError(data.error || "Failed to create project");
        return;
      }

      const data = await res.json();
      const newProjectId = data.project.id;
      setProjectId(newProjectId);

      await completeStep("connect_repo", { repoUrl: projectSource === "url" ? liveUrl.trim() : repoUrl.trim(), projectId: newProjectId });
      goToStep("discover");
    } catch (err) {
      setRepoError("An unexpected error occurred. Please try again.");
      console.error("Connect repo failed:", err);
    } finally {
      setConnecting(false);
    }
  }

  // ── Step 3: Discover Features ────────────────────────────────────

  const handleDiscoverFeatures = useCallback(async () => {
    if (!projectId) return;

    setDiscovering(true);
    setDiscoverError("");

    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: repoUrl,
          projectId,
          includeLLM: true,
          clearExisting: true,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        const count = data.persistedCount ?? data.features?.length ?? 0;
        setFeatureCount(count);
        setDiscoveryDone(true);
        await completeStep("discover", { featureCount: count });
      } else {
        setDiscoverError(data.error || data.details || "Feature discovery failed");
      }
    } catch (err) {
      setDiscoverError("Failed to discover features. You can try again later.");
      console.error("Discovery failed:", err);
    } finally {
      setDiscovering(false);
    }
  }, [projectId, repoUrl, completeStep]);

  useEffect(() => {
    if (currentStep === "discover" && projectId && !discoveryDone && !discovering && !discoverError) {
      handleDiscoverFeatures();
    }
  }, [currentStep, projectId, discoveryDone, discovering, discoverError, handleDiscoverFeatures]);

  // ── Step 4: Run Test ─────────────────────────────────────────────

  async function handleRunTest() {
    if (!testUrl.trim()) {
      setTestError("Please enter a URL to test");
      return;
    }

    setTestRunning(true);
    setTestError("");
    setTestResult(null);

    try {
      const res = await fetch("/api/test/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: testUrl.trim(), preset: testPreset, projectId }),
      });

      const data = await res.json();

      if (res.ok) {
        setTestResult({
          status: data.result?.status ?? data.status ?? "passed",
          testRunId: data.testRunId ?? data.result?.testRunId,
          summary: data.result?.summary,
        });
        await completeStep("first_test", {
          testRunId: data.testRunId ?? data.result?.testRunId,
        });
      } else {
        setTestError(data.error || data.details || "Test run failed");
      }
    } catch (err) {
      setTestError("Failed to run test. The service may be unavailable.");
      console.error("Test run failed:", err);
    } finally {
      setTestRunning(false);
    }
  }

  // ── Step 5: Complete ─────────────────────────────────────────────

  useEffect(() => {
    if (currentStep === "complete") {
      completeStep("complete");
    }
  }, [currentStep, completeStep]);

  // ── Progress Bar ─────────────────────────────────────────────────

  const progressValue = (completedSteps.length / STEPS.length) * 100;

  function renderProgress() {
    const currentIdx = stepIndex(currentStep);
    return (
      <div className="w-full max-w-2xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((step, idx) => {
            const isCompleted = completedSteps.includes(step.key);
            const isCurrent = step.key === currentStep;

            return (
              <div key={step.key} className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (isCompleted || idx <= currentIdx) goToStep(step.key);
                  }}
                  className={`
                    flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all duration-300
                    ${isCompleted
                      ? "bg-emerald border-emerald text-white"
                      : isCurrent
                        ? "bg-electric-violet border-electric-violet text-white scale-110"
                        : "bg-off-white border-gray-300 text-gray-400"
                    }
                  `}
                  aria-label={step.label}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <span className="text-xs font-semibold">{idx + 1}</span>
                  )}
                </button>
                <span
                  className={`hidden sm:inline text-xs font-medium ml-1 ${
                    isCurrent ? "text-electric-violet" : isCompleted ? "text-emerald" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`hidden sm:block w-6 lg:w-10 h-0.5 mx-1 rounded transition-colors duration-300 ${
                      isCompleted ? "bg-emerald" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <Progress value={progressValue} className="h-1.5" />
      </div>
    );
  }

  // ── Step Renderers ───────────────────────────────────────────────

  function renderWelcomeStep() {
    return (
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-deep-indigo to-electric-violet flex items-center justify-center shadow-lg">
            <Rocket className="size-8 text-white" />
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-deep-indigo">Welcome to Probato</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Let&apos;s get you set up in just a few steps
          </p>
        </div>
        <div className="bg-off-white rounded-xl p-6 text-left space-y-3 max-w-md mx-auto">
          <p className="text-sm text-deep-indigo font-medium">
            Probato is your AI-powered autonomous testing platform that helps you:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Search className="size-4 text-electric-violet mt-0.5 shrink-0" />
              <span>Discover testable features in your app automatically</span>
            </li>
            <li className="flex items-start gap-2">
              <Play className="size-4 text-emerald mt-0.5 shrink-0" />
              <span>Run intelligent tests with smart presets and actions</span>
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="size-4 text-amber mt-0.5 shrink-0" />
              <span>Auto-heal broken tests and get fix suggestions</span>
            </li>
          </ul>
        </div>
        <div className="flex flex-col items-center gap-3 pt-2">
          <Button
            size="lg"
            onClick={() => goToStep("connect_repo")}
            className="bg-electric-violet hover:bg-electric-violet/90 text-white px-8 gap-2"
          >
            Get Started
            <ArrowRight className="size-4" />
          </Button>
          <button
            onClick={skipOnboarding}
            className="text-sm text-muted-foreground hover:text-deep-indigo transition-colors flex items-center gap-1"
          >
            <SkipForward className="size-3" />
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  function renderConnectRepoStep() {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-deep-indigo/10 flex items-center justify-center">
              <Github className="size-6 text-deep-indigo" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-deep-indigo">Add Your App</h2>
          <p className="text-muted-foreground mt-1">Provide a live URL (fastest) or connect a GitHub repo</p>
        </div>

        <div className="space-y-4 max-w-md mx-auto">
          {/* Source Toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                projectSource === "url"
                  ? "bg-deep-indigo text-white"
                  : "bg-transparent text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => { setProjectSource("url"); setRepoError(""); }}
            >
              <Globe className="h-4 w-4" />
              Live URL
            </button>
            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                projectSource === "repo"
                  ? "bg-deep-indigo text-white"
                  : "bg-transparent text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => { setProjectSource("repo"); setRepoError(""); }}
            >
              <Github className="h-4 w-4" />
              Git Repository
            </button>
          </div>

          {projectSource === "url" ? (
            <div className="space-y-2">
              <Label htmlFor="liveUrl">App URL</Label>
              <Input
                id="liveUrl"
                placeholder="https://my-app.vercel.app"
                value={liveUrl}
                onChange={(e) => {
                  setLiveUrl(e.target.value);
                  setRepoError("");
                }}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">No Docker needed. The app will be tested directly at this URL.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="repoUrl">GitHub Repository URL</Label>
                <Input
                  id="repoUrl"
                  placeholder="https://github.com/user/repo"
                  value={repoUrl}
                  onChange={(e) => {
                    setRepoUrl(e.target.value);
                    setRepoError("");
                  }}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="h-11"
                />
              </div>
              <p className="text-xs text-muted-foreground">Probato will clone the repo and launch a sandboxed environment. Requires Docker.</p>
            </>
          )}

          {repoError && (
            <div className="flex items-center gap-2 text-sm text-warm-red bg-warm-red/10 rounded-lg p-3">
              <AlertCircle className="size-4 shrink-0" />
              {repoError}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleConnectRepo}
              disabled={connecting || (projectSource === "url" ? !liveUrl.trim() : !repoUrl.trim())}
              className="bg-electric-violet hover:bg-electric-violet/90 text-white flex-1 gap-2"
            >
              {connecting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Connect & Continue
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => goToStep("discover")}
              className="text-muted-foreground"
            >
              Skip
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderDiscoverStep() {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-electric-violet/10 flex items-center justify-center">
              <Search className="size-6 text-electric-violet" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-deep-indigo">Discover Features</h2>
          <p className="text-muted-foreground mt-1">
            Probato will analyze your app to find testable features
          </p>
        </div>

        <div className="max-w-md mx-auto">
          {projectId ? (
            discovering ? (
              <div className="text-center space-y-4 py-8">
                <div className="flex justify-center">
                  <div className="relative">
                    <Loader2 className="size-10 text-electric-violet animate-spin" />
                    <Search className="size-4 text-electric-violet absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                </div>
                <div>
                  <p className="font-medium text-deep-indigo">Analyzing your application...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Discovering pages, forms, and interactive elements
                  </p>
                </div>
                <Progress value={undefined} className="h-1.5 max-w-xs mx-auto animate-pulse" />
              </div>
            ) : discoveryDone ? (
              <div className="text-center space-y-4 py-6">
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-full bg-emerald/10 flex items-center justify-center">
                    <CheckCircle2 className="size-7 text-emerald" />
                  </div>
                </div>
                <div>
                  <p className="font-medium text-deep-indigo">Features Discovered!</p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Badge className="bg-emerald/10 text-emerald border-emerald/20 hover:bg-emerald/20">
                      <Search className="size-3 mr-1" />
                      {featureCount} feature{featureCount !== 1 ? "s" : ""} found
                    </Badge>
                  </div>
                </div>
              </div>
            ) : discoverError ? (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2 text-sm text-warm-red bg-warm-red/10 rounded-lg p-3">
                  <AlertCircle className="size-4 shrink-0" />
                  {discoverError}
                </div>
                <Button
                  onClick={handleDiscoverFeatures}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <Search className="size-4" />
                  Retry Discovery
                </Button>
              </div>
            ) : null
          ) : (
            <div className="text-center space-y-4 py-6">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-amber/10 flex items-center justify-center">
                  <SkipForward className="size-7 text-amber" />
                </div>
              </div>
              <p className="text-muted-foreground">
                No project connected yet. You can discover features later from the dashboard after connecting a repository.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-4">
            <Button
              onClick={() => goToStep("first_test")}
              disabled={discovering}
              className="bg-electric-violet hover:bg-electric-violet/90 text-white flex-1 gap-2"
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => goToStep("first_test")}
              disabled={discovering}
              className="text-muted-foreground"
            >
              Skip
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderFirstTestStep() {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald/10 flex items-center justify-center">
              <Play className="size-6 text-emerald" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-deep-indigo">Run Your First Test</h2>
          <p className="text-muted-foreground mt-1">
            See Probato in action with a quick test run
          </p>
        </div>

        <div className="space-y-4 max-w-md mx-auto">
          <div className="space-y-2">
            <Label htmlFor="testUrl">Target URL</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                id="testUrl"
                placeholder="https://example.com"
                value={testUrl}
                onChange={(e) => {
                  setTestUrl(e.target.value);
                  setTestError("");
                }}
                className="h-11 pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Test Preset</Label>
            <Select value={testPreset} onValueChange={setTestPreset}>
              <SelectTrigger className="w-full h-11">
                <SelectValue placeholder="Select preset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smoke">
                  <span className="flex items-center gap-2">
                    <Rocket className="size-3" /> Smoke Test
                  </span>
                </SelectItem>
                <SelectItem value="navigation">
                  <span className="flex items-center gap-2">
                    <Search className="size-3" /> Navigation Check
                  </span>
                </SelectItem>
                <SelectItem value="full-page-screenshot">
                  <span className="flex items-center gap-2">
                    <Sparkles className="size-3" /> Full Page Screenshot
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {testRunning && (
            <div className="text-center space-y-3 py-4">
              <Loader2 className="size-8 text-electric-violet animate-spin mx-auto" />
              <p className="text-sm font-medium text-deep-indigo">Running your test...</p>
              <Progress value={undefined} className="h-1.5 animate-pulse" />
            </div>
          )}

          {testResult && !testRunning && (
            <div
              className={`rounded-xl p-4 text-center space-y-2 ${
                testResult.status === "passed"
                  ? "bg-emerald/10 border border-emerald/20"
                  : "bg-warm-red/10 border border-warm-red/20"
              }`}
            >
              {testResult.status === "passed" ? (
                <>
                  <CheckCircle2 className="size-8 text-emerald mx-auto" />
                  <p className="font-semibold text-emerald">Test Passed!</p>
                  {testResult.summary && (
                    <p className="text-xs text-muted-foreground">
                      {testResult.summary.passed} passed, {testResult.summary.failed} failed
                    </p>
                  )}
                </>
              ) : (
                <>
                  <AlertCircle className="size-8 text-warm-red mx-auto" />
                  <p className="font-semibold text-warm-red">Test Failed</p>
                  <p className="text-xs text-muted-foreground">
                    Don&apos;t worry — you can review and re-run from the dashboard.
                  </p>
                </>
              )}
            </div>
          )}

          {testError && (
            <div className="flex items-center gap-2 text-sm text-warm-red bg-warm-red/10 rounded-lg p-3">
              <AlertCircle className="size-4 shrink-0" />
              {testError}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleRunTest}
              disabled={testRunning || !testUrl.trim()}
              className="bg-electric-violet hover:bg-electric-violet/90 text-white flex-1 gap-2"
            >
              {testRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Run Test
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => goToStep("complete")}
              disabled={testRunning}
              className="text-muted-foreground"
            >
              Skip
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderCompleteStep() {
    const repoConnected = completedSteps.includes("connect_repo");
    const featuresDiscovered = completedSteps.includes("discover");
    const testRan = completedSteps.includes("first_test");

    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald to-electric-violet flex items-center justify-center shadow-lg">
            <Sparkles className="size-8 text-white" />
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-bold text-deep-indigo">You&apos;re All Set!</h2>
          <p className="text-muted-foreground mt-1 text-lg">
            Your testing pipeline is ready
          </p>
        </div>

        <div className="bg-off-white rounded-xl p-5 max-w-sm mx-auto space-y-3">
          <p className="text-sm font-medium text-deep-indigo mb-3">Here&apos;s what you accomplished:</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {repoConnected ? (
                <CheckCircle2 className="size-4 text-emerald shrink-0" />
              ) : (
                <SkipForward className="size-4 text-amber shrink-0" />
              )}
              <span className={repoConnected ? "text-deep-indigo" : "text-muted-foreground"}>
                {repoConnected ? "Repository connected" : "Repository — skipped (connect later)"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {featuresDiscovered ? (
                <CheckCircle2 className="size-4 text-emerald shrink-0" />
              ) : (
                <SkipForward className="size-4 text-amber shrink-0" />
              )}
              <span className={featuresDiscovered ? "text-deep-indigo" : "text-muted-foreground"}>
                {featuresDiscovered
                  ? `${featureCount} feature${featureCount !== 1 ? "s" : ""} discovered`
                  : "Feature discovery — skipped"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {testRan ? (
                <CheckCircle2 className="size-4 text-emerald shrink-0" />
              ) : (
                <SkipForward className="size-4 text-amber shrink-0" />
              )}
              <span className={testRan ? "text-deep-indigo" : "text-muted-foreground"}>
                {testRan ? "First test completed" : "First test — skipped"}
              </span>
            </div>
          </div>
        </div>

        <Button
          size="lg"
          onClick={() => router.push("/dashboard")}
          className="bg-electric-violet hover:bg-electric-violet/90 text-white px-8 gap-2"
        >
          Go to Dashboard
          <ArrowRight className="size-4" />
        </Button>
      </div>
    );
  }

  // ── Main Render ──────────────────────────────────────────────────

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-off-white">
        <Loader2 className="size-8 text-electric-violet animate-spin" />
      </div>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-off-white to-white p-4 sm:p-6">
      {renderProgress()}

      <Card className="w-full max-w-xl border-0 shadow-xl shadow-deep-indigo/5 bg-white">
        <CardHeader className="pb-2" />
        <CardContent className="pb-8 px-6 sm:px-8">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              {currentStep === "welcome" && renderWelcomeStep()}
              {currentStep === "connect_repo" && renderConnectRepoStep()}
              {currentStep === "discover" && renderDiscoverStep()}
              {currentStep === "first_test" && renderFirstTestStep()}
              {currentStep === "complete" && renderCompleteStep()}
            </motion.div>
          </AnimatePresence>

          {/* Back button */}
          {currentStep !== "welcome" && currentStep !== "complete" && (
            <div className="mt-4 pt-4 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const prevIdx = stepIndex(currentStep) - 1;
                  if (prevIdx >= 0) goToStep(STEP_ORDER[prevIdx]);
                }}
                className="text-muted-foreground gap-1"
              >
                <ArrowLeft className="size-3" />
                Back
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-6">
        Probato — AI-Powered Autonomous Testing
      </p>
    </div>
  );
}
