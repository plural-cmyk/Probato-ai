"use client";

/**
 * Probato Share Project Dialog
 *
 * A reusable dialog for quickly sharing a project from the project list.
 *  - Email input + permission select (view / edit / admin)
 *  - Current shares list with revoke button
 *  - Loading, error, and empty states
 */

import React, { useState, useEffect, useCallback } from "react";
import { Share2, Loader2, Trash2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// ── Types ────────────────────────────────────────────────────────

interface SharedUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface ShareRecord {
  id: string;
  permission: "view" | "edit" | "admin";
  createdAt: string;
  sharedWithUser: SharedUser;
  sharedBy: { id: string; name: string | null; email: string };
}

interface ShareProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  onShared?: () => void;
}

// ── Permission Config ────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────

export default function ShareProjectDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onShared,
}: ShareProjectDialogProps) {
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"view" | "edit" | "admin">("view");
  const [error, setError] = useState<string | null>(null);

  // ── Fetch shares ───────────────────────────────────────────

  const loadShares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/share`);
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares ?? []);
      }
    } catch (err) {
      console.error("Failed to load shares:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      loadShares();
      setEmail("");
      setPermission("view");
      setError(null);
    }
  }, [open, loadShares]);

  // ── Share project ──────────────────────────────────────────

  const handleShare = async () => {
    if (!email.trim()) {
      setError("Email address is required");
      return;
    }

    setSharing(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), permission }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to share project");
        return;
      }

      // Optimistically add to the list
      setShares((prev) => [data.share as ShareRecord, ...prev]);
      setEmail("");
      setPermission("view");
      onShared?.();
    } catch (err) {
      console.error("Failed to share project:", err);
      setError("Something went wrong");
    } finally {
      setSharing(false);
    }
  };

  // ── Revoke sharing ─────────────────────────────────────────

  const handleRevoke = async (userId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/share`, {
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
      console.error("Failed to revoke sharing:", err);
    }
  };

  // ── Helpers ────────────────────────────────────────────────

  function getInitials(name: string | null, fallback: string): string {
    if (!name) return fallback.charAt(0).toUpperCase();
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-electric-violet" />
            Share &ldquo;{projectName}&rdquo;
          </DialogTitle>
          <DialogDescription>
            Share this project with teammates by email. They&apos;ll get access
            based on the permission you choose.
          </DialogDescription>
        </DialogHeader>

        {/* Share Form */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="share-email" className="sr-only">
                Email address
              </Label>
              <Input
                id="share-email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleShare();
                }}
                disabled={sharing}
              />
            </div>
            <Select
              value={permission}
              onValueChange={(v) => setPermission(v as "view" | "edit" | "admin")}
            >
              <SelectTrigger className="w-24" size="sm">
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
              onClick={handleShare}
              disabled={sharing || !email.trim()}
              className="gap-1"
            >
              {sharing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Share
            </Button>
          </div>

          {error && (
            <p className="text-xs text-warm-red flex items-center gap-1">
              <X className="w-3 h-3" />
              {error}
            </p>
          )}
        </div>

        <Separator />

        {/* Current Shares */}
        <div>
          <h4 className="text-sm font-medium mb-2 text-muted-foreground">
            People with access
          </h4>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : shares.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              This project hasn&apos;t been shared with anyone yet.
            </p>
          ) : (
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {shares.map((share) => {
                  const permConfig =
                    PERMISSION_CONFIG[share.permission] ??
                    PERMISSION_CONFIG.view;
                  return (
                    <div
                      key={share.id}
                      className="flex items-center gap-3 rounded-lg border p-2 hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="h-8 w-8">
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
                        <p className="text-sm font-medium truncate">
                          {share.sharedWithUser.name ??
                            share.sharedWithUser.email}
                        </p>
                        {share.sharedWithUser.name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {share.sharedWithUser.email}
                          </p>
                        )}
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
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-warm-red"
                        onClick={() => handleRevoke(share.sharedWithUser.id)}
                        title="Revoke access"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
