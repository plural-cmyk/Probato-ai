"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  Bug,
  Github,
  Plus,
  LogOut,
  ExternalLink,
  FolderGit2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  RefreshCw,
  Terminal,
  X,
  Play,
  Globe,
  Camera,
  Link2,
  BrainCircuit,
  Code2,
  Zap,
  Eye,
  ChevronDown,
  ChevronRight,
  MousePointerClick,
  Timer,
  Wifi,
  WifiOff,
  Search,
  Sparkles,
  FileSearch,
  ListChecks,
  Webhook,
  GitBranch,
  ToggleLeft,
  CalendarClock,
  Pause,
  PlayCircle,
  ImageOff,
  ThumbsUp,
  ThumbsDown,
  ScanEye,
  Bell,
  BellOff,
  Settings2,
  Mail,
  MessageSquare,
  Hash,
  Trash,
  CreditCard,
  Key,
  Copy,
  Shield,
  Activity,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface Project {
  id: string;
  name: string;
  repoUrl: string;
  repoName: string;
  status: string;
  branch: string;
  sandboxId: string | null;
  sandboxUrl: string | null;
  createdAt: string;
  lastRunAt: string | null;
}

interface SandboxStatus {
  project: {
    id: string;
    name: string;
    status: string;
    sandboxUrl: string | null;
  };
  sandbox: {
    containerId: string;
    name: string;
    status: string;
    port?: number;
    url?: string;
  } | null;
  logs: string;
}

const SAMPLE_CODE = `import { useState } from 'react';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

export default function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState('');

  function addTodo() {
    if (!input.trim()) return;
    setTodos([...todos, { id: Date.now(), text: input, completed: false }]);
    setInput('');
  }

  function toggleTodo(id: number) {
    setTodos(todos.map(t =>
      t.id === id ? { ...t, completed: !t.completed } : t
    ));
  }

  function deleteTodo(id: number) {
    setTodos(todos.filter(t => t.id !== id));
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1>Todo App</h1>
      <form onSubmit={(e) => { e.preventDefault(); addTodo(); }}>
        <input
          data-testid="todo-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a todo..."
        />
        <button data-testid="add-todo-btn" type="submit">Add</button>
      </form>
      <ul data-testid="todo-list">
        {todos.map(todo => (
          <li key={todo.id} data-testid={\`todo-item-\${todo.id}\`}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id)}
            />
            <span style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}>
              {todo.text}
            </span>
            <button onClick={() => deleteTodo(todo.id)}>Delete</button>
          </li>
        ))}
      </ul>
      <p data-testid="todo-count">{todos.filter(t => !t.completed).length} items left</p>
    </div>
  );
}`;

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoName, setRepoName] = useState("");
  const [branch, setBranch] = useState("main");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus | null>(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [browseUrl, setBrowseUrl] = useState("https://probato-ai.vercel.app");
  const [browsing, setBrowsing] = useState(false);
  const [browseResult, setBrowseResult] = useState<{
    title: string;
    url: string;
    screenshot: string;
    links: string[];
    timestamp: string;
  } | null>(null);
  const [codeSnippet, setCodeSnippet] = useState(SAMPLE_CODE);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    summary: string;
    language: string;
    framework: string;
    components: { name: string; type: string; description: string; selectors?: string[] }[];
    routes: { path: string; method?: string; description: string }[];
    features: { name: string; type: string; description: string; testPriority: number }[];
    dependencies: string[];
    suggestions: string[];
  } | null>(null);

  // Test Runner state
  const [testUrl, setTestUrl] = useState("https://probato-ai.vercel.app");
  const [testPreset, setTestPreset] = useState("smoke");
  const [testRunning, setTestRunning] = useState(false);
  const [browserStatus, setBrowserStatus] = useState<{
    available: boolean;
    mode: string;
    error?: string;
  } | null>(null);
  const [testResult, setTestResult] = useState<{
    testRunId?: string;
    result: {
      status: string;
      error?: string;
      steps: {
        action: { type: string; label: string };
        status: string;
        screenshot?: string;
        actualText?: string;
        actualUrl?: string;
        error?: string;
        duration: number;
        timestamp: string;
      }[];
      startedAt: string;
      endedAt: string;
      duration: number;
      summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        errors: number;
      };
    };
  } | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  // Feature Discovery state
  const [discoverUrl, setDiscoverUrl] = useState("https://probato-ai.vercel.app");
  const [discoverProjectId, setDiscoverProjectId] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<{
    success: boolean;
    page: {
      url: string;
      title: string;
      forms: { selector: string; inputs: { selector: string; type?: string; placeholder?: string; label?: string }[]; submitButton?: { text?: string } }[];
      links: { text?: string; href?: string }[];
      buttons: { text?: string; selector: string }[];
      navigation: { text?: string; href?: string }[];
      headings: { level: number; text: string }[];
    };
    features: {
      name: string;
      type: string;
      description: string;
      selector?: string;
      priority: number;
      suggestedActions: { type: string; label: string }[];
    }[];
    persistedCount: number;
    duration: number;
    error?: string;
  } | null>(null);
  const [featureTestRunning, setFeatureTestRunning] = useState<string | null>(null);
  const [featureTestResult, setFeatureTestResult] = useState<{
    featureName: string;
    status: string;
    duration: number;
  } | null>(null);
  const [generatingTests, setGeneratingTests] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<{
    featureCount: number;
    savedCount: number;
    code?: string;
  } | null>(null);
  const [autoHealing, setAutoHealing] = useState(false);
  const [autoHealResult, setAutoHealResult] = useState<{
    healed: boolean;
    totalHealed: number;
    totalFailed: number;
    duration: number;
  } | null>(null);
  const [testOrder, setTestOrder] = useState<{
    levels: { id: string; name: string; type: string; priority: number }[][];
    totalFeatures: number;
    maxDepth: number;
    cycleCount: number;
  } | null>(null);

  // CI/CD Integration state
  const [ciData, setCiData] = useState<{
    installations: {
      id: string;
      githubInstallationId: number;
      accountLogin: string | null;
      accountType: string | null;
      status: string;
      repositoryCount?: number;
      repositories?: { id: string; name: string; enabled: boolean; projectId: string | null; defaultBranch: string; private: boolean }[];
    }[];
    recentEvents: {
      id: string;
      event: string;
      action: string | null;
      processed: boolean;
      processingError: string | null;
      triggeredTestRunId: string | null;
      createdAt: string;
    }[];
    syncedFromGitHub: boolean;
  } | null>(null);
  const [ciLoading, setCiLoading] = useState(false);

  // Schedule state
  const [schedules, setSchedules] = useState<{
    id: string;
    name: string;
    url: string;
    preset: string;
    cronExpression: string;
    enabled: boolean;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    nextRunAt: string | null;
    runCount: number;
    failCount: number;
    project: { id: string; name: string } | null;
  }[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState("");
  const [newScheduleUrl, setNewScheduleUrl] = useState("https://probato-ai.vercel.app");
  const [newSchedulePreset, setNewSchedulePreset] = useState("smoke");
  const [newScheduleCron, setNewScheduleCron] = useState("0 9 * * 1-5");
  const [creatingSchedule, setCreatingSchedule] = useState(false);

  // Visual Regression state
  const [visualBaselines, setVisualBaselines] = useState<{
    id: string;
    name: string;
    url: string;
    selector: string | null;
    viewportWidth: number;
    viewportHeight: number;
    approvedAt: string | null;
    createdAt: string;
    project: { id: string; name: string } | null;
    _count: { diffs: number };
  }[]>([]);
  const [visualDiffs, setVisualDiffs] = useState<{
    id: string;
    status: string;
    mismatchPercent: number;
    mismatchPixels: number;
    totalPixels: number;
    threshold: number;
    createdAt: string;
    baseline: { id: string; name: string; url: string };
    project: { id: string; name: string };
  }[]>([]);
  const [visualLoading, setVisualLoading] = useState(false);
  const [newBaselineName, setNewBaselineName] = useState("");
  const [newBaselineUrl, setNewBaselineUrl] = useState("https://probato-ai.vercel.app");
  const [newBaselineSelector, setNewBaselineSelector] = useState("");
  const [capturingBaseline, setCapturingBaseline] = useState(false);
  const [selectedDiffId, setSelectedDiffId] = useState<string | null>(null);
  const [diffDetail, setDiffDetail] = useState<{
    id: string;
    status: string;
    mismatchPercent: number;
    mismatchPixels: number;
    totalPixels: number;
    threshold: number;
    currentScreenshot: string;
    diffScreenshot: string | null;
    baseline: { id: string; name: string; url: string; screenshot: string };
  } | null>(null);

  // Notification state
  const [notifications, setNotifications] = useState<{
    id: string;
    type: string;
    title: string;
    message: string;
    status: string;
    priority: string;
    actionUrl: string | null;
    readAt: string | null;
    createdAt: string;
    project: { id: string; name: string } | null;
    testRun: { id: string; status: string; triggeredBy: string } | null;
  }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<{
    eventType: string;
    inApp: boolean;
    email: boolean;
    slack: boolean;
    webhook: boolean;
  }[]>([]);
  const [notifChannels, setNotifChannels] = useState<{
    id: string;
    type: string;
    label: string;
    config: Record<string, string>;
    enabled: boolean;
    verified: boolean;
    lastError: string | null;
    lastSentAt: string | null;
  }[]>([]);
  const [newChannelType, setNewChannelType] = useState("slack");
  const [newChannelLabel, setNewChannelLabel] = useState("");
  const [newChannelConfig, setNewChannelConfig] = useState<Record<string, string>>({});
  const [addingChannel, setAddingChannel] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);

  // Billing state
  const [billingData, setBillingData] = useState<{
    plans: { slug: string; name: string; description: string; price: number; credits: number; maxProjects: number; features: string[]; popular?: boolean }[];
    currentPlan: string;
    subscription: { status: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; gateway: string };
    credits: { balance: number; monthlyAllowance: number; purchasedBalance: number; totalUsed: number; totalReceived: number; autoRecharge: boolean; autoRechargeAmount: number; autoRechargeThreshold: number };
    recentTransactions: { id: string; type: string; amount: number; balanceAfter: number; action: string; description: string; createdAt: string }[];
    creditCosts: Record<string, { credits: number; unit: string; description: string }>;
    creditPacks: { credits: number; priceUsd: number; discountPercent: number; label: string }[];
  } | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [showBillingPanel, setShowBillingPanel] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<{
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    enabled: boolean;
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    usageCount: number;
  }[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [showApiKeysPanel, setShowApiKeysPanel] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["read"]);
  const [creatingKey, setCreatingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [apiUsageStats, setApiUsageStats] = useState<{
    aggregated: { totalCredits: number; avgResponseTime: number; totalRequests: number };
    statusBreakdown: { statusCode: number; count: number }[];
  } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects ?? []);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchProjects();
      // Check browser availability
      fetch("/api/browser/check")
        .then((res) => res.json())
        .then((data) => setBrowserStatus(data))
        .catch(() => setBrowserStatus({ available: false, mode: "unavailable", error: "Failed to check" }));
      // Load notification unread count
      fetch("/api/notifications?limit=1")
        .then((res) => res.json())
        .then((data) => setUnreadCount(data.unreadCount ?? 0))
        .catch(() => {});
      // Load billing data
      loadBillingData();
    }
  }, [status, fetchProjects]);

  async function createProject() {
    if (!repoUrl.trim()) return;

    setCreating(true);
    try {
      // Auto-extract repo name from URL if not provided
      const name =
        repoName.trim() ||
        repoUrl
          .replace(/\.git$/, "")
          .split("/")
          .pop() ||
        "untitled";

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, repoName: name, branch }),
      });

      if (res.ok) {
        const data = await res.json();
        setProjects((prev) => [data.project, ...prev]);
        setDialogOpen(false);
        setRepoUrl("");
        setRepoName("");
        setBranch("main");
      }
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setCreating(false);
    }
  }

  async function launchSandbox(projectId: string) {
    setLaunching(true);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      const data = await res.json();

      if (res.ok) {
        // Refresh projects to get updated status
        await fetchProjects();
        // Show sandbox status
        await checkSandbox(projectId);
      } else {
        alert(data.message || data.error || "Failed to launch sandbox");
      }
    } catch (error) {
      console.error("Failed to launch sandbox:", error);
      alert("Failed to launch sandbox. Is Docker running?");
    } finally {
      setLaunching(false);
    }
  }

  async function checkSandbox(projectId: string) {
    setSandboxLoading(true);
    try {
      const res = await fetch(`/api/sandbox/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setSandboxStatus(data);
      }
    } catch (error) {
      console.error("Failed to check sandbox:", error);
    } finally {
      setSandboxLoading(false);
    }
  }

  async function destroySandbox(projectId: string) {
    try {
      const res = await fetch(`/api/sandbox/${projectId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSandboxStatus(null);
        setSelectedProject(null);
        await fetchProjects();
      }
    } catch (error) {
      console.error("Failed to destroy sandbox:", error);
    }
  }

  async function browsePage() {
    if (!browseUrl.trim()) return;
    setBrowsing(true);
    setBrowseResult(null);
    try {
      const res = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: browseUrl, waitFor: 3000 }),
      });
      if (res.ok) {
        const data = await res.json();
        setBrowseResult(data);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to browse page");
      }
    } catch (error) {
      console.error("Failed to browse:", error);
      alert("Failed to browse page. The function may have timed out or the browser service is unavailable.");
    } finally {
      setBrowsing(false);
    }
  }

  async function analyzeCodeSnippet() {
    if (!codeSnippet.trim()) return;
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const res = await fetch("/api/llm/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeSnippet, filename: "App.tsx" }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysisResult(data.analysis);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to analyze code");
      }
    } catch (error) {
      console.error("Failed to analyze:", error);
      alert("Failed to analyze code. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runTest() {
    if (!testUrl.trim()) return;
    setTestRunning(true);
    setTestResult(null);
    setExpandedStep(null);
    try {
      const res = await fetch("/api/test/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: testUrl,
          preset: testPreset,
          screenshotEveryStep: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult(data);
      } else {
        // Show the actual error details from the server
        const errorMsg = data.details || data.error || "Failed to run test";
        // Set the result with the error so it renders in the UI
        setTestResult({
          result: {
            status: "error",
            error: errorMsg,
            steps: [],
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            duration: 0,
            summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 1 },
          },
        });
      }
    } catch (error) {
      console.error("Failed to run test:", error);
      setTestResult({
        result: {
          status: "error",
          error: "Request failed — the function may have timed out. On Vercel Hobby plan, tests have a 10-second limit.",
          steps: [],
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          duration: 0,
          summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 1 },
        },
      });
    } finally {
      setTestRunning(false);
    }
  }

  async function discoverPageFeatures() {
    if (!discoverUrl.trim()) return;
    setDiscovering(true);
    setDiscoverResult(null);
    setFeatureTestResult(null);
    try {
      const body: Record<string, string | boolean> = {
        url: discoverUrl,
        includeLLM: true,
      };
      if (discoverProjectId.trim()) {
        body.projectId = discoverProjectId.trim();
        body.clearExisting = true;
      }
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setDiscoverResult(data);
      } else {
        setDiscoverResult({
          success: false,
          page: { url: discoverUrl, title: "", forms: [], links: [], buttons: [], navigation: [], headings: [] },
          features: [],
          persistedCount: 0,
          duration: 0,
          error: data.details || data.error || "Discovery failed",
        });
      }
    } catch (error) {
      console.error("Feature discovery failed:", error);
      setDiscoverResult({
        success: false,
        page: { url: discoverUrl, title: "", forms: [], links: [], buttons: [], navigation: [], headings: [] },
        features: [],
        persistedCount: 0,
        duration: 0,
        error: "Request failed — the function may have timed out.",
      });
    } finally {
      setDiscovering(false);
    }
  }

  async function runFeatureTest(featureId: string, featureName: string) {
    setFeatureTestRunning(featureId);
    setFeatureTestResult(null);
    try {
      const res = await fetch(`/api/discover/${featureId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: discoverUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeatureTestResult({
          featureName,
          status: data.result?.status ?? "error",
          duration: data.result?.duration ?? 0,
        });
      } else {
        setFeatureTestResult({
          featureName,
          status: "error",
          duration: 0,
        });
      }
    } catch (error) {
      console.error("Feature test failed:", error);
      setFeatureTestResult({ featureName, status: "error", duration: 0 });
    } finally {
      setFeatureTestRunning(null);
    }
  }

  async function generateTests() {
    if (!discoverProjectId.trim()) return;
    setGeneratingTests(true);
    setGeneratedResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: discoverProjectId.trim(),
          url: discoverUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedResult({
          featureCount: data.featureCount,
          savedCount: data.savedCount,
          code: data.suite?.testCases?.[0]?.code,
        });
      } else {
        setGeneratedResult({ featureCount: 0, savedCount: 0 });
      }
    } catch {
      setGeneratedResult({ featureCount: 0, savedCount: 0 });
    } finally {
      setGeneratingTests(false);
    }
  }

  async function runAutoHeal() {
    setAutoHealing(true);
    setAutoHealResult(null);
    try {
      // Get the latest failed test run
      const res = await fetch("/api/test-runs", {
        method: "GET",
      });
      const data = await res.json();
      const failedRun = data.runs?.find((r: { status: string }) => r.status === "failed" || r.status === "error");
      if (!failedRun) {
        setAutoHealResult({ healed: false, totalHealed: 0, totalFailed: 0, duration: 0 });
        setAutoHealing(false);
        return;
      }

      const healRes = await fetch("/api/auto-heal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testRunId: failedRun.id, url: discoverUrl }),
      });
      const healData = await healRes.json();
      if (healRes.ok) {
        setAutoHealResult({
          healed: healData.healed,
          totalHealed: healData.report?.totalHealed ?? 0,
          totalFailed: healData.report?.totalFailed ?? 0,
          duration: healData.report?.duration ?? 0,
        });
      } else {
        setAutoHealResult({ healed: false, totalHealed: 0, totalFailed: 0, duration: 0 });
      }
    } catch {
      setAutoHealResult({ healed: false, totalHealed: 0, totalFailed: 0, duration: 0 });
    } finally {
      setAutoHealing(false);
    }
  }

  async function loadTestOrder() {
    if (!discoverProjectId.trim()) return;
    try {
      const res = await fetch(`/api/test-order?projectId=${discoverProjectId.trim()}&impact=true`);
      if (res.ok) {
        const data = await res.json();
        setTestOrder(data.executionOrder ?? null);
      }
    } catch {
      // Ignore
    }
  }

  async function loadCiData() {
    setCiLoading(true);
    try {
      const res = await fetch("/api/installations?includeRepos=true");
      if (res.ok) {
        const data = await res.json();
        setCiData(data);
      }
    } catch (error) {
      console.error("Failed to load CI/CD data:", error);
    } finally {
      setCiLoading(false);
    }
  }

  async function toggleRepoEnabled(repositoryId: string, enabled: boolean) {
    try {
      await fetch("/api/installations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryId, enabled: !enabled }),
      });
      // Reload CI data
      await loadCiData();
    } catch (error) {
      console.error("Failed to toggle repo:", error);
    }
  }

  async function loadSchedules() {
    setSchedulesLoading(true);
    try {
      const res = await fetch("/api/schedules");
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules ?? []);
      }
    } catch (error) {
      console.error("Failed to load schedules:", error);
    } finally {
      setSchedulesLoading(false);
    }
  }

  async function createSchedule() {
    if (!newScheduleName.trim() || !newScheduleUrl.trim()) return;
    setCreatingSchedule(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newScheduleName.trim(),
          url: newScheduleUrl.trim(),
          preset: newSchedulePreset,
          cronExpression: newScheduleCron,
        }),
      });
      if (res.ok) {
        setNewScheduleName("");
        await loadSchedules();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create schedule");
      }
    } catch (error) {
      console.error("Failed to create schedule:", error);
    } finally {
      setCreatingSchedule(false);
    }
  }

  async function toggleScheduleEnabled(scheduleId: string, enabled: boolean) {
    try {
      await fetch(`/api/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      await loadSchedules();
    } catch (error) {
      console.error("Failed to toggle schedule:", error);
    }
  }

  async function deleteSchedule(scheduleId: string) {
    try {
      await fetch(`/api/schedules/${scheduleId}`, {
        method: "DELETE",
      });
      await loadSchedules();
    } catch (error) {
      console.error("Failed to delete schedule:", error);
    }
  }

  // ── Visual Regression functions ─────────────────────────────────

  async function loadVisualBaselines() {
    setVisualLoading(true);
    try {
      const res = await fetch("/api/visual/baselines");
      if (res.ok) {
        const data = await res.json();
        setVisualBaselines(data.baselines ?? []);
      }
    } catch (error) {
      console.error("Failed to load visual baselines:", error);
    } finally {
      setVisualLoading(false);
    }
  }

  async function loadVisualDiffs() {
    try {
      const res = await fetch("/api/visual/diffs?status=pending");
      if (res.ok) {
        const data = await res.json();
        setVisualDiffs(data.diffs ?? []);
      }
    } catch (error) {
      console.error("Failed to load visual diffs:", error);
    }
  }

  async function captureBaseline() {
    if (!newBaselineName.trim() || !newBaselineUrl.trim() || projects.length === 0) return;
    setCapturingBaseline(true);
    try {
      const res = await fetch("/api/visual/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projects[0].id,
          name: newBaselineName.trim(),
          url: newBaselineUrl.trim(),
          selector: newBaselineSelector.trim() || undefined,
        }),
      });
      if (res.ok) {
        setNewBaselineName("");
        setNewBaselineSelector("");
        await loadVisualBaselines();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to capture baseline");
      }
    } catch (error) {
      console.error("Failed to capture baseline:", error);
      alert("Failed to capture baseline. The browser service may be unavailable.");
    } finally {
      setCapturingBaseline(false);
    }
  }

  async function deleteBaseline(baselineId: string) {
    try {
      await fetch(`/api/visual/baselines/${baselineId}`, { method: "DELETE" });
      await loadVisualBaselines();
      await loadVisualDiffs();
    } catch (error) {
      console.error("Failed to delete baseline:", error);
    }
  }

  async function compareBaseline(baselineId: string, url: string) {
    try {
      const res = await fetch("/api/visual/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineId, url, threshold: 0.1 }),
      });
      if (res.ok) {
        await loadVisualDiffs();
        await loadVisualBaselines();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to compare");
      }
    } catch (error) {
      console.error("Failed to compare:", error);
    }
  }

  async function viewDiff(diffId: string) {
    try {
      const res = await fetch(`/api/visual/diffs/${diffId}`);
      if (res.ok) {
        const data = await res.json();
        setDiffDetail(data.diff);
        setSelectedDiffId(diffId);
      }
    } catch (error) {
      console.error("Failed to load diff:", error);
    }
  }

  async function reviewDiff(diffId: string, status: "approved" | "rejected") {
    try {
      await fetch(`/api/visual/diffs/${diffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setDiffDetail(null);
      setSelectedDiffId(null);
      await loadVisualDiffs();
      await loadVisualBaselines();
    } catch (error) {
      console.error("Failed to review diff:", error);
    }
  }

  // ── Billing functions ──────────────────────────────────────────

  async function loadBillingData() {
    setBillingLoading(true);
    try {
      const res = await fetch("/api/billing");
      if (res.ok) {
        const data = await res.json();
        setBillingData(data);
      }
    } catch (error) {
      console.error("Failed to load billing data:", error);
    } finally {
      setBillingLoading(false);
    }
  }

  async function checkoutPlan(planSlug: string) {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planSlug }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          if (data.gateway === "mock") {
            await fetch("/api/billing/subscription", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ plan: planSlug, gateway: "mock" }),
            });
            await loadBillingData();
          } else {
            window.location.href = data.url;
          }
        }
      }
    } catch (error) {
      console.error("Checkout failed:", error);
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function purchaseCreditPack(packIndex: number) {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "purchase_pack", packIndex }),
      });
      if (res.ok) {
        await loadBillingData();
      }
    } catch (error) {
      console.error("Credit pack purchase failed:", error);
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function cancelSubscription() {
    if (!confirm("Are you sure you want to cancel? Your plan will revert to Free at the end of your billing period.")) return;
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) {
        await loadBillingData();
      }
    } catch (error) {
      console.error("Cancel failed:", error);
    }
  }

  async function toggleAutoRecharge(enabled: boolean) {
    try {
      await fetch("/api/billing/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "update_auto_recharge", autoRecharge: enabled }),
      });
      await loadBillingData();
    } catch (error) {
      console.error("Failed to update auto-recharge:", error);
    }
  }

  // ── API Keys functions ──────────────────────────────────────────

  async function loadApiKeys() {
    setApiKeysLoading(true);
    try {
      const res = await fetch("/api/api-keys");
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys ?? []);
      }
    } catch (error) {
      console.error("Failed to load API keys:", error);
    } finally {
      setApiKeysLoading(false);
    }
  }

  async function createApiKey() {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewlyCreatedKey(data.key);
        setNewKeyName("");
        setNewKeyScopes(["read"]);
        await loadApiKeys();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create API key");
      }
    } catch (error) {
      console.error("Failed to create API key:", error);
    } finally {
      setCreatingKey(false);
    }
  }

  async function revokeApiKey(keyId: string) {
    try {
      await fetch(`/api/api-keys/${keyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      await loadApiKeys();
    } catch (error) {
      console.error("Failed to revoke API key:", error);
    }
  }

  async function deleteApiKey(keyId: string) {
    if (!confirm("Permanently delete this API key? This cannot be undone.")) return;
    try {
      await fetch(`/api/api-keys/${keyId}`, { method: "DELETE" });
      await loadApiKeys();
    } catch (error) {
      console.error("Failed to delete API key:", error);
    }
  }

  async function rotateApiKey(keyId: string) {
    if (!confirm("Rotate this API key? The old key will stop working immediately.")) return;
    try {
      const res = await fetch(`/api/api-keys/${keyId}/rotate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setNewlyCreatedKey(data.key);
        await loadApiKeys();
      }
    } catch (error) {
      console.error("Failed to rotate API key:", error);
    }
  }

  async function loadApiUsage() {
    try {
      const res = await fetch("/api/v1/usage?days=7");
      if (res.ok) {
        const data = await res.json();
        setApiUsageStats(data.data ?? null);
      }
    } catch (error) {
      console.error("Failed to load API usage:", error);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  // ── Notification functions ──────────────────────────────────────

  async function loadNotifications() {
    setNotifLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      setNotifLoading(false);
    }
  }

  async function markNotificationRead(notifId: string) {
    try {
      await fetch(`/api/notifications/${notifId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "read" }),
      });
      await loadNotifications();
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  }

  async function dismissNotification(notifId: string) {
    try {
      await fetch(`/api/notifications/${notifId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      await loadNotifications();
    } catch (error) {
      console.error("Failed to dismiss notification:", error);
    }
  }

  async function markAllNotificationsRead() {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      await loadNotifications();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  }

  async function loadNotifPrefs() {
    try {
      const res = await fetch("/api/notifications/preferences");
      if (res.ok) {
        const data = await res.json();
        setNotifPrefs(data.preferences ?? []);
      }
    } catch (error) {
      console.error("Failed to load notification preferences:", error);
    }
  }

  async function updateNotifPref(eventType: string, field: "inApp" | "email" | "slack" | "webhook", value: boolean) {
    try {
      await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, [field]: value }),
      });
      await loadNotifPrefs();
    } catch (error) {
      console.error("Failed to update notification preference:", error);
    }
  }

  async function loadNotifChannels() {
    try {
      const res = await fetch("/api/notifications/channels");
      if (res.ok) {
        const data = await res.json();
        setNotifChannels(data.channels ?? []);
      }
    } catch (error) {
      console.error("Failed to load notification channels:", error);
    }
  }

  async function addNotifChannel() {
    if (!newChannelLabel.trim()) return;
    setAddingChannel(true);
    try {
      const res = await fetch("/api/notifications/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newChannelType,
          label: newChannelLabel.trim(),
          config: newChannelConfig,
        }),
      });
      if (res.ok) {
        setNewChannelLabel("");
        setNewChannelConfig({});
        await loadNotifChannels();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add channel");
      }
    } catch (error) {
      console.error("Failed to add notification channel:", error);
    } finally {
      setAddingChannel(false);
    }
  }

  async function deleteNotifChannel(channelId: string) {
    try {
      await fetch(`/api/notifications/channels/${channelId}`, { method: "DELETE" });
      await loadNotifChannels();
    } catch (error) {
      console.error("Failed to delete notification channel:", error);
    }
  }

  async function toggleChannelEnabled(channelId: string, enabled: boolean) {
    try {
      await fetch(`/api/notifications/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      await loadNotifChannels();
    } catch (error) {
      console.error("Failed to toggle channel:", error);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-deep-indigo" />
      </div>
    );
  }

  if (!session) return null;

  const statusColors: Record<string, string> = {
    pending: "bg-amber/10 text-amber border-amber/20",
    cloning: "bg-electric-violet/10 text-electric-violet border-electric-violet/20",
    running: "bg-emerald/10 text-emerald border-emerald/20",
    ready: "bg-emerald/10 text-emerald border-emerald/20",
    error: "bg-warm-red/10 text-warm-red border-warm-red/20",
  };

  const statusIcons: Record<string, typeof Clock> = {
    pending: Clock,
    cloning: Loader2,
    running: CheckCircle2,
    ready: CheckCircle2,
    error: AlertTriangle,
  };

  return (
    <div className="min-h-screen bg-off-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Probato" className="h-8 w-8 rounded-lg" />
            <span className="text-xl font-bold text-deep-indigo">Probato</span>
            <Badge variant="secondary" className="text-xs">
              Dashboard
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            {/* API Keys Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowApiKeysPanel(!showApiKeysPanel);
                if (!showApiKeysPanel) {
                  loadApiKeys();
                  loadApiUsage();
                }
              }}
            >
              <Key className="h-5 w-5 text-deep-indigo" />
            </Button>

            {/* Billing Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowBillingPanel(!showBillingPanel);
                if (!showBillingPanel && !billingData) loadBillingData();
              }}
            >
              <CreditCard className="h-5 w-5 text-deep-indigo" />
            </Button>
            {billingData && (
              <Badge variant="outline" className="text-xs border-deep-indigo/30 text-deep-indigo">
                {billingData.credits.balance} credits
              </Badge>
            )}

            {/* Notification Bell */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => {
                  setShowNotifPanel(!showNotifPanel);
                  if (!showNotifPanel) loadNotifications();
                }}
              >
                {unreadCount > 0 ? (
                  <Bell className="h-5 w-5 text-deep-indigo" />
                ) : (
                  <BellOff className="h-5 w-5 text-muted-foreground" />
                )}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-warm-red text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>

              {/* Notification Dropdown Panel */}
              {showNotifPanel && (
                <div className="absolute right-0 top-12 z-50 w-96 max-h-[500px] overflow-hidden rounded-lg border bg-white shadow-xl">
                  <div className="flex items-center justify-between p-3 border-b bg-zinc-50">
                    <span className="text-sm font-semibold">Notifications</span>
                    <div className="flex items-center gap-1">
                      {unreadCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={markAllNotificationsRead}
                        >
                          Mark all read
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setShowNotifSettings(!showNotifSettings);
                          if (!showNotifSettings) {
                            loadNotifPrefs();
                            loadNotifChannels();
                          }
                        }}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {showNotifSettings ? (
                    /* Notification Settings */
                    <div className="max-h-[420px] overflow-y-auto p-3 space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Notification Preferences</h4>
                        <div className="space-y-2">
                          {notifPrefs.map((pref) => (
                            <div key={pref.eventType} className="flex items-center justify-between py-1">
                              <span className="text-xs capitalize">{pref.eventType.replace(/_/g, " ")}</span>
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Switch
                                    checked={pref.inApp}
                                    onCheckedChange={(v) => updateNotifPref(pref.eventType, "inApp", v)}
                                    className="scale-75"
                                  />
                                  App
                                </label>
                                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Switch
                                    checked={pref.email}
                                    onCheckedChange={(v) => updateNotifPref(pref.eventType, "email", v)}
                                    className="scale-75"
                                  />
                                  Email
                                </label>
                                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Switch
                                    checked={pref.slack}
                                    onCheckedChange={(v) => updateNotifPref(pref.eventType, "slack", v)}
                                    className="scale-75"
                                  />
                                  Slack
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <h4 className="text-sm font-semibold mb-2">Channels</h4>
                        {notifChannels.length === 0 && (
                          <p className="text-xs text-muted-foreground mb-2">No channels configured. Add one below.</p>
                        )}
                        {notifChannels.map((ch) => (
                          <div key={ch.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              {ch.type === "email" && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
                              {ch.type === "slack" && <Hash className="h-3.5 w-3.5 text-[#4A154B]" />}
                              {ch.type === "discord" && <MessageSquare className="h-3.5 w-3.5 text-[#5865F2]" />}
                              {ch.type === "webhook" && <Link2 className="h-3.5 w-3.5 text-muted-foreground" />}
                              <div>
                                <span className="text-xs font-medium">{ch.label}</span>
                                {!ch.verified && ch.enabled && (
                                  <span className="ml-1 text-[10px] text-amber">(unverified)</span>
                                )}
                                {ch.lastError && (
                                  <p className="text-[10px] text-warm-red">{ch.lastError}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Switch
                                checked={ch.enabled}
                                onCheckedChange={() => toggleChannelEnabled(ch.id, ch.enabled)}
                                className="scale-75"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => deleteNotifChannel(ch.id)}
                              >
                                <Trash className="h-3 w-3 text-warm-red" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <Separator />

                      {/* Add Channel */}
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Add Channel</h4>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Select value={newChannelType} onValueChange={(v) => { setNewChannelType(v); setNewChannelConfig({}); }}>
                              <SelectTrigger className="w-28 h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="slack">Slack</SelectItem>
                                <SelectItem value="discord">Discord</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                                <SelectItem value="webhook">Webhook</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Label (e.g. 'Team Slack')"
                              value={newChannelLabel}
                              onChange={(e) => setNewChannelLabel(e.target.value)}
                              className="h-8 text-xs flex-1"
                            />
                          </div>
                          {(newChannelType === "slack" || newChannelType === "discord") && (
                            <Input
                              placeholder="Webhook URL"
                              value={newChannelConfig.webhookUrl || ""}
                              onChange={(e) => setNewChannelConfig({ ...newChannelConfig, webhookUrl: e.target.value })}
                              className="h-8 text-xs font-mono"
                            />
                          )}
                          {newChannelType === "email" && (
                            <Input
                              placeholder="Email address"
                              type="email"
                              value={newChannelConfig.email || ""}
                              onChange={(e) => setNewChannelConfig({ ...newChannelConfig, email: e.target.value })}
                              className="h-8 text-xs"
                            />
                          )}
                          {newChannelType === "webhook" && (
                            <>
                              <Input
                                placeholder="Webhook URL"
                                value={newChannelConfig.url || ""}
                                onChange={(e) => setNewChannelConfig({ ...newChannelConfig, url: e.target.value })}
                                className="h-8 text-xs font-mono"
                              />
                              <Input
                                placeholder="Secret (optional, for HMAC signing)"
                                value={newChannelConfig.secret || ""}
                                onChange={(e) => setNewChannelConfig({ ...newChannelConfig, secret: e.target.value })}
                                className="h-8 text-xs"
                              />
                            </>
                          )}
                          <Button
                            size="sm"
                            className="w-full h-8 text-xs bg-electric-violet hover:bg-electric-violet/90 text-white"
                            onClick={addNotifChannel}
                            disabled={addingChannel || !newChannelLabel.trim()}
                          >
                            {addingChannel ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            {addingChannel ? "Adding..." : "Add Channel"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Notification List */
                    <div className="max-h-[420px] overflow-y-auto">
                      {notifLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center py-8 text-muted-foreground">
                          <Bell className="h-8 w-8 mb-2 opacity-30" />
                          <p className="text-sm">No notifications yet</p>
                          <p className="text-xs">Test results and alerts will appear here</p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className={`flex items-start gap-3 p-3 border-b cursor-pointer hover:bg-zinc-50 transition-colors ${
                              notif.status === "unread" ? "bg-electric-violet/5" : ""
                            }`}
                            onClick={() => {
                              if (notif.status === "unread") markNotificationRead(notif.id);
                            }}
                          >
                            <div className="mt-0.5">
                              {notif.type === "test_pass" && <CheckCircle2 className="h-4 w-4 text-emerald" />}
                              {notif.type === "test_fail" && <AlertTriangle className="h-4 w-4 text-warm-red" />}
                              {notif.type === "test_error" && <AlertTriangle className="h-4 w-4 text-amber" />}
                              {notif.type === "visual_diff" && <ScanEye className="h-4 w-4 text-electric-violet" />}
                              {notif.type === "schedule_complete" && <CalendarClock className="h-4 w-4 text-blue-500" />}
                              {notif.type === "auto_heal" && <Zap className="h-4 w-4 text-purple-500" />}
                              {notif.type === "webhook_received" && <Webhook className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${notif.status === "unread" ? "font-semibold" : "font-medium"}`}>
                                {notif.title}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(notif.createdAt).toLocaleString()}
                                </span>
                                {notif.project && (
                                  <Badge variant="secondary" className="text-[10px] h-4">
                                    {notif.project.name}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissNotification(notif.id);
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={session.user?.image ?? undefined}
                      alt={session.user?.name ?? ""}
                    />
                    <AvatarFallback className="bg-deep-indigo text-white text-sm">
                      {session.user?.name
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium md:inline">
                    {session.user?.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{session.user?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {session.user?.email}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a
                    href={`https://github.com/${(session.user as Record<string, unknown>).githubLogin ?? ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <Github className="h-4 w-4" />
                    GitHub Profile
                    <ExternalLink className="ml-auto h-3 w-3" />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="text-warm-red focus:text-warm-red"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-deep-indigo">
            Welcome back, {session.user?.name?.split(" ")[0]}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Connect a repository to start generating automated tests.
          </p>
        </div>

        {/* Browser Status Banner */}
        {browserStatus && !browserStatus.available && (
          <div className="mb-6 rounded-lg border border-warm-red/30 bg-warm-red/5 p-4 flex items-start gap-3">
            <WifiOff className="h-5 w-5 text-warm-red shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warm-red">Browser service not connected</p>
              <p className="text-xs text-muted-foreground mt-1">
                {browserStatus.error || "No remote browser endpoint configured."}{" "}
                Add <code className="bg-zinc-100 px-1 py-0.5 rounded text-xs">BROWSERLESS_TOKEN</code> to your Vercel environment variables to enable browser testing.{" "}
                <a href="https://www.browserless.io/" target="_blank" rel="noopener noreferrer" className="text-electric-violet underline">
                  Get a free token at browserless.io
                </a>
              </p>
            </div>
          </div>
        )}
        {browserStatus && browserStatus.available && (
          <div className="mb-6 rounded-lg border border-emerald/30 bg-emerald/5 p-3 flex items-center gap-3">
            <Wifi className="h-4 w-4 text-emerald shrink-0" />
            <p className="text-sm text-emerald">
              Browser service connected
              <span className="text-xs text-muted-foreground ml-2">({browserStatus.mode})</span>
            </p>
          </div>
        )}

        {/* Quick Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Projects</CardDescription>
              <CardTitle className="text-3xl">{projects.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Running</CardDescription>
              <CardTitle className="text-3xl text-emerald">
                {projects.filter((p) => p.status === "running" || p.status === "ready").length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Needs Attention</CardDescription>
              <CardTitle className="text-3xl text-warm-red">
                {projects.filter((p) => p.status === "error").length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${unreadCount > 0 ? "border-electric-violet/30 hover:bg-electric-violet/5" : ""}`}
            onClick={() => {
              setShowNotifPanel(true);
              loadNotifications();
            }}
          >
            <CardHeader className="pb-2">
              <CardDescription>Unread Alerts</CardDescription>
              <CardTitle className="text-3xl text-electric-violet">{unreadCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Browser Test Section */}
        <Card className="mb-8 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-electric-violet/10">
                <Globe className="h-4 w-4 text-electric-violet" />
              </div>
              <div>
                <CardTitle className="text-base">Browser Automation</CardTitle>
                <CardDescription className="text-xs">
                  Launch a headless browser and capture screenshots of any page
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="https://example.com"
                value={browseUrl}
                onChange={(e) => setBrowseUrl(e.target.value)}
                className="font-mono text-sm"
                onKeyDown={(e) => e.key === "Enter" && browsePage()}
              />
              <Button
                className="bg-electric-violet hover:bg-electric-violet/90 text-white shrink-0"
                onClick={browsePage}
                disabled={browsing || !browseUrl.trim()}
              >
                {browsing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="mr-1.5 h-4 w-4" />
                )}
                {browsing ? "Browsing..." : "Capture"}
              </Button>
            </div>

            {browseResult && (
              <div className="space-y-3">
                {/* Screenshot */}
                <div className="rounded-lg border overflow-hidden bg-zinc-100">
                  <div className="flex items-center gap-2 px-3 py-2 bg-zinc-200/60 border-b text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    <span className="font-mono truncate">{browseResult.url}</span>
                    <span className="ml-auto">{browseResult.title}</span>
                  </div>
                  <img
                    src={`data:image/png;base64,${browseResult.screenshot}`}
                    alt="Page screenshot"
                    className="w-full"
                  />
                </div>

                {/* Links found */}
                {browseResult.links.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                      <Link2 className="h-3 w-3" />
                      {browseResult.links.length} links discovered
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {browseResult.links.slice(0, 20).map((link, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-xs font-mono truncate max-w-[200px]"
                          title={link}
                        >
                          {link.replace(/^https?:\/\//, "").split("/")[0]}
                        </Badge>
                      ))}
                      {browseResult.links.length > 20 && (
                        <Badge variant="secondary" className="text-xs">
                          +{browseResult.links.length - 20} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Captured at {new Date(browseResult.timestamp).toLocaleTimeString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Runner Section */}
        <Card className="mb-8 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-deep-indigo/10">
                <Zap className="h-4 w-4 text-deep-indigo" />
              </div>
              <div>
                <CardTitle className="text-base">Test Executor</CardTitle>
                <CardDescription className="text-xs">
                  Run automated browser tests against any URL
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Input row: URL + Preset + Run button */}
              <div className="flex gap-2 flex-col sm:flex-row">
                <Input
                  placeholder="https://your-app.com"
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  className="font-mono text-sm sm:flex-1"
                  onKeyDown={(e) => e.key === "Enter" && runTest()}
                />
                <Select value={testPreset} onValueChange={setTestPreset}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="smoke">Smoke Test</SelectItem>
                    <SelectItem value="navigation">Navigation</SelectItem>
                    <SelectItem value="login">Login Flow</SelectItem>
                    <SelectItem value="form">Form Test</SelectItem>
                    <SelectItem value="full-page-screenshot">Full Screenshot</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="bg-deep-indigo hover:bg-deep-indigo/90 text-white shrink-0"
                  onClick={runTest}
                  disabled={testRunning || !testUrl.trim()}
                >
                  {testRunning ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 h-4 w-4" />
                  )}
                  {testRunning ? "Running..." : "Run Test"}
                </Button>
              </div>

              {/* Preset description */}
              <div className="text-xs text-muted-foreground">
                {testPreset === "smoke" && "Loads the page, waits for body, takes screenshot, and reads the main heading."}
                {testPreset === "navigation" && "Loads the page, finds links, verifies navigation elements exist."}
                {testPreset === "login" && "Navigates to login, fills credentials, submits, and verifies redirect."}
                {testPreset === "form" && "Finds form elements, fills inputs, takes screenshots of each state."}
                {testPreset === "full-page-screenshot" && "Navigates to the page and captures a full-page screenshot."}
              </div>

              {/* Test Results */}
              {testResult && (
                <div className="space-y-4 pt-2">
                  {/* Top-level error (e.g. browser launch failure) */}
                  {testResult.result.error && (
                    <div className="rounded-lg border border-warm-red/30 bg-warm-red/5 p-4">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-warm-red shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-warm-red">Test execution failed</p>
                          <p className="text-xs text-muted-foreground mt-1 font-mono">{testResult.result.error}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Summary Bar */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-sm px-3 py-1 ${
                        testResult.result.status === "passed"
                          ? "bg-emerald/10 text-emerald border-emerald/20"
                          : testResult.result.status === "failed"
                          ? "bg-warm-red/10 text-warm-red border-warm-red/20"
                          : "bg-amber/10 text-amber border-amber/20"
                      }`}
                    >
                      {testResult.result.status === "passed" ? (
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {testResult.result.status.toUpperCase()}
                    </Badge>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Timer className="h-3.5 w-3.5" />
                      {(testResult.result.duration / 1000).toFixed(1)}s
                    </div>
                    <div className="flex gap-1.5 text-xs">
                      <Badge variant="secondary" className="text-emerald">
                        {testResult.result.summary.passed} passed
                      </Badge>
                      <Badge variant="secondary" className="text-warm-red">
                        {testResult.result.summary.failed} failed
                      </Badge>
                      {testResult.result.summary.skipped > 0 && (
                        <Badge variant="secondary">
                          {testResult.result.summary.skipped} skipped
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Step-by-step action log */}
                  <div className="space-y-1.5">
                    <h4 className="text-sm font-semibold text-deep-indigo flex items-center gap-1.5">
                      <MousePointerClick className="h-4 w-4" />
                      Action Log ({testResult.result.steps.length} steps)
                    </h4>
                    <div className="space-y-1">
                      {testResult.result.steps.map((step, i) => (
                        <div key={i} className="rounded-lg border bg-white">
                          {/* Step header - clickable to expand */}
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 transition-colors"
                            onClick={() =>
                              setExpandedStep(expandedStep === i ? null : i)
                            }
                          >
                            {/* Status icon */}
                            {step.status === "passed" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald shrink-0" />
                            ) : step.status === "failed" ? (
                              <AlertTriangle className="h-4 w-4 text-warm-red shrink-0" />
                            ) : step.status === "skipped" ? (
                              <Clock className="h-4 w-4 text-zinc-400 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber shrink-0" />
                            )}

                            {/* Step number */}
                            <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">
                              {i + 1}.
                            </span>

                            {/* Action type badge */}
                            <Badge variant="outline" className="text-xs shrink-0 capitalize">
                              {step.action.type}
                            </Badge>

                            {/* Action label */}
                            <span className="text-sm truncate flex-1">
                              {step.action.label}
                            </span>

                            {/* Duration */}
                            <span className="text-xs text-muted-foreground shrink-0">
                              {step.duration}ms
                            </span>

                            {/* Expand chevron */}
                            {(step.screenshot || step.error || step.actualText) && (
                              expandedStep === i ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                              )
                            )}
                          </button>

                          {/* Expanded details */}
                          {expandedStep === i && (
                            <div className="border-t px-3 py-3 space-y-3">
                              {/* Screenshot */}
                              {step.screenshot && (
                                <div>
                                  <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                                    <Camera className="h-3 w-3" />
                                    Screenshot
                                  </div>
                                  <div className="rounded-lg border overflow-hidden bg-zinc-100">
                                    <img
                                      src={`data:image/png;base64,${step.screenshot}`}
                                      alt={`Step ${i + 1} screenshot`}
                                      className="w-full max-h-80 object-contain"
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Error */}
                              {step.error && (
                                <div>
                                  <div className="text-xs font-medium text-warm-red mb-1">Error</div>
                                  <div className="bg-warm-red/5 border border-warm-red/20 rounded-lg p-3 text-sm text-warm-red font-mono">
                                    {step.error}
                                  </div>
                                </div>
                              )}

                              {/* Actual text read */}
                              {step.actualText && (
                                <div>
                                  <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                    <Eye className="h-3 w-3" />
                                    Text Read
                                  </div>
                                  <div className="bg-zinc-50 border rounded-lg p-3 text-sm font-mono">
                                    {step.actualText}
                                  </div>
                                </div>
                              )}

                              {/* URL after step */}
                              {step.actualUrl && (
                                <div className="text-xs text-muted-foreground font-mono truncate">
                                  URL: {step.actualUrl}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Feature Discovery Section */}
        <Card className="mb-8 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/10">
                <Sparkles className="h-4 w-4 text-amber" />
              </div>
              <div>
                <CardTitle className="text-base">Feature Discovery</CardTitle>
                <CardDescription className="text-xs">
                  Automatically discover testable features from any live URL
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Input row */}
              <div className="flex gap-2 flex-col sm:flex-row">
                <Input
                  placeholder="https://your-app.com"
                  value={discoverUrl}
                  onChange={(e) => setDiscoverUrl(e.target.value)}
                  className="font-mono text-sm sm:flex-1"
                  onKeyDown={(e) => e.key === "Enter" && discoverPageFeatures()}
                />
                <Input
                  placeholder="Project ID (optional, to save features)"
                  value={discoverProjectId}
                  onChange={(e) => setDiscoverProjectId(e.target.value)}
                  className="text-sm sm:w-[260px]"
                />
                <Button
                  className="bg-amber hover:bg-amber/90 text-white shrink-0"
                  onClick={discoverPageFeatures}
                  disabled={discovering || !discoverUrl.trim()}
                >
                  {discovering ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-1.5 h-4 w-4" />
                  )}
                  {discovering ? "Discovering..." : "Discover"}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Visits the URL with a headless browser, extracts forms, buttons, links, navigation, and analyzes with LLM
                to discover testable features. Optionally saves them to a project for persistent tracking.
              </p>

              {/* Error */}
              {discoverResult?.error && (
                <div className="rounded-lg border border-warm-red/30 bg-warm-red/5 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-warm-red shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-warm-red">Discovery failed</p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">{discoverResult.error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Discovery Results */}
              {discoverResult && discoverResult.success && (
                <div className="space-y-4 pt-2">
                  {/* Page Summary */}
                  <div className="rounded-lg border p-4 bg-white">
                    <div className="flex items-center gap-2 mb-3">
                      <FileSearch className="h-4 w-4 text-deep-indigo" />
                      <h4 className="text-sm font-semibold text-deep-indigo">Page Analysis</h4>
                      <Badge variant="secondary" className="text-xs ml-auto">
                        {(discoverResult.duration / 1000).toFixed(1)}s
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                      <div className="rounded-md bg-zinc-50 p-2">
                        <div className="text-lg font-bold text-deep-indigo">{discoverResult.page.forms.length}</div>
                        <div className="text-xs text-muted-foreground">Forms</div>
                      </div>
                      <div className="rounded-md bg-zinc-50 p-2">
                        <div className="text-lg font-bold text-deep-indigo">{discoverResult.page.links.length}</div>
                        <div className="text-xs text-muted-foreground">Links</div>
                      </div>
                      <div className="rounded-md bg-zinc-50 p-2">
                        <div className="text-lg font-bold text-deep-indigo">{discoverResult.page.buttons.length}</div>
                        <div className="text-xs text-muted-foreground">Buttons</div>
                      </div>
                      <div className="rounded-md bg-zinc-50 p-2">
                        <div className="text-lg font-bold text-deep-indigo">{discoverResult.page.navigation.length}</div>
                        <div className="text-xs text-muted-foreground">Nav Items</div>
                      </div>
                      <div className="rounded-md bg-zinc-50 p-2">
                        <div className="text-lg font-bold text-amber">{discoverResult.features.length}</div>
                        <div className="text-xs text-muted-foreground">Features</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      <strong>Title:</strong> {discoverResult.page.title || "No title"}
                      {discoverResult.persistedCount > 0 && (
                        <span className="ml-3 text-emerald">
                          <CheckCircle2 className="inline h-3 w-3 mr-0.5" />
                          {discoverResult.persistedCount} features saved to project
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Discovered Features */}
                  {discoverResult.features.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-deep-indigo flex items-center gap-1.5 mb-3">
                        <ListChecks className="h-4 w-4" />
                        Discovered Features ({discoverResult.features.length})
                      </h4>
                      <div className="space-y-2">
                        {discoverResult.features.map((feature, i) => (
                          <div key={i} className="rounded-lg border bg-white">
                            <div className="flex items-center gap-2 px-3 py-2.5">
                              {/* Priority badge */}
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

                              {/* Type badge */}
                              <Badge variant="secondary" className="shrink-0 text-xs capitalize">
                                {feature.type}
                              </Badge>

                              {/* Feature name */}
                              <span className="text-sm font-medium truncate flex-1">
                                {feature.name}
                              </span>

                              {/* Selector */}
                              {feature.selector && (
                                <code className="text-xs bg-zinc-100 px-1.5 py-0.5 rounded hidden sm:inline truncate max-w-[200px]">
                                  {feature.selector}
                                </code>
                              )}

                              {/* Test actions count */}
                              {feature.suggestedActions.length > 0 && (
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {feature.suggestedActions.length} steps
                                </Badge>
                              )}
                            </div>

                            {/* Description */}
                            <div className="border-t px-3 py-2">
                              <p className="text-xs text-muted-foreground">{feature.description}</p>

                              {/* Suggested actions preview */}
                              {feature.suggestedActions.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {feature.suggestedActions.slice(0, 5).map((action, j) => (
                                    <span
                                      key={j}
                                      className="text-xs bg-electric-violet/5 text-electric-violet border border-electric-violet/20 rounded px-1.5 py-0.5"
                                    >
                                      {j + 1}. {action.label || action.type}
                                    </span>
                                  ))}
                                  {feature.suggestedActions.length > 5 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{feature.suggestedActions.length - 5} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Action buttons for discovered features */}
                            {discoverProjectId.trim() && (
                              <div className="border-t px-3 py-2 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7"
                                  onClick={generateTests}
                                  disabled={generatingTests}
                                >
                                  {generatingTests ? (
                                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="mr-1 h-3 w-3" />
                                  )}
                                  Generate Tests
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7"
                                  onClick={runAutoHeal}
                                  disabled={autoHealing}
                                >
                                  {autoHealing ? (
                                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="mr-1 h-3 w-3" />
                                  )}
                                  Auto-Heal
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7"
                                  onClick={loadTestOrder}
                                >
                                  <ListChecks className="mr-1 h-3 w-3" />
                                  Test Order
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Page structure details */}
                  <details className="group">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-deep-indigo flex items-center gap-1">
                      <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                      View raw page structure
                    </summary>
                    <div className="mt-2 rounded-lg border bg-zinc-50 p-3 text-xs font-mono space-y-2 max-h-60 overflow-y-auto">
                      {discoverResult.page.headings.length > 0 && (
                        <div>
                          <strong>Headings:</strong>
                          {discoverResult.page.headings.map((h, i) => (
                            <div key={i} className="ml-2">H{h.level}: {h.text}</div>
                          ))}
                        </div>
                      )}
                      {discoverResult.page.forms.length > 0 && (
                        <div>
                          <strong>Forms:</strong>
                          {discoverResult.page.forms.map((form, i) => (
                            <div key={i} className="ml-2">
                              Form {i + 1} ({form.selector}): {form.inputs.length} input(s)
                              {form.submitButton && `, submit: "${form.submitButton.text}"`}
                            </div>
                          ))}
                        </div>
                      )}
                      {discoverResult.page.buttons.length > 0 && (
                        <div>
                          <strong>Buttons:</strong>
                          {discoverResult.page.buttons.slice(0, 10).map((btn, i) => (
                            <div key={i} className="ml-2">{btn.text ?? btn.selector}</div>
                          ))}
                        </div>
                      )}
                      {discoverResult.page.navigation.length > 0 && (
                        <div>
                          <strong>Navigation:</strong>
                          {discoverResult.page.navigation.slice(0, 10).map((nav, i) => (
                            <div key={i} className="ml-2">{nav.text} → {nav.href}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>

                  {/* Generated Tests Result */}
                  {generatedResult && (
                    <div className="rounded-lg border p-4 bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-amber" />
                        <h4 className="text-sm font-semibold text-deep-indigo">Generated Playwright Tests</h4>
                      </div>
                      <div className="flex gap-3 mb-2">
                        <Badge variant="secondary" className="text-xs">{generatedResult.featureCount} features</Badge>
                        <Badge variant="secondary" className="text-xs text-emerald">{generatedResult.savedCount} saved to DB</Badge>
                      </div>
                      {generatedResult.code && (
                        <details className="group">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-deep-indigo flex items-center gap-1">
                            <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                            View generated test code
                          </summary>
                          <pre className="mt-2 rounded-lg bg-zinc-950 text-zinc-100 p-3 text-xs font-mono overflow-x-auto max-h-60">
                            {generatedResult.code.substring(0, 2000)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}

                  {/* Auto-Heal Result */}
                  {autoHealResult && (
                    <div className={`rounded-lg border p-4 ${autoHealResult.healed ? "bg-emerald/5 border-emerald/30" : "bg-warm-red/5 border-warm-red/30"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <RefreshCw className={`h-4 w-4 ${autoHealResult.healed ? "text-emerald" : "text-warm-red"}`} />
                        <h4 className="text-sm font-semibold text-deep-indigo">Auto-Heal Result</h4>
                      </div>
                      <div className="flex gap-3">
                        <Badge variant="secondary" className={`text-xs ${autoHealResult.healed ? "text-emerald" : "text-warm-red"}`}>
                          {autoHealResult.healed ? "Healed" : "Could not heal"}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">{autoHealResult.totalHealed} selector(s) healed</Badge>
                        <Badge variant="secondary" className="text-xs text-muted-foreground">{(autoHealResult.duration / 1000).toFixed(1)}s</Badge>
                      </div>
                      {autoHealResult.totalFailed > 0 && (
                        <p className="text-xs text-warm-red mt-2">{autoHealResult.totalFailed} selector(s) could not be healed automatically</p>
                      )}
                    </div>
                  )}

                  {/* Test Execution Order */}
                  {testOrder && (
                    <div className="rounded-lg border p-4 bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <ListChecks className="h-4 w-4 text-deep-indigo" />
                        <h4 className="text-sm font-semibold text-deep-indigo">Test Execution Order</h4>
                        <Badge variant="secondary" className="text-xs ml-auto">{testOrder.totalFeatures} features, depth {testOrder.maxDepth}</Badge>
                      </div>
                      {testOrder.cycleCount > 0 && (
                        <p className="text-xs text-amber mb-2">⚠ {testOrder.cycleCount} circular dependency(ies) detected</p>
                      )}
                      <div className="space-y-2">
                        {testOrder.levels.map((level, levelIdx) => (
                          <div key={levelIdx} className="flex items-start gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-deep-indigo/10 text-xs font-bold text-deep-indigo shrink-0 mt-0.5">
                              {levelIdx + 1}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {level.map((feature) => (
                                <Badge
                                  key={feature.id}
                                  variant="outline"
                                  className={`text-xs ${
                                    feature.priority === 1
                                      ? "bg-warm-red/10 text-warm-red border-warm-red/20"
                                      : feature.priority === 2
                                      ? "bg-amber/10 text-amber border-amber/20"
                                      : "bg-emerald/10 text-emerald border-emerald/20"
                                  }`}
                                >
                                  {feature.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Features at the same level can run in parallel</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* LLM Code Analysis Section */}
        <Card className="mb-8 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald/10">
                <BrainCircuit className="h-4 w-4 text-emerald" />
              </div>
              <div>
                <CardTitle className="text-base">LLM Code Analysis</CardTitle>
                <CardDescription className="text-xs">
                  Paste code and let AI discover testable features
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <textarea
                  className="w-full h-48 rounded-lg border bg-zinc-950 text-zinc-100 p-4 font-mono text-xs resize-y focus:outline-none focus:ring-2 focus:ring-electric-violet"
                  value={codeSnippet}
                  onChange={(e) => setCodeSnippet(e.target.value)}
                  placeholder="Paste your code here..."
                />
              </div>
              <Button
                className="bg-emerald hover:bg-emerald/90 text-white"
                onClick={analyzeCodeSnippet}
                disabled={analyzing || !codeSnippet.trim()}
              >
                {analyzing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <BrainCircuit className="mr-1.5 h-4 w-4" />
                )}
                {analyzing ? "Analyzing..." : "Analyze Code"}
              </Button>

              {analysisResult && (
                <div className="space-y-4 pt-2">
                  {/* Summary */}
                  <div className="rounded-lg border p-4 bg-white">
                    <h4 className="text-sm font-semibold text-deep-indigo mb-2">Summary</h4>
                    <p className="text-sm text-muted-foreground">{analysisResult.summary}</p>
                    <div className="flex gap-2 mt-3">
                      <Badge variant="secondary">{analysisResult.language}</Badge>
                      <Badge variant="secondary">{analysisResult.framework}</Badge>
                    </div>
                  </div>

                  {/* Components */}
                  {analysisResult.components.length > 0 && (
                    <div className="rounded-lg border p-4 bg-white">
                      <h4 className="text-sm font-semibold text-deep-indigo mb-3">
                        <Code2 className="inline h-4 w-4 mr-1" />
                        Components ({analysisResult.components.length})
                      </h4>
                      <div className="space-y-2">
                        {analysisResult.components.map((comp, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <Badge variant="outline" className="shrink-0 text-xs">
                              {comp.type}
                            </Badge>
                            <div>
                              <span className="font-medium">{comp.name}</span>
                              <span className="text-muted-foreground"> — {comp.description}</span>
                              {comp.selectors && comp.selectors.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {comp.selectors.map((s, j) => (
                                    <code key={j} className="text-xs bg-zinc-100 px-1.5 py-0.5 rounded">
                                      {s}
                                    </code>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Routes */}
                  {analysisResult.routes.length > 0 && (
                    <div className="rounded-lg border p-4 bg-white">
                      <h4 className="text-sm font-semibold text-deep-indigo mb-3">Routes</h4>
                      <div className="space-y-2">
                        {analysisResult.routes.map((route, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            {route.method && (
                              <Badge variant="secondary" className="text-xs font-mono">
                                {route.method}
                              </Badge>
                            )}
                            <code className="text-xs bg-zinc-100 px-1.5 py-0.5 rounded">
                              {route.path}
                            </code>
                            <span className="text-muted-foreground">{route.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Features */}
                  {analysisResult.features.length > 0 && (
                    <div className="rounded-lg border p-4 bg-white">
                      <h4 className="text-sm font-semibold text-deep-indigo mb-3">Testable Features</h4>
                      <div className="space-y-2">
                        {analysisResult.features
                          .sort((a, b) => a.testPriority - b.testPriority)
                          .map((feat, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <Badge
                                variant="outline"
                                className={`shrink-0 text-xs ${
                                  feat.testPriority === 1
                                    ? "bg-warm-red/10 text-warm-red border-warm-red/20"
                                    : feat.testPriority === 2
                                    ? "bg-amber/10 text-amber border-amber/20"
                                    : "bg-emerald/10 text-emerald border-emerald/20"
                                }`}
                              >
                                P{feat.testPriority}
                              </Badge>
                              <div>
                                <span className="font-medium">{feat.name}</span>
                                <span className="text-muted-foreground"> — {feat.description}</span>
                                <Badge variant="secondary" className="ml-2 text-xs">
                                  {feat.type}
                                </Badge>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Dependencies */}
                  {analysisResult.dependencies.length > 0 && (
                    <div className="rounded-lg border p-4 bg-white">
                      <h4 className="text-sm font-semibold text-deep-indigo mb-2">Dependencies</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {analysisResult.dependencies.map((dep, i) => (
                          <Badge key={i} variant="secondary" className="text-xs font-mono">
                            {dep}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggestions */}
                  {analysisResult.suggestions.length > 0 && (
                    <div className="rounded-lg border p-4 bg-white">
                      <h4 className="text-sm font-semibold text-deep-indigo mb-2">Test Suggestions</h4>
                      <ul className="space-y-1.5">
                        {analysisResult.suggestions.map((s, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-emerald mt-0.5">•</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Projects Section */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-deep-indigo">Projects</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-deep-indigo hover:bg-deep-indigo/90 text-white"
                size="sm"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Connect a Repository</DialogTitle>
                <DialogDescription>
                  Enter the GitHub repository URL to connect. Probato will clone
                  it and prepare a sandboxed environment.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="repo-url">Repository URL</Label>
                  <Input
                    id="repo-url"
                    placeholder="https://github.com/owner/repo"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repo-name">Project Name (optional)</Label>
                  <Input
                    id="repo-name"
                    placeholder="Auto-detected from URL"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Select value={branch} onValueChange={setBranch}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main">main</SelectItem>
                      <SelectItem value="master">master</SelectItem>
                      <SelectItem value="develop">develop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full bg-deep-indigo hover:bg-deep-indigo/90 text-white"
                  onClick={createProject}
                  disabled={creating || !repoUrl.trim()}
                >
                  {creating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Github className="mr-2 h-4 w-4" />
                  )}
                  {creating ? "Connecting..." : "Connect Repository"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <Card className="mt-4 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-deep-indigo/5">
                <FolderGit2 className="h-8 w-8 text-deep-indigo/40" />
              </div>
              <h3 className="text-lg font-medium text-deep-indigo">
                No projects yet
              </h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Connect a GitHub repository to start discovering features and
                generating automated tests.
              </p>
              <Button
                className="mt-6 bg-deep-indigo hover:bg-deep-indigo/90 text-white"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Connect Repository
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const StatusIcon = statusIcons[project.status] ?? Clock;
              return (
                <Card
                  key={project.id}
                  className="transition-shadow hover:shadow-md border-border/50"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Github className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-base">
                          {project.repoName}
                        </CardTitle>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          statusColors[project.status] ?? statusColors.pending
                        }
                      >
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {project.status}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs font-mono">
                      {project.branch}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                      <span>
                        Added {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                      {project.sandboxUrl && (
                        <span className="text-emerald font-mono">
                          {project.sandboxUrl}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {project.status === "pending" && (
                        <Button
                          size="sm"
                          className="flex-1 bg-emerald hover:bg-emerald/90 text-white"
                          onClick={() => launchSandbox(project.id)}
                          disabled={launching}
                        >
                          {launching ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Launch Sandbox
                        </Button>
                      )}
                      {(project.status === "running" || project.status === "ready") && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              setSelectedProject(project);
                              checkSandbox(project.id);
                            }}
                          >
                            <Terminal className="mr-1.5 h-3.5 w-3.5" />
                            Status
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-warm-red hover:text-warm-red"
                            onClick={() => destroySandbox(project.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchProjects()}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-deep-indigo"
                        onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* CI/CD Integration Section */}
        <Card className="mb-8 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/10">
                  <Webhook className="h-4 w-4 text-amber" />
                </div>
                <div>
                  <CardTitle className="text-base">CI/CD Integration</CardTitle>
                  <CardDescription className="text-xs">
                    GitHub App — auto-trigger tests on push and pull requests
                  </CardDescription>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={loadCiData}
                disabled={ciLoading}
              >
                {ciLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {ciData ? (
              <div className="space-y-4">
                {/* Installations */}
                {ciData.installations.length > 0 ? (
                  <div className="space-y-3">
                    {ciData.installations.map((inst) => (
                      <div key={inst.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Github className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{inst.accountLogin || `Installation #${inst.githubInstallationId}`}</span>
                          <Badge variant="outline" className="text-xs">
                            {inst.accountType || "User"}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              inst.status === "active"
                                ? "bg-emerald/10 text-emerald border-emerald/20"
                                : inst.status === "suspended"
                                ? "bg-amber/10 text-amber border-amber/20"
                                : "bg-zinc-100 text-zinc-500"
                            }`}
                          >
                            {inst.status}
                          </Badge>
                        </div>

                        {/* Repositories */}
                        {inst.repositories && inst.repositories.length > 0 && (
                          <div className="pl-6 space-y-1">
                            {inst.repositories.map((repo) => (
                              <div key={repo.id} className="flex items-center gap-2 text-xs">
                                <GitBranch className="h-3 w-3 text-muted-foreground" />
                                <span className="font-mono">{repo.name}</span>
                                {repo.private && (
                                  <Badge variant="secondary" className="text-[10px] px-1">private</Badge>
                                )}
                                <span className="text-muted-foreground">{repo.defaultBranch}</span>
                                <button
                                  onClick={() => toggleRepoEnabled(repo.id, repo.enabled)}
                                  className="ml-auto"
                                  title={repo.enabled ? "Disable CI/CD" : "Enable CI/CD"}
                                >
                                  <ToggleLeft
                                    className={`h-4 w-4 ${
                                      repo.enabled ? "text-emerald" : "text-zinc-300"
                                    }`}
                                  />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 space-y-3">
                    <Webhook className="h-8 w-8 text-muted-foreground mx-auto" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">No GitHub App installations yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Install the Probato GitHub App on your repositories to enable automatic test runs on push and PR events.
                      </p>
                    </div>
                  </div>
                )}

                {/* Recent Webhook Events */}
                {ciData.recentEvents.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-deep-indigo mb-2 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Recent Events
                    </h4>
                    <div className="space-y-1">
                      {ciData.recentEvents.slice(0, 10).map((event) => (
                        <div key={event.id} className="flex items-center gap-2 text-xs py-1">
                          {event.processed ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald shrink-0" />
                          ) : (
                            <Loader2 className="h-3 w-3 animate-spin text-amber shrink-0" />
                          )}
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {event.event}
                          </Badge>
                          {event.action && (
                            <span className="text-muted-foreground">{event.action}</span>
                          )}
                          {event.processingError && (
                            <span className="text-warm-red truncate">{event.processingError}</span>
                          )}
                          {event.triggeredTestRunId && (
                            <Badge variant="secondary" className="text-[10px] ml-auto">
                              test triggered
                            </Badge>
                          )}
                          <span className="text-muted-foreground ml-auto shrink-0">
                            {new Date(event.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">
                  Click refresh to load CI/CD integration status
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scheduled Tests Section */}
        <Card className="mb-8 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/10">
                  <CalendarClock className="h-4 w-4 text-amber" />
                </div>
                <div>
                  <CardTitle className="text-base">Scheduled Tests</CardTitle>
                  <CardDescription className="text-xs">
                    Schedule recurring browser tests with cron expressions
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadSchedules}
                disabled={schedulesLoading}
              >
                {schedulesLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Create Schedule Form */}
              <div className="space-y-3 p-4 rounded-lg border bg-zinc-50">
                <h4 className="text-sm font-semibold text-deep-indigo flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />
                  New Schedule
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs mb-1">Name</Label>
                    <Input
                      placeholder="Daily Smoke Test"
                      value={newScheduleName}
                      onChange={(e) => setNewScheduleName(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1">URL</Label>
                    <Input
                      placeholder="https://your-app.com"
                      value={newScheduleUrl}
                      onChange={(e) => setNewScheduleUrl(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1">Preset</Label>
                    <Select value={newSchedulePreset} onValueChange={setNewSchedulePreset}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="smoke">Smoke Test</SelectItem>
                        <SelectItem value="navigation">Navigation</SelectItem>
                        <SelectItem value="login">Login Flow</SelectItem>
                        <SelectItem value="form">Form Test</SelectItem>
                        <SelectItem value="full-page-screenshot">Full Screenshot</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1">Schedule (cron)</Label>
                    <Input
                      placeholder="0 9 * * 1-5"
                      value={newScheduleCron}
                      onChange={(e) => setNewScheduleCron(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Common: <code>*/30 * * * *</code> (30min), <code>0 9 * * 1-5</code> (weekdays 9am), <code>0 */6 * * *</code> (every 6h)
                  </p>
                  <Button
                    size="sm"
                    className="bg-amber hover:bg-amber/90 text-white"
                    onClick={createSchedule}
                    disabled={creatingSchedule || !newScheduleName.trim() || !newScheduleUrl.trim()}
                  >
                    {creatingSchedule ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-4 w-4" />
                    )}
                    {creatingSchedule ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>

              {/* Existing Schedules List */}
              {schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No scheduled tests yet. Create one above to run tests automatically.
                </p>
              ) : (
                <div className="space-y-2">
                  {schedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className={`rounded-lg border p-3 flex items-center gap-3 ${
                        schedule.enabled ? "bg-white" : "bg-zinc-50 opacity-70"
                      }`}
                    >
                      {/* Status icon */}
                      <div className="shrink-0">
                        {schedule.enabled ? (
                          <CalendarClock className="h-5 w-5 text-amber" />
                        ) : (
                          <CalendarClock className="h-5 w-5 text-zinc-400" />
                        )}
                      </div>

                      {/* Schedule info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{schedule.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-xs shrink-0 ${
                              schedule.enabled
                                ? "bg-emerald/10 text-emerald border-emerald/20"
                                : "bg-zinc-100 text-zinc-500 border-zinc-200"
                            }`}
                          >
                            {schedule.enabled ? "Active" : "Paused"}
                          </Badge>
                          {schedule.lastRunStatus && (
                            <Badge
                              variant="outline"
                              className={`text-xs shrink-0 ${
                                schedule.lastRunStatus === "passed"
                                  ? "bg-emerald/10 text-emerald border-emerald/20"
                                  : schedule.lastRunStatus === "failed"
                                  ? "bg-warm-red/10 text-warm-red border-warm-red/20"
                                  : "bg-amber/10 text-amber border-amber/20"
                              }`}
                            >
                              {schedule.lastRunStatus}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="font-mono truncate">{schedule.url}</span>
                          <span className="shrink-0">
                            <code className="bg-zinc-100 px-1.5 py-0.5 rounded">{schedule.cronExpression}</code>
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{schedule.runCount} runs</span>
                          {schedule.failCount > 0 && (
                            <span className="text-warm-red">{schedule.failCount} failed</span>
                          )}
                          {schedule.nextRunAt && schedule.enabled && (
                            <span className="text-emerald">
                              Next: {new Date(schedule.nextRunAt).toLocaleString()}
                            </span>
                          )}
                          {schedule.lastRunAt && (
                            <span>
                              Last: {new Date(schedule.lastRunAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleScheduleEnabled(schedule.id, schedule.enabled)}
                          title={schedule.enabled ? "Pause schedule" : "Enable schedule"}
                        >
                          {schedule.enabled ? (
                            <Pause className="h-4 w-4 text-amber" />
                          ) : (
                            <PlayCircle className="h-4 w-4 text-emerald" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteSchedule(schedule.id)}
                          className="text-warm-red hover:text-warm-red"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Visual Regression Section */}
        <Card className="mb-8 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10">
                  <ScanEye className="h-4 w-4 text-rose-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Visual Regression</CardTitle>
                  <CardDescription className="text-xs">
                    Capture baselines, detect visual changes, review diffs
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { loadVisualBaselines(); loadVisualDiffs(); }}
                disabled={visualLoading}
              >
                {visualLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Capture Baseline Form */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Capture New Baseline</Label>
                <div className="flex gap-2 flex-col sm:flex-row">
                  <Input
                    placeholder="Baseline name (e.g. Homepage)"
                    value={newBaselineName}
                    onChange={(e) => setNewBaselineName(e.target.value)}
                    className="sm:flex-1 text-sm"
                  />
                  <Input
                    placeholder="https://example.com"
                    value={newBaselineUrl}
                    onChange={(e) => setNewBaselineUrl(e.target.value)}
                    className="sm:flex-1 text-sm font-mono"
                  />
                  <Input
                    placeholder="CSS selector (optional)"
                    value={newBaselineSelector}
                    onChange={(e) => setNewBaselineSelector(e.target.value)}
                    className="sm:w-40 text-sm font-mono"
                  />
                  <Button
                    className="bg-rose-500 hover:bg-rose-600 text-white shrink-0"
                    onClick={captureBaseline}
                    disabled={capturingBaseline || !newBaselineName.trim() || !newBaselineUrl.trim() || projects.length === 0}
                  >
                    {capturingBaseline ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
                    {capturingBaseline ? "Capturing..." : "Capture"}
                  </Button>
                </div>
                {projects.length === 0 && (
                  <p className="text-xs text-amber">Create a project first to capture baselines.</p>
                )}
              </div>

              {/* Baselines List */}
              {visualBaselines.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Baselines ({visualBaselines.length})</Label>
                  <div className="space-y-2">
                    {visualBaselines.map((baseline) => (
                      <div key={baseline.id} className="rounded-lg border p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ImageOff className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{baseline.name}</span>
                            {baseline.approvedAt && (
                              <Badge variant="outline" className="text-xs bg-emerald/10 text-emerald border-emerald/20">
                                Approved
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => compareBaseline(baseline.id, baseline.url)}
                            >
                              <ScanEye className="h-3 w-3 mr-1" />
                              Compare
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteBaseline(baseline.id)}
                              className="text-warm-red hover:text-warm-red h-7"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-mono truncate">{baseline.url}</span>
                          {baseline.selector && (
                            <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">{baseline.selector}</span>
                          )}
                          <span>{baseline.viewportWidth}x{baseline.viewportHeight}</span>
                          {baseline._count.diffs > 0 && (
                            <span>{baseline._count.diffs} diffs</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Diffs */}
              {visualDiffs.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Pending Reviews ({visualDiffs.length})
                  </Label>
                  <div className="space-y-2">
                    {visualDiffs.map((diff) => (
                      <div key={diff.id} className="rounded-lg border border-amber/30 bg-amber/5 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber" />
                            <span className="text-sm font-medium">{diff.baseline.name}</span>
                            <Badge variant="outline" className="text-xs bg-warm-red/10 text-warm-red border-warm-red/20">
                              {diff.mismatchPercent.toFixed(2)}% diff
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => viewDiff(diff.id)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 text-emerald hover:text-emerald"
                              onClick={() => reviewDiff(diff.id, "approved")}
                            >
                              <ThumbsUp className="h-3 w-3 mr-1" />
                              Accept
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 text-warm-red hover:text-warm-red"
                              onClick={() => reviewDiff(diff.id, "rejected")}
                            >
                              <ThumbsDown className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{diff.baseline.url}</span>
                          <span className="ml-3">{diff.mismatchPixels.toLocaleString()} / {diff.totalPixels.toLocaleString()} pixels</span>
                          <span className="ml-3">{new Date(diff.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diff Detail Viewer */}
              {diffDetail && (
                <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageOff className="h-5 w-5 text-rose-500" />
                      <span className="text-sm font-semibold">Visual Diff: {diffDetail.baseline.name}</span>
                      <Badge variant="outline" className="text-xs bg-warm-red/10 text-warm-red border-warm-red/20">
                        {diffDetail.mismatchPercent.toFixed(2)}% mismatch
                      </Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setDiffDetail(null); setSelectedDiffId(null); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Baseline */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Baseline</p>
                      <div className="rounded border overflow-hidden bg-white">
                        <img
                          src={`data:image/png;base64,${diffDetail.baseline.screenshot}`}
                          alt="Baseline screenshot"
                          className="w-full"
                        />
                      </div>
                    </div>
                    {/* Current */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Current</p>
                      <div className="rounded border overflow-hidden bg-white">
                        <img
                          src={`data:image/png;base64,${diffDetail.currentScreenshot}`}
                          alt="Current screenshot"
                          className="w-full"
                        />
                      </div>
                    </div>
                    {/* Diff */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-rose-500">Diff (red = changed)</p>
                      <div className="rounded border overflow-hidden bg-white">
                        {diffDetail.diffScreenshot ? (
                          <img
                            src={`data:image/png;base64,${diffDetail.diffScreenshot}`}
                            alt="Diff overlay"
                            className="w-full"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                            No diff image
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{diffDetail.mismatchPixels.toLocaleString()} / {diffDetail.totalPixels.toLocaleString()} pixels differ</span>
                    <span>Threshold: {(diffDetail.threshold * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="bg-emerald hover:bg-emerald/90 text-white"
                      onClick={() => reviewDiff(diffDetail.id, "approved")}
                    >
                      <ThumbsUp className="mr-1.5 h-4 w-4" />
                      Accept (update baseline)
                    </Button>
                    <Button
                      variant="outline"
                      className="text-warm-red hover:text-warm-red"
                      onClick={() => reviewDiff(diffDetail.id, "rejected")}
                    >
                      <ThumbsDown className="mr-1.5 h-4 w-4" />
                      Reject (keep baseline)
                    </Button>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {visualBaselines.length === 0 && visualDiffs.length === 0 && !visualLoading && (
                <div className="text-center py-6 text-muted-foreground">
                  <ScanEye className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No visual baselines yet.</p>
                  <p className="text-xs">Capture a baseline screenshot to start detecting visual changes.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Sandbox Status Drawer */}
      {selectedProject && sandboxStatus && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => {
              setSelectedProject(null);
              setSandboxStatus(null);
            }}
          />
          <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="font-semibold text-deep-indigo">
                Sandbox: {selectedProject.repoName}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedProject(null);
                  setSandboxStatus(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              {/* Status */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Status:</span>
                <Badge
                  variant="outline"
                  className={statusColors[sandboxStatus.project.status] ?? ""}
                >
                  {sandboxStatus.project.status}
                </Badge>
              </div>

              {/* Container Info */}
              {sandboxStatus.sandbox && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Container</CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs font-mono space-y-1">
                    <div>ID: {sandboxStatus.sandbox.containerId.slice(0, 12)}</div>
                    <div>Name: {sandboxStatus.sandbox.name}</div>
                    <div>Port: {sandboxStatus.sandbox.port ?? "N/A"}</div>
                    <div>
                      URL:{" "}
                      <span className="text-emerald">
                        {sandboxStatus.sandbox.url ?? "N/A"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Logs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Logs</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => checkSandbox(selectedProject.id)}
                    disabled={sandboxLoading}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${sandboxLoading ? "animate-spin" : ""}`}
                    />
                  </Button>
                </div>
                <div className="bg-zinc-900 text-zinc-100 rounded-lg p-4 text-xs font-mono max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {sandboxStatus.logs || "No logs available"}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => checkSandbox(selectedProject.id)}
                  disabled={sandboxLoading}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  className="text-warm-red hover:text-warm-red"
                  onClick={() => destroySandbox(selectedProject.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Destroy
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Keys Dialog */}
      <Dialog open={showApiKeysPanel} onOpenChange={setShowApiKeysPanel}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-deep-indigo" />
              API Keys & Developer Access
            </DialogTitle>
            <DialogDescription>
              Manage API keys for programmatic access to Probato. Use the SDK or REST API to integrate testing into your CI/CD pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Quick Start */}
            <Card className="border-deep-indigo/20 bg-deep-indigo/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Quick Start</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <p><strong>Base URL:</strong> <code className="bg-white px-1 rounded">{typeof window !== "undefined" ? window.location.origin : "https://probato.ai"}/api/v1</code></p>
                <p><strong>Auth:</strong> <code className="bg-white px-1 rounded">Authorization: Bearer pb_live_xxx</code></p>
                <p><strong>SDK:</strong> <code className="bg-white px-1 rounded">npm install @probato/sdk</code></p>
                <div className="bg-zinc-900 text-green-400 p-2 rounded text-[11px] font-mono overflow-x-auto">
                  <pre>{`import { Probato } from '@probato/sdk';

const client = new Probato({
  apiKey: 'pb_live_your_key_here',
});

// List projects
const { items } = await client.projects.list();

// Discover features (6 credits)
await client.discovery.discover({
  url: 'https://your-app.com',
});

// Trigger test run (2 credits)
await client.projects.triggerTestRun(projectId);`}</pre>
                </div>
              </CardContent>
            </Card>

            {/* Create New Key */}
            {newlyCreatedKey && (
              <Card className="border-emerald bg-emerald/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-emerald flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    API Key Created — Save It Now!
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white p-2 rounded text-xs font-mono break-all">{newlyCreatedKey}</code>
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(newlyCreatedKey)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-warm-red mt-2">This key will not be shown again. Copy it now.</p>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="Key name (e.g. CI/CD Pipeline)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="flex-1"
              />
              <div className="flex gap-1">
                {["read", "write"].map((scope) => (
                  <Button
                    key={scope}
                    size="sm"
                    variant={newKeyScopes.includes(scope) ? "default" : "outline"}
                    onClick={() =>
                      setNewKeyScopes((prev) =>
                        prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
                      )
                    }
                    className="text-xs h-9"
                  >
                    {scope}
                  </Button>
                ))}
              </div>
              <Button onClick={createApiKey} disabled={creatingKey || !newKeyName.trim()}>
                {creatingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>

            {/* Existing Keys */}
            {apiKeysLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-deep-indigo" /></div>
            ) : apiKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No API keys yet. Create one above.</p>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${key.enabled ? "bg-emerald" : "bg-zinc-300"}`} />
                      <div>
                        <p className="text-sm font-medium">{key.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <code>{key.prefix}...</code> &middot; Scopes: {key.scopes.join(", ")} &middot; {key.usageCount} req (30d)
                          {key.lastUsedAt && <> &middot; Last used {new Date(key.lastUsedAt).toLocaleDateString()}</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {key.enabled && (
                        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => rotateApiKey(key.id)}>
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                      {key.enabled ? (
                        <Button size="sm" variant="ghost" className="text-xs h-7 text-amber" onClick={() => revokeApiKey(key.id)}>
                          Disable
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-xs h-7 text-warm-red" onClick={() => deleteApiKey(key.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Usage Stats */}
            {apiUsageStats && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4 text-deep-indigo" />
                    API Usage (Last 7 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-deep-indigo">{apiUsageStats.aggregated.totalRequests}</p>
                      <p className="text-xs text-muted-foreground">Requests</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-deep-indigo">{apiUsageStats.aggregated.totalCredits}</p>
                      <p className="text-xs text-muted-foreground">Credits Used</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-deep-indigo">{apiUsageStats.aggregated.avgResponseTime}ms</p>
                      <p className="text-xs text-muted-foreground">Avg Response</p>
                    </div>
                  </div>
                  {apiUsageStats.statusBreakdown.length > 0 && (
                    <div className="mt-3 flex gap-2">
                      {apiUsageStats.statusBreakdown.map((s) => (
                        <Badge key={s.statusCode} variant={s.statusCode < 400 ? "secondary" : "destructive"} className="text-xs">
                          {s.statusCode}: {s.count}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* API Docs Link */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <BookOpen className="h-3 w-3" />
              <span>OpenAPI spec at <code>/api/v1/docs</code> &middot; Health check at <code>/api/v1/health</code></span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Billing Dialog */}
      <Dialog open={showBillingPanel} onOpenChange={setShowBillingPanel}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Billing &amp; Subscription
            </DialogTitle>
            <DialogDescription>
              Manage your plan, credits, and subscription
            </DialogDescription>
          </DialogHeader>

          {billingLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-deep-indigo" />
            </div>
          ) : billingData ? (
            <div className="space-y-6">
              {/* Current Plan Summary */}
              <Card className="border-deep-indigo/20 bg-deep-indigo/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {billingData.plans.find((p: { slug: string; name: string; description: string; price: number; credits: number; maxProjects: number; features: string[]; popular?: boolean }) => p.slug === billingData.currentPlan)?.name ?? "Free"} Plan
                      </CardTitle>
                      <CardDescription>
                        {billingData.subscription.status === "canceling"
                          ? `Cancels on ${new Date(billingData.subscription.currentPeriodEnd).toLocaleDateString()}`
                          : `Renews on ${new Date(billingData.subscription.currentPeriodEnd).toLocaleDateString()}`}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-deep-indigo">{billingData.credits.balance}</div>
                      <div className="text-xs text-muted-foreground">credits remaining</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm">
                    <div><span className="text-muted-foreground">Monthly:</span> {billingData.credits.monthlyAllowance}</div>
                    <div><span className="text-muted-foreground">Purchased:</span> {billingData.credits.purchasedBalance}</div>
                    <div><span className="text-muted-foreground">Used:</span> {billingData.credits.totalUsed}</div>
                  </div>
                  {billingData.credits.balance < billingData.credits.monthlyAllowance * 0.2 && billingData.credits.monthlyAllowance > 0 && (
                    <div className="mt-3 rounded-md bg-amber/10 border border-amber/20 p-3 text-sm text-amber">
                      Your credit balance is running low. Consider upgrading or purchasing a credit pack.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Plan Cards */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Available Plans</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {billingData.plans.filter((p: { slug: string }) => p.slug !== "enterprise").map((plan: { slug: string; name: string; description: string; price: number; credits: number; maxProjects: number; features: string[]; popular?: boolean }) => (
                    <Card key={plan.slug} className={`relative ${plan.slug === billingData.currentPlan ? "border-deep-indigo ring-2 ring-deep-indigo/20" : ""} ${plan.popular ? "border-electric-violet" : ""}`}>
                      {plan.popular && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                          <Badge className="bg-electric-violet text-white text-[10px]">Popular</Badge>
                        </div>
                      )}
                      <CardHeader className="pb-2 pt-4">
                        <CardTitle className="text-base">{plan.name}</CardTitle>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold">${plan.price}</span>
                          <span className="text-xs text-muted-foreground">/month</span>
                        </div>
                      </CardHeader>
                      <CardContent className="pb-3">
                        <div className="text-sm font-medium text-deep-indigo mb-2">{plan.credits} credits/month</div>
                        <ul className="text-xs space-y-1 text-muted-foreground">
                          {plan.features.slice(0, 4).map((f: string) => (
                            <li key={f} className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-emerald flex-shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                        <Button
                          className="w-full mt-3"
                          size="sm"
                          variant={plan.slug === billingData.currentPlan ? "outline" : "default"}
                          disabled={plan.slug === billingData.currentPlan || checkoutLoading}
                          onClick={() => checkoutPlan(plan.slug)}
                        >
                          {plan.slug === billingData.currentPlan ? "Current Plan" : "Upgrade"}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Credit Packs */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Buy Credits</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {billingData.creditPacks.map((pack: { credits: number; priceUsd: number; discountPercent: number; label: string }, i: number) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <div className="text-center">
                          <div className="text-lg font-bold">{pack.credits}</div>
                          <div className="text-xs text-muted-foreground">credits</div>
                          <div className="text-base font-semibold mt-1">${pack.priceUsd}</div>
                          {pack.discountPercent > 0 && (
                            <Badge variant="secondary" className="text-[10px] mt-1">{pack.discountPercent}% off</Badge>
                          )}
                          <Button
                            className="w-full mt-2"
                            size="sm"
                            variant="outline"
                            disabled={checkoutLoading}
                            onClick={() => purchaseCreditPack(i)}
                          >
                            Buy
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Auto-Recharge */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <div className="text-sm font-medium">Auto-Recharge</div>
                  <div className="text-xs text-muted-foreground">
                    Automatically add {billingData.credits.autoRechargeAmount} credits when balance hits {billingData.credits.autoRechargeThreshold}
                  </div>
                </div>
                <Switch
                  checked={billingData.credits.autoRecharge}
                  onCheckedChange={toggleAutoRecharge}
                />
              </div>

              {/* Credit Cost Reference */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Credit Costs</h3>
                <div className="rounded-lg border">
                  {Object.entries(billingData.creditCosts).map(([action, cost]: [string, { credits: number; unit: string; description: string }]) => (
                    <div key={action} className="flex items-center justify-between px-4 py-2 border-b last:border-b-0 text-sm">
                      <span className="text-muted-foreground">{action.replace(/_/g, " ")}</span>
                      <span className="font-medium">{cost.credits} credits {cost.unit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Transactions */}
              {billingData.recentTransactions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Recent Activity</h3>
                  <div className="rounded-lg border">
                    {billingData.recentTransactions.slice(0, 8).map((txn: { id: string; type: string; amount: number; balanceAfter: number; action: string; description: string; createdAt: string }) => (
                      <div key={txn.id} className="flex items-center justify-between px-4 py-2 border-b last:border-b-0 text-sm">
                        <div>
                          <span className={txn.type === "credit" ? "text-emerald" : txn.type === "debit" ? "text-warm-red" : "text-muted-foreground"}>
                            {txn.type === "credit" ? "+" : txn.type === "debit" ? "-" : ""}{txn.amount}
                          </span>
                          <span className="text-muted-foreground ml-2">{txn.description}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(txn.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cancel Subscription */}
              {billingData.currentPlan !== "free" && billingData.subscription.status !== "canceling" && (
                <div className="pt-4 border-t">
                  <Button variant="ghost" className="text-warm-red" onClick={cancelSubscription}>
                    Cancel Subscription
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Failed to load billing data</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
