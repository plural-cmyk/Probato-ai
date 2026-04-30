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
      alert("Failed to browse page. The Chromium browser may not be available on this deployment.");
    } finally {
      setBrowsing(false);
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-deep-indigo">
              <Bug className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-deep-indigo">Probato</span>
            <Badge variant="secondary" className="text-xs">
              Dashboard
            </Badge>
          </div>

          <div className="flex items-center gap-3">
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

        {/* Quick Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
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
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
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
    </div>
  );
}
