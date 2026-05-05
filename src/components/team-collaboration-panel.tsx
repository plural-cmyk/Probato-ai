"use client";

/**
 * Probato Team Collaboration Panel
 *
 * A comprehensive panel with three tabs:
 *  - Teams: list, create, detail view (members, projects, invitations)
 *  - Sharing: manage project sharing (owned & shared with user)
 *  - Comments: threaded comments per project with resolve/unresolve
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  Share2,
  MessageSquare,
  Plus,
  Trash2,
  X,
  ChevronRight,
  Send,
  CheckCircle2,
  Clock,
  UserPlus,
  Shield,
  Eye,
  Pencil,
  Loader2,
  MoreVertical,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Types ────────────────────────────────────────────────────────

interface UserInfo {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface TeamListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  owner: UserInfo;
  memberCount: number;
  projectCount: number;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: string;
}

interface TeamMember {
  id: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: string;
  joinedAt: string;
  user: UserInfo;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  invitedBy: { id: string; name: string | null; email: string };
  invitedUser?: UserInfo | null;
}

interface TeamProject {
  id: string;
  name: string;
  status: string;
}

interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  owner: UserInfo;
  members: TeamMember[];
  projects: TeamProject[];
  invitations: TeamInvitation[];
}

interface ShareRecord {
  id: string;
  permission: "view" | "edit" | "admin";
  createdAt: string;
  sharedWithUser: UserInfo;
  sharedBy: { id: string; name: string | null; email: string };
}

interface ProjectListItem {
  id: string;
  name: string;
  repoUrl: string | null;
  repoName: string | null;
  branch: string | null;
  status: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface CommentUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface CommentReply {
  id: string;
  content: string;
  resolved: boolean;
  createdAt: string;
  user: CommentUser;
}

interface CommentItem {
  id: string;
  content: string;
  resolved: boolean;
  createdAt: string;
  user: CommentUser;
  replies: CommentReply[];
}

interface TeamCollaborationPanelProps {
  onClose: () => void;
  currentUserId: string;
}

// ── Config ───────────────────────────────────────────────────────

const ROLE_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  owner: {
    label: "Owner",
    color: "text-electric-violet dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/20",
  },
  admin: {
    label: "Admin",
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
  },
  member: {
    label: "Member",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
  },
  viewer: {
    label: "Viewer",
    color: "text-gray-700 dark:text-gray-400",
    bgColor: "bg-gray-50 dark:bg-gray-950/20",
  },
};

const PERMISSION_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  view: {
    label: "View",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
  },
  edit: {
    label: "Edit",
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
  },
  admin: {
    label: "Admin",
    color: "text-electric-violet dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/20",
  },
};

// ── Helpers ──────────────────────────────────────────────────────

function getInitials(name: string | null, fallback: string): string {
  if (!name) return fallback.charAt(0).toUpperCase();
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function canManageTeam(role: string): boolean {
  return role === "owner" || role === "admin";
}

// ── Teams Tab ────────────────────────────────────────────────────

function TeamsTab({ currentUserId }: { currentUserId: string }) {
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create team dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Invite member dialog
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Edit team
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [editDescValue, setEditDescValue] = useState("");

  // ── Load teams ─────────────────────────────────────────────

  const loadTeams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/teams");
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams ?? []);
      }
    } catch (err) {
      console.error("Failed to load teams:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  // ── Load team detail ───────────────────────────────────────

  const loadTeamDetail = useCallback(async (teamId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamId}`);
      if (res.ok) {
        const data = await res.json();
        setTeamDetail(data.team as TeamDetail);
      }
    } catch (err) {
      console.error("Failed to load team detail:", err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTeamId) {
      loadTeamDetail(selectedTeamId);
    }
  }, [selectedTeamId, loadTeamDetail]);

  // ── Create team ────────────────────────────────────────────

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      setCreateError("Team name is required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName.trim(), description: newTeamDesc.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "Failed to create team");
        return;
      }
      setCreateDialogOpen(false);
      setNewTeamName("");
      setNewTeamDesc("");
      await loadTeams();
    } catch (err) {
      console.error("Failed to create team:", err);
      setCreateError("Something went wrong");
    } finally {
      setCreating(false);
    }
  };

  // ── Update team ────────────────────────────────────────────

  const handleUpdateTeam = async (field: "name" | "description", value: string) => {
    if (!selectedTeamId) return;
    try {
      const res = await fetch(`/api/teams/${selectedTeamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setTeamDetail(data.team as TeamDetail);
        await loadTeams();
      }
    } catch (err) {
      console.error("Failed to update team:", err);
    }
  };

  // ── Delete team ────────────────────────────────────────────

  const handleDeleteTeam = async () => {
    if (!selectedTeamId) return;
    try {
      const res = await fetch(`/api/teams/${selectedTeamId}`, { method: "DELETE" });
      if (res.ok) {
        setSelectedTeamId(null);
        setTeamDetail(null);
        await loadTeams();
      }
    } catch (err) {
      console.error("Failed to delete team:", err);
    }
  };

  // ── Invite member ──────────────────────────────────────────

  const handleInviteMember = async () => {
    if (!selectedTeamId || !inviteEmail.trim()) {
      setInviteError("Email is required");
      return;
    }
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch(`/api/teams/${selectedTeamId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error ?? "Failed to invite member");
        return;
      }
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      await loadTeamDetail(selectedTeamId);
    } catch (err) {
      console.error("Failed to invite member:", err);
      setInviteError("Something went wrong");
    } finally {
      setInviting(false);
    }
  };

  // ── Change member role ─────────────────────────────────────

  const handleChangeRole = async (userId: string, role: string) => {
    if (!selectedTeamId) return;
    try {
      const res = await fetch(`/api/teams/${selectedTeamId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (res.ok) {
        await loadTeamDetail(selectedTeamId);
      }
    } catch (err) {
      console.error("Failed to change role:", err);
    }
  };

  // ── Remove member ──────────────────────────────────────────

  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeamId) return;
    try {
      const res = await fetch(`/api/teams/${selectedTeamId}/members?userId=${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadTeamDetail(selectedTeamId);
      }
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  // ── Determine user role in team ────────────────────────────

  const currentUserRole = teamDetail?.members.find(
    (m) => m.user.id === currentUserId
  )?.role;

  // ── Render: Team list ──────────────────────────────────────

  if (!selectedTeamId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Your Teams</h3>
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => {
              setCreateDialogOpen(true);
              setNewTeamName("");
              setNewTeamDesc("");
              setCreateError(null);
            }}
          >
            <Plus className="w-3 h-3" />
            Create Team
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No teams yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a team to collaborate with others.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {teams.map((team) => {
              const roleConfig = ROLE_CONFIG[team.role] ?? ROLE_CONFIG.member;
              return (
                <button
                  key={team.id}
                  className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors group"
                  onClick={() => setSelectedTeamId(team.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-deep-indigo/10 dark:bg-deep-indigo/20">
                      <Users className="h-4 w-4 text-deep-indigo dark:text-electric-violet" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {team.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${roleConfig.color} ${roleConfig.bgColor} border-0`}
                        >
                          {roleConfig.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {team.memberCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {team.projectCount} project{team.projectCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Create Team Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-4 h-4 text-electric-violet" />
                Create New Team
              </DialogTitle>
              <DialogDescription>
                Create a team to collaborate on projects together.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="team-name">Team Name</Label>
                <Input
                  id="team-name"
                  value={newTeamName}
                  onChange={(e) => {
                    setNewTeamName(e.target.value);
                    setCreateError(null);
                  }}
                  placeholder="e.g. Frontend Team"
                  disabled={creating}
                />
              </div>
              <div>
                <Label htmlFor="team-desc">Description (optional)</Label>
                <Textarea
                  id="team-desc"
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="What is this team about?"
                  rows={3}
                  disabled={creating}
                />
              </div>
              {createError && (
                <p className="text-xs text-warm-red">{createError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreateDialogOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateTeam}
                  disabled={creating || !newTeamName.trim()}
                  className="gap-1"
                >
                  {creating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Render: Team detail ────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => {
            setSelectedTeamId(null);
            setTeamDetail(null);
          }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        {detailLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : teamDetail ? (
          <div className="flex-1 min-w-0">
            {/* Editable name */}
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  className="h-7 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleUpdateTeam("name", editNameValue);
                      setEditingName(false);
                    }
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  onBlur={() => {
                    handleUpdateTeam("name", editNameValue);
                    setEditingName(false);
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold truncate">
                  {teamDetail.name}
                </h3>
                {canManageTeam(currentUserRole ?? "") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground"
                    onClick={() => {
                      setEditNameValue(teamDetail.name);
                      setEditingName(true);
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                )}
              </div>
            )}

            {/* Editable description */}
            {editingDesc ? (
              <Textarea
                value={editDescValue}
                onChange={(e) => setEditDescValue(e.target.value)}
                className="text-xs mt-1"
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) {
                    handleUpdateTeam("description", editDescValue);
                    setEditingDesc(false);
                  }
                  if (e.key === "Escape") setEditingDesc(false);
                }}
                onBlur={() => {
                  handleUpdateTeam("description", editDescValue);
                  setEditingDesc(false);
                }}
              />
            ) : (
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">
                  {teamDetail.description || "No description"}
                </p>
                {canManageTeam(currentUserRole ?? "") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-muted-foreground"
                    onClick={() => {
                      setEditDescValue(teamDetail.description ?? "");
                      setEditingDesc(true);
                    }}
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {detailLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : teamDetail ? (
        <ScrollArea className="max-h-[calc(100vh-320px)]">
          <div className="space-y-4 pr-2">
            {/* Members */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Members ({teamDetail.members.length})
                </h4>
                {canManageTeam(currentUserRole ?? "") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs gap-1"
                    onClick={() => {
                      setInviteDialogOpen(true);
                      setInviteEmail("");
                      setInviteRole("member");
                      setInviteError(null);
                    }}
                  >
                    <UserPlus className="w-3 h-3" />
                    Invite
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                {teamDetail.members.map((member) => {
                  const roleConfig =
                    ROLE_CONFIG[member.role] ?? ROLE_CONFIG.member;
                  return (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 rounded-md border p-2 hover:bg-muted/30 transition-colors"
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarImage
                          src={member.user.image ?? undefined}
                          alt={member.user.name ?? ""}
                        />
                        <AvatarFallback className="text-xs">
                          {getInitials(
                            member.user.name,
                            member.user.email
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {member.user.name ?? member.user.email}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.user.email}
                        </p>
                      </div>

                      {member.role !== "owner" &&
                      canManageTeam(currentUserRole ?? "") ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                            >
                              <MoreVertical className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem
                              onClick={() =>
                                handleChangeRole(member.user.id, "admin")
                              }
                              disabled={member.role === "admin"}
                            >
                              <Shield className="w-3 h-3 mr-2" />
                              Make Admin
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleChangeRole(member.user.id, "member")
                              }
                              disabled={member.role === "member"}
                            >
                              <Users className="w-3 h-3 mr-2" />
                              Make Member
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleChangeRole(member.user.id, "viewer")
                              }
                              disabled={member.role === "viewer"}
                            >
                              <Eye className="w-3 h-3 mr-2" />
                              Make Viewer
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-warm-red focus:text-warm-red"
                              onClick={() =>
                                handleRemoveMember(member.user.id)
                              }
                            >
                              <Trash2 className="w-3 h-3 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Badge
                          variant="outline"
                          className={`text-xs ${roleConfig.color} ${roleConfig.bgColor} border-0`}
                        >
                          {roleConfig.label}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Projects */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Projects ({teamDetail.projects.length})
              </h4>
              {teamDetail.projects.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No projects in this team yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {teamDetail.projects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium truncate flex-1">
                        {project.name}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {project.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Invitations */}
            {teamDetail.invitations.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Pending Invitations ({teamDetail.invitations.length})
                  </h4>
                  <div className="space-y-1.5">
                    {teamDetail.invitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center gap-2 rounded-md border p-2 border-dashed"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {inv.invitedUser?.name ?? inv.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Invited {formatRelativeTime(inv.createdAt)}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            ROLE_CONFIG[inv.role]?.color ?? ""
                          } ${ROLE_CONFIG[inv.role]?.bgColor ?? ""} border-0`}
                        >
                          {inv.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Danger Zone */}
            {currentUserRole === "owner" && (
              <>
                <Separator />
                <div className="pt-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={handleDeleteTeam}
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete Team
                  </Button>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      ) : null}

      {/* Invite Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-electric-violet" />
              Invite Member
            </DialogTitle>
            <DialogDescription>
              Send an invitation to join this team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setInviteError(null);
                }}
                placeholder="colleague@example.com"
                disabled={inviting}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) =>
                  setInviteRole(v as "admin" | "member" | "viewer")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteError && (
              <p className="text-xs text-warm-red">{inviteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInviteDialogOpen(false)}
                disabled={inviting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleInviteMember}
                disabled={inviting || !inviteEmail.trim()}
                className="gap-1"
              >
                {inviting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Send Invite
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sharing Tab ──────────────────────────────────────────────────

function SharingTab({ currentUserId }: { currentUserId: string }) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);

  // Share form
  const [shareEmail, setShareEmail] = useState("");
  const [sharePermission, setSharePermission] = useState<"view" | "edit" | "admin">("view");
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // ── Load projects ──────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects ?? []);
        if (data.projects?.length > 0 && !selectedProjectId) {
          setSelectedProjectId(data.projects[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, []);

  // ── Load shares ────────────────────────────────────────────

  const loadShares = useCallback(async (projectId: string) => {
    setSharesLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/share`);
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares ?? []);
      } else {
        setShares([]);
      }
    } catch (err) {
      console.error("Failed to load shares:", err);
      setShares([]);
    } finally {
      setSharesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadShares(selectedProjectId);
      setShareEmail("");
      setSharePermission("view");
      setShareError(null);
    }
  }, [selectedProjectId, loadShares]);

  // ── Share project ──────────────────────────────────────────

  const handleShare = async () => {
    if (!selectedProjectId || !shareEmail.trim()) {
      setShareError("Email is required");
      return;
    }
    setSharing(true);
    setShareError(null);
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: shareEmail.trim(),
          permission: sharePermission,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setShareError(data.error ?? "Failed to share project");
        return;
      }
      setShares((prev) => [data.share as ShareRecord, ...prev]);
      setShareEmail("");
      setSharePermission("view");
    } catch (err) {
      console.error("Failed to share:", err);
      setShareError("Something went wrong");
    } finally {
      setSharing(false);
    }
  };

  // ── Revoke share ───────────────────────────────────────────

  const handleRevoke = async (userId: string) => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/share`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setShares((prev) =>
          prev.filter((s) => s.sharedWithUser.id !== userId)
        );
      }
    } catch (err) {
      console.error("Failed to revoke:", err);
    }
  };

  // ── Owned vs Shared with me ────────────────────────────────

  const ownedProjects = projects.filter((p) => p.userId === currentUserId);
  const sharedWithMe = projects.filter((p) => p.userId !== currentUserId);

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Owned Projects */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Your Projects</h3>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : ownedProjects.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No projects owned by you yet.
          </p>
        ) : (
          <div className="space-y-2">
            {ownedProjects.map((project) => {
              const isSelected = selectedProjectId === project.id;
              return (
                <button
                  key={project.id}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    isSelected
                      ? "border-electric-violet/50 bg-purple-50/50 dark:bg-purple-950/10"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium truncate flex-1">
                      {project.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {project.status}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Shared with me */}
      {sharedWithMe.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-2">Shared with You</h3>
            <div className="space-y-2">
              {sharedWithMe.map((project) => (
                <div
                  key={project.id}
                  className="rounded-lg border p-3 border-dashed"
                >
                  <div className="flex items-center gap-2">
                    <Share2 className="w-3.5 h-3.5 text-electric-violet" />
                    <span className="text-sm font-medium truncate flex-1">
                      {project.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${PERMISSION_CONFIG.view.color} ${PERMISSION_CONFIG.view.bgColor} border-0`}
                    >
                      Shared
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Selected project sharing detail */}
      {selectedProjectId && (
        <>
          <Separator />
          <div>
            <h4 className="text-sm font-semibold mb-2">
              Sharing for &ldquo;
              {ownedProjects.find((p) => p.id === selectedProjectId)?.name ??
                "Project"}
              &rdquo;
            </h4>

            {/* Share form */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="Share by email..."
                  value={shareEmail}
                  onChange={(e) => {
                    setShareEmail(e.target.value);
                    setShareError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleShare();
                  }}
                  disabled={sharing}
                  className="h-8 text-xs"
                />
              </div>
              <Select
                value={sharePermission}
                onValueChange={(v) =>
                  setSharePermission(v as "view" | "edit" | "admin")
                }
              >
                <SelectTrigger className="w-20 h-8 text-xs" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="edit">Edit</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 gap-1"
                onClick={handleShare}
                disabled={sharing || !shareEmail.trim()}
              >
                {sharing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Share2 className="w-3 h-3" />
                )}
                Share
              </Button>
            </div>

            {shareError && (
              <p className="text-xs text-warm-red mb-2">{shareError}</p>
            )}

            {/* Shares list */}
            {sharesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : shares.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                Not shared with anyone yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {shares.map((share) => {
                  const permConfig =
                    PERMISSION_CONFIG[share.permission] ??
                    PERMISSION_CONFIG.view;
                  return (
                    <div
                      key={share.id}
                      className="flex items-center gap-2 rounded-md border p-2 hover:bg-muted/30 transition-colors"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={share.sharedWithUser.image ?? undefined}
                          alt={share.sharedWithUser.name ?? ""}
                        />
                        <AvatarFallback className="text-xs">
                          {getInitials(
                            share.sharedWithUser.name,
                            share.sharedWithUser.email
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {share.sharedWithUser.name ??
                            share.sharedWithUser.email}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs ${permConfig.color} ${permConfig.bgColor} border-0`}
                      >
                        {permConfig.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-warm-red"
                        onClick={() => handleRevoke(share.sharedWithUser.id)}
                        title="Revoke access"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Comments Tab ─────────────────────────────────────────────────

function CommentsTab({ currentUserId }: { currentUserId: string }) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // New comment
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reply state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  // ── Load projects ──────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setProjectsLoading(true);
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          const projs = data.projects ?? [];
          setProjects(projs);
          if (projs.length > 0) {
            setSelectedProjectId(projs[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setProjectsLoading(false);
      }
    }
    load();
  }, []);

  // ── Load comments ──────────────────────────────────────────

  const loadComments = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/comments?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
      } else {
        setComments([]);
      }
    } catch (err) {
      console.error("Failed to load comments:", err);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadComments(selectedProjectId);
    }
  }, [selectedProjectId, loadComments]);

  // ── Add comment ────────────────────────────────────────────

  const handleSubmitComment = async () => {
    if (!selectedProjectId || !newComment.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          content: newComment.trim(),
        }),
      });
      if (res.ok) {
        setNewComment("");
        await loadComments(selectedProjectId);
      }
    } catch (err) {
      console.error("Failed to add comment:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Add reply ──────────────────────────────────────────────

  const handleSubmitReply = async (parentId: string) => {
    if (!selectedProjectId || !replyContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          content: replyContent.trim(),
          parentId,
        }),
      });
      if (res.ok) {
        setReplyContent("");
        setReplyingTo(null);
        await loadComments(selectedProjectId);
      }
    } catch (err) {
      console.error("Failed to add reply:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Toggle resolve ─────────────────────────────────────────

  const handleToggleResolve = async (
    commentId: string,
    currentlyResolved: boolean
  ) => {
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !currentlyResolved }),
      });
      if (res.ok) {
        await loadComments(selectedProjectId);
      }
    } catch (err) {
      console.error("Failed to toggle resolve:", err);
    }
  };

  // ── Delete comment ─────────────────────────────────────────

  const handleDeleteComment = async (commentId: string) => {
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadComments(selectedProjectId);
      }
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Project selector */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">
          Project
        </Label>
        <Select
          value={selectedProjectId}
          onValueChange={setSelectedProjectId}
        >
          <SelectTrigger className="w-full mt-1">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            {projectsLoading ? (
              <SelectItem value="_loading" disabled>
                Loading...
              </SelectItem>
            ) : projects.length === 0 ? (
              <SelectItem value="_empty" disabled>
                No projects available
              </SelectItem>
            ) : (
              projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Comments list */}
      {commentsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !selectedProjectId ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Select a project to view comments.
        </p>
      ) : comments.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No comments yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Start the conversation below.
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-96">
          <div className="space-y-3 pr-2">
            {comments.map((comment) => (
              <div key={comment.id} className="space-y-2">
                {/* Main comment */}
                <div
                  className={`rounded-lg border p-3 transition-colors ${
                    comment.resolved
                      ? "bg-muted/30 opacity-70"
                      : "bg-background"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Avatar className="h-7 w-7 mt-0.5">
                      <AvatarImage
                        src={comment.user.image ?? undefined}
                        alt={comment.user.name ?? ""}
                      />
                      <AvatarFallback className="text-xs">
                        {getInitials(
                          comment.user.name,
                          comment.user.email
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">
                          {comment.user.name ?? comment.user.email}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(comment.createdAt)}
                        </span>
                        {comment.resolved && (
                          <Badge
                            variant="outline"
                            className="text-xs bg-emerald/10 text-emerald border-emerald/20"
                          >
                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                            Resolved
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                        {comment.content}
                      </p>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-xs px-1.5 gap-0.5"
                          onClick={() => {
                            setReplyingTo(
                              replyingTo === comment.id ? null : comment.id
                            );
                            setReplyContent("");
                          }}
                        >
                          <MessageSquare className="w-2.5 h-2.5" />
                          Reply
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-5 text-xs px-1.5 gap-0.5 ${
                            comment.resolved
                              ? "text-amber-600"
                              : "text-emerald"
                          }`}
                          onClick={() =>
                            handleToggleResolve(
                              comment.id,
                              comment.resolved
                            )
                          }
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          {comment.resolved ? "Unresolve" : "Resolve"}
                        </Button>
                        {(comment.user.id === currentUserId) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 text-xs px-1.5 text-warm-red hover:text-warm-red"
                            onClick={() => handleDeleteComment(comment.id)}
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </Button>
                        )}
                      </div>

                      {/* Reply form */}
                      {replyingTo === comment.id && (
                        <div className="flex gap-2 mt-2">
                          <Input
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="Write a reply..."
                            className="h-7 text-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && replyContent.trim()) {
                                handleSubmitReply(comment.id);
                              }
                            }}
                            disabled={submitting}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            className="h-7 gap-1"
                            onClick={() => handleSubmitReply(comment.id)}
                            disabled={submitting || !replyContent.trim()}
                          >
                            {submitting ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {comment.replies.length > 0 && (
                  <div className="ml-6 space-y-2">
                    {comment.replies.map((reply) => (
                      <div
                        key={reply.id}
                        className={`rounded-lg border border-l-2 border-l-electric-violet/30 p-2.5 transition-colors ${
                          reply.resolved
                            ? "bg-muted/30 opacity-70"
                            : "bg-background"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Avatar className="h-6 w-6 mt-0.5">
                            <AvatarImage
                              src={reply.user.image ?? undefined}
                              alt={reply.user.name ?? ""}
                            />
                            <AvatarFallback className="text-xs">
                              {getInitials(
                                reply.user.name,
                                reply.user.email
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium">
                                {reply.user.name ?? reply.user.email}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeTime(reply.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                              {reply.content}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-5 text-xs px-1.5 gap-0.5 ${
                                  reply.resolved
                                    ? "text-amber-600"
                                    : "text-emerald"
                                }`}
                                onClick={() =>
                                  handleToggleResolve(
                                    reply.id,
                                    reply.resolved
                                  )
                                }
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                {reply.resolved ? "Unresolve" : "Resolve"}
                              </Button>
                              {reply.user.id === currentUserId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 text-xs px-1.5 text-warm-red hover:text-warm-red"
                                  onClick={() =>
                                    handleDeleteComment(reply.id)
                                  }
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* New comment form */}
      {selectedProjectId && (
        <div className="pt-2 border-t">
          <div className="flex gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              className="text-xs resize-none"
              disabled={submitting}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.metaKey || e.ctrlKey) &&
                  newComment.trim()
                ) {
                  handleSubmitComment();
                }
              }}
            />
            <Button
              size="sm"
              className="h-full gap-1 self-end"
              onClick={handleSubmitComment}
              disabled={submitting || !newComment.trim()}
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Press Ctrl+Enter to send
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Panel Component ─────────────────────────────────────────

export default function TeamCollaborationPanel({
  onClose,
  currentUserId,
}: TeamCollaborationPanelProps) {
  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-deep-indigo/10 dark:bg-deep-indigo/20">
              <Users className="h-4 w-4 text-deep-indigo dark:text-electric-violet" />
            </div>
            <div>
              <CardTitle className="text-base">Team Collaboration</CardTitle>
              <p className="text-xs text-muted-foreground">
                Teams, sharing &amp; comments
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="teams" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="teams" className="gap-1 text-xs">
              <Users className="w-3.5 h-3.5" />
              Teams
            </TabsTrigger>
            <TabsTrigger value="sharing" className="gap-1 text-xs">
              <Share2 className="w-3.5 h-3.5" />
              Sharing
            </TabsTrigger>
            <TabsTrigger value="comments" className="gap-1 text-xs">
              <MessageSquare className="w-3.5 h-3.5" />
              Comments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="teams" className="mt-4">
            <TeamsTab currentUserId={currentUserId} />
          </TabsContent>

          <TabsContent value="sharing" className="mt-4">
            <SharingTab currentUserId={currentUserId} />
          </TabsContent>

          <TabsContent value="comments" className="mt-4">
            <CommentsTab currentUserId={currentUserId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
