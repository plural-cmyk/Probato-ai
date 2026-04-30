"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Project {
  id: string;
  name: string;
  repoUrl: string;
  repoName: string;
  status: string;
  branch: string;
  createdAt: string;
  lastRunAt: string | null;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchProjects();
    }
  }, [status]);

  async function fetchProjects() {
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
    ready: "bg-emerald/10 text-emerald border-emerald/20",
    error: "bg-warm-red/10 text-warm-red border-warm-red/20",
  };

  const statusIcons: Record<string, typeof Clock> = {
    pending: Clock,
    cloning: Loader2,
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
              <CardDescription>Ready</CardDescription>
              <CardTitle className="text-3xl text-emerald">
                {projects.filter((p) => p.status === "ready").length}
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

        {/* Projects Section */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-deep-indigo">Projects</h2>
          <Button
            className="bg-deep-indigo hover:bg-deep-indigo/90 text-white"
            size="sm"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New Project
          </Button>
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
                  className="transition-shadow hover:shadow-md cursor-pointer border-border/50"
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
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Added {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                      {project.lastRunAt && (
                        <span>
                          Last run{" "}
                          {new Date(project.lastRunAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
