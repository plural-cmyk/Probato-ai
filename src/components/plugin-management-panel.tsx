"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  X,
  Plus,
  Play,
  Pause,
  Trash2,
  Settings2,
  History,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface PluginData {
  id: string;
  name: string;
  version: string;
  description: string | null;
  author: string | null;
  tier: string;
  status: string;
  enabled: boolean;
  config: Record<string, unknown>;
  executionCount: number;
  lastExecutedAt: string | null;
  lastError: string | null;
  isPrivate: boolean;
  installedAt: string;
  activatedAt: string | null;
  extensionPoints: Array<{ type: string; id: string }>;
  _count: { executions: number };
}

interface ExecutionData {
  id: string;
  extensionPoint: string;
  durationMs: number;
  memoryUsedKb: number;
  cpuTimeMs: number;
  status: string;
  error: string | null;
  createdAt: string;
  triggeredBy: string | null;
}

interface PluginManagementPanelProps {
  onClose: () => void;
}

export default function PluginManagementPanel({ onClose }: PluginManagementPanelProps) {
  const [plugins, setPlugins] = useState<PluginData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInstallForm, setShowInstallForm] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [showExecutions, setShowExecutions] = useState<string | null>(null);
  const [executions, setExecutions] = useState<ExecutionData[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [showConfigEditor, setShowConfigEditor] = useState<string | null>(null);
  const [configJson, setConfigJson] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);

  // Install form state
  const [installName, setInstallName] = useState("");
  const [installVersion, setInstallVersion] = useState("1.0.0");
  const [installDescription, setInstallDescription] = useState("");
  const [installAuthor, setInstallAuthor] = useState("");
  const [installTier, setInstallTier] = useState("community");
  const [installing, setInstalling] = useState(false);

  const fetchPlugins = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/plugins?teamId=${teamId}`);
      if (res.ok) {
        const data = await res.json();
        setPlugins(data.plugins ?? []);
      }
    } catch (error) {
      console.error("Failed to fetch plugins:", error);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  // Get user's first team
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/teams");
        if (res.ok) {
          const data = await res.json();
          const firstTeam = data.teams?.[0];
          if (firstTeam) {
            setTeamId(firstTeam.id);
          }
        }
      } catch {
        // Ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (teamId) fetchPlugins();
  }, [teamId, fetchPlugins]);

  async function installPlugin() {
    if (!installName.trim() || !teamId) return;
    setInstalling(true);
    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          name: installName.trim(),
          version: installVersion,
          description: installDescription || undefined,
          author: installAuthor || undefined,
          tier: installTier,
        }),
      });
      if (res.ok) {
        setInstallName("");
        setInstallVersion("1.0.0");
        setInstallDescription("");
        setInstallAuthor("");
        setShowInstallForm(false);
        await fetchPlugins();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to install plugin");
      }
    } catch (error) {
      console.error("Failed to install plugin:", error);
    } finally {
      setInstalling(false);
    }
  }

  async function activatePlugin(pluginId: string) {
    try {
      const res = await fetch(`/api/plugins/${pluginId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) await fetchPlugins();
    } catch (error) {
      console.error("Failed to activate plugin:", error);
    }
  }

  async function deactivatePlugin(pluginId: string) {
    try {
      const res = await fetch(`/api/plugins/${pluginId}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) await fetchPlugins();
    } catch (error) {
      console.error("Failed to deactivate plugin:", error);
    }
  }

  async function uninstallPlugin(pluginId: string) {
    if (!confirm("Are you sure you want to uninstall this plugin?")) return;
    try {
      const res = await fetch(`/api/plugins/${pluginId}`, { method: "DELETE" });
      if (res.ok) {
        setSelectedPlugin(null);
        await fetchPlugins();
      }
    } catch (error) {
      console.error("Failed to uninstall plugin:", error);
    }
  }

  async function loadExecutions(pluginId: string) {
    if (showExecutions === pluginId) {
      setShowExecutions(null);
      return;
    }
    setShowExecutions(pluginId);
    setExecutionsLoading(true);
    try {
      const res = await fetch(`/api/plugins/${pluginId}/executions?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.executions ?? []);
      }
    } catch (error) {
      console.error("Failed to load executions:", error);
    } finally {
      setExecutionsLoading(false);
    }
  }

  async function saveConfig(pluginId: string) {
    setConfigSaving(true);
    try {
      const parsed = JSON.parse(configJson);
      const res = await fetch(`/api/plugins/${pluginId}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: parsed }),
      });
      if (res.ok) {
        setShowConfigEditor(null);
        await fetchPlugins();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save config");
      }
    } catch {
      alert("Invalid JSON configuration");
    } finally {
      setConfigSaving(false);
    }
  }

  function openConfigEditor(plugin: PluginData) {
    setConfigJson(JSON.stringify(plugin.config, null, 2));
    setShowConfigEditor(plugin.id);
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "active":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "deactivated":
        return <Pause className="h-4 w-4 text-muted-foreground" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  }

  function getTierBadge(tier: string) {
    const colors: Record<string, string> = {
      official: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
      verified: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      community: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    };
    return colors[tier] || colors.community;
  }

  function formatTime(dateStr: string | null) {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  }

  if (!teamId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Plugin Management</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Create or join a team to manage plugins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Plugin Management</h3>
          <Badge variant="secondary" className="text-xs">
            {plugins.length} installed
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInstallForm(!showInstallForm)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Install Plugin
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Install Form */}
      {showInstallForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Install New Plugin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Plugin Name *</Label>
                <Input
                  placeholder="@probato/jira-integration"
                  value={installName}
                  onChange={(e) => setInstallName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Version *</Label>
                <Input
                  placeholder="1.0.0"
                  value={installVersion}
                  onChange={(e) => setInstallVersion(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input
                  placeholder="Plugin description..."
                  value={installDescription}
                  onChange={(e) => setInstallDescription(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Author</Label>
                <Input
                  placeholder="Author name"
                  value={installAuthor}
                  onChange={(e) => setInstallAuthor(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tier</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={installTier}
                  onChange={(e) => setInstallTier(e.target.value)}
                >
                  <option value="community">Community</option>
                  <option value="verified">Verified</option>
                  <option value="official">Official</option>
                </select>
              </div>
              <div className="flex-1" />
              <Button
                onClick={installPlugin}
                disabled={!installName.trim() || installing}
                size="sm"
              >
                {installing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Install
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Config Editor */}
      {showConfigEditor && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Plugin Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="w-full h-48 rounded-md border border-input bg-background p-3 font-mono text-xs"
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfigEditor(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => saveConfig(showConfigEditor)}
                disabled={configSaving}
              >
                {configSaving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : null}
                Save Config
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plugin List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : plugins.length === 0 ? (
        <div className="text-center py-8">
          <Box className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No plugins installed yet. Click &quot;Install Plugin&quot; to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plugins.map((plugin) => (
            <Card key={plugin.id} className="overflow-hidden">
              <CardContent className="p-4">
                {/* Plugin Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(plugin.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{plugin.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          v{plugin.version}
                        </Badge>
                        <Badge className={`text-[10px] px-1.5 ${getTierBadge(plugin.tier)}`}>
                          {plugin.tier}
                        </Badge>
                        {plugin.isPrivate && (
                          <Badge variant="outline" className="text-[10px] px-1.5">
                            Private
                          </Badge>
                        )}
                      </div>
                      {plugin.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {plugin.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                        {plugin.author && <span>by {plugin.author}</span>}
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          {plugin.executionCount} executions
                        </span>
                        <span>Last: {formatTime(plugin.lastExecutedAt)}</span>
                      </div>
                      {plugin.lastError && (
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-red-500">
                          <AlertTriangle className="h-3 w-3" />
                          {plugin.lastError.substring(0, 100)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={plugin.enabled}
                      onCheckedChange={(checked) =>
                        checked
                          ? activatePlugin(plugin.id)
                          : deactivatePlugin(plugin.id)
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openConfigEditor(plugin)}
                      title="Configure"
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => loadExecutions(plugin.id)}
                      title="View Executions"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      onClick={() => uninstallPlugin(plugin.id)}
                      title="Uninstall"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Extension Points */}
                {Array.isArray(plugin.extensionPoints) &&
                  plugin.extensionPoints.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {plugin.extensionPoints.map((ep: { type: string; id: string }, i: number) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {ep.type}: {ep.id}
                        </Badge>
                      ))}
                    </div>
                  )}

                {/* Executions */}
                {showExecutions === plugin.id && (
                  <div className="mt-3">
                    <Separator className="mb-3" />
                    <h4 className="text-xs font-medium mb-2">
                      Recent Executions
                    </h4>
                    {executionsLoading ? (
                      <div className="flex justify-center py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : executions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No executions recorded yet.
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1.5">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-muted-foreground border-b">
                              <th className="text-left py-1 px-1">Extension Point</th>
                              <th className="text-right py-1 px-1">Duration</th>
                              <th className="text-right py-1 px-1">Memory</th>
                              <th className="text-left py-1 px-1">Status</th>
                              <th className="text-left py-1 px-1">Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {executions.map((exec) => (
                              <tr key={exec.id} className="border-b border-border/30">
                                <td className="py-1 px-1 font-mono">
                                  {exec.extensionPoint}
                                </td>
                                <td className="py-1 px-1 text-right">
                                  {exec.durationMs}ms
                                </td>
                                <td className="py-1 px-1 text-right">
                                  {exec.memoryUsedKb > 0
                                    ? `${(exec.memoryUsedKb / 1024).toFixed(1)}MB`
                                    : "—"}
                                </td>
                                <td className="py-1 px-1">
                                  <span
                                    className={
                                      exec.status === "completed"
                                        ? "text-emerald-600"
                                        : exec.status === "error"
                                        ? "text-red-500"
                                        : "text-amber-500"
                                    }
                                  >
                                    {exec.status}
                                  </span>
                                </td>
                                <td className="py-1 px-1 text-muted-foreground">
                                  {formatTime(exec.createdAt)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
