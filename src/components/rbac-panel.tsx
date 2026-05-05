"use client";

import { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Shield,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface PermissionPolicy {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  permissions: Array<{ resource: string; actions: string[] }>;
  conditions: any;
  scope: string;
  teamId: string | null;
  createdAt: string;
}

interface Props {
  onClose: () => void;
}

const actionColors: Record<string, string> = {
  read: "bg-blue-100 text-blue-800",
  write: "bg-green-100 text-green-800",
  delete: "bg-red-100 text-red-800",
  execute: "bg-purple-100 text-purple-800",
};

export default function RBACPanel({ onClose }: Props) {
  const [policies, setPolicies] = useState<PermissionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newScope, setNewScope] = useState("team");
  const [newPerms, setNewPerms] = useState<Array<{ resource: string; actions: string[] }>>([]);

  // Permission check tool
  const [checkUserId, setCheckUserId] = useState("");
  const [checkResource, setCheckResource] = useState("");
  const [checkAction, setCheckAction] = useState("");
  const [checkResult, setCheckResult] = useState<{ allowed: boolean; source: string } | null>(null);
  const [checking, setChecking] = useState(false);

  // Add permission row
  const [addPermResource, setAddPermResource] = useState("");
  const [addPermActions, setAddPermActions] = useState("read");

  useEffect(() => {
    loadPolicies();
  }, []);

  async function loadPolicies() {
    setLoading(true);
    try {
      const teamRes = await fetch("/api/teams");
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        const firstTeam = teamData.teams?.[0];
        if (firstTeam) {
          setTeamId(firstTeam.id);
          const res = await fetch(`/api/permissions/policies?teamId=${firstTeam.id}`);
          if (res.ok) {
            const data = await res.json();
            const fetched = data.policies || [];
            setPolicies(fetched);

            // Seed defaults if none
            if (fetched.length === 0) {
              const seedRes = await fetch("/api/permissions/policies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ teamId: firstTeam.id }),
              });
              if (seedRes.ok) {
                const seedData = await seedRes.json();
                if (seedData.seeded) {
                  setPolicies(seedData.policies || []);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to load policies:", error);
    } finally {
      setLoading(false);
    }
  }

  async function createPolicy() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/permissions/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          name: newName.trim(),
          description: newDescription || null,
          permissions: newPerms,
          scope: newScope,
        }),
      });
      if (res.ok) {
        resetForm();
        await loadPolicies();
      }
    } catch (error) {
      console.error("Failed to create policy:", error);
    } finally {
      setSaving(false);
    }
  }

  async function deletePolicy(id: string) {
    if (!confirm("Delete this policy?")) return;
    try {
      await fetch(`/api/permissions/policies/${id}`, { method: "DELETE" });
      await loadPolicies();
    } catch (error) {
      console.error("Failed to delete policy:", error);
    }
  }

  async function checkPermission() {
    if (!checkUserId || !checkResource || !checkAction) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/permissions/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: checkUserId,
          resource: checkResource,
          action: checkAction,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCheckResult(data);
      }
    } catch (error) {
      console.error("Permission check failed:", error);
    } finally {
      setChecking(false);
    }
  }

  function addPermissionRow() {
    if (!addPermResource.trim()) return;
    setNewPerms([...newPerms, { resource: addPermResource.trim(), actions: addPermActions.split(",").map((s) => s.trim()).filter(Boolean) }]);
    setAddPermResource("");
    setAddPermActions("read");
  }

  function removePermissionRow(index: number) {
    setNewPerms(newPerms.filter((_, i) => i !== index));
  }

  function resetForm() {
    setShowCreateForm(false);
    setNewName("");
    setNewDescription("");
    setNewScope("team");
    setNewPerms([]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-rose-600" />
          <h3 className="text-lg font-semibold">Permission Policies</h3>
          <Badge variant="secondary" className="text-xs">{policies.length} policies</Badge>
        </div>
        <Button size="sm" onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-1" /> Create Policy
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-rose-600" />
        </div>
      ) : policies.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No permission policies yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((policy) => (
            <div key={policy.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {policy.isDefault && <Lock className="h-4 w-4 text-amber-500" />}
                  <span className="font-medium">{policy.name}</span>
                  <Badge variant={policy.isDefault ? "default" : "outline"} className="text-xs">
                    {policy.isDefault ? "Default" : "Custom"}
                  </Badge>
                  <Badge variant="outline" className="text-xs">{policy.scope}</Badge>
                </div>
                {!policy.isDefault && (
                  <Button variant="ghost" size="icon" onClick={() => deletePolicy(policy.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
              {policy.description && (
                <p className="text-sm text-muted-foreground">{policy.description}</p>
              )}
              <div className="space-y-1">
                {Array.isArray(policy.permissions) && policy.permissions.map((perm, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-medium min-w-24">{perm.resource}:</span>
                    <div className="flex gap-1 flex-wrap">
                      {perm.actions?.map((action) => (
                        <Badge key={action} className={`text-xs ${actionColors[action] || "bg-gray-100"}`}>
                          {action}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Policy Form */}
      {showCreateForm && (
        <div className="border rounded-lg p-4 space-y-4">
          <h4 className="font-medium">Create Custom Policy</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Data Analyst" />
            </div>
            <div>
              <Label>Scope</Label>
              <Select value={newScope} onValueChange={setNewScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="What this policy allows" />
          </div>

          {/* Permissions builder */}
          <div className="space-y-2">
            <Label>Permissions</Label>
            {newPerms.map((perm, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{perm.resource}:</span>
                <div className="flex gap-1">
                  {perm.actions.map((a) => (
                    <Badge key={a} className={`text-xs ${actionColors[a] || "bg-gray-100"}`}>{a}</Badge>
                  ))}
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePermissionRow(i)}>
                  <XCircle className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={addPermResource} onChange={(e) => setAddPermResource(e.target.value)} placeholder="Resource name" className="h-8 text-sm" />
              <Input value={addPermActions} onChange={(e) => setAddPermActions(e.target.value)} placeholder="read,write" className="h-8 text-sm" />
              <Button size="sm" variant="outline" onClick={addPermissionRow}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={createPolicy} disabled={saving || !newName.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create Policy
            </Button>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      <Separator />

      {/* Permission Check Tool */}
      <div className="space-y-3">
        <h4 className="font-medium flex items-center gap-2">
          <Eye className="h-4 w-4" /> Permission Check Tool
        </h4>
        <p className="text-sm text-muted-foreground">Check if a user has a specific permission.</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">User ID</Label>
            <Input value={checkUserId} onChange={(e) => setCheckUserId(e.target.value)} placeholder="user_id" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Resource</Label>
            <Input value={checkResource} onChange={(e) => setCheckResource(e.target.value)} placeholder="projects" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Action</Label>
            <Input value={checkAction} onChange={(e) => setCheckAction(e.target.value)} placeholder="read" className="h-8 text-sm" />
          </div>
        </div>
        <Button size="sm" onClick={checkPermission} disabled={checking || !checkUserId || !checkResource || !checkAction}>
          {checking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Shield className="h-4 w-4 mr-1" />}
          Check Permission
        </Button>

        {checkResult && (
          <div className={`p-3 rounded-lg text-sm border ${checkResult.allowed ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"}`}>
            {checkResult.allowed ? <CheckCircle2 className="h-4 w-4 inline mr-1" /> : <XCircle className="h-4 w-4 inline mr-1" />}
            <strong>{checkResult.allowed ? "ALLOWED" : "DENIED"}</strong>
            <span className="ml-2 text-xs">Source: {checkResult.source}</span>
          </div>
        )}
      </div>
    </div>
  );
}
