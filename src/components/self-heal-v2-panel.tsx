"use client";

/**
 * Probato Self-Healing v2 Panel (M30)
 *
 * Selector Self-Healing, Test Code Auto-Maintenance, Deprecation Detection.
 */

import React, { useState, useCallback } from "react";
import {
  Wrench,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Shield,
  Code2,
  Trash2,
  Sparkles,
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

interface SelfHealV2PanelProps {
  projects: { id: string; name: string }[];
}

// ── Status Badge ───────────────────────────────────────────────

function RepairStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    pending: { bg: "bg-amber/10", text: "text-amber", icon: Loader2 },
    approved: { bg: "bg-blue-50", text: "text-blue-500", icon: CheckCircle2 },
    rejected: { bg: "bg-warm-red/10", text: "text-warm-red", icon: XCircle },
    applied: { bg: "bg-emerald/10", text: "text-emerald", icon: CheckCircle2 },
    reverted: { bg: "bg-gray-100", text: "text-gray-500", icon: Trash2 },
  };
  const c = config[status] ?? config.pending;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`text-[10px] ${c.bg} ${c.text} border-0 gap-1`}>
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    critical: { bg: "bg-warm-red/10", text: "text-warm-red" },
    warning: { bg: "bg-amber/10", text: "text-amber" },
    info: { bg: "bg-blue-50", text: "text-blue-500" },
  };
  const c = config[severity] ?? config.info;
  return (
    <Badge variant="outline" className={`text-[10px] ${c.bg} ${c.text} border-0`}>
      {severity}
    </Badge>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function SelfHealV2Panel({ projects }: SelfHealV2PanelProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? "");
  const [loading, setLoading] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("repairs");

  // Results state
  const [repairs, setRepairs] = useState<any[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<any[]>([]);
  const [deprecations, setDeprecations] = useState<any[]>([]);
  const [autoRepairResult, setAutoRepairResult] = useState<{ repaired: number; pending: number } | null>(null);

  // Create repair form
  const [repairTestId, setRepairTestId] = useState("");
  const [repairOldSelector, setRepairOldSelector] = useState("");
  const [repairNewSelector, setRepairNewSelector] = useState("");
  const [repairConfidence, setRepairConfidence] = useState("0.85");

  function toggleSection(key: string) {
    setExpandedSection((prev) => (prev === key ? null : key));
  }

  // ── Load Repairs ──
  const loadRepairs = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading("repairs");
    try {
      const res = await fetch(`/api/self-heal/selector-repairs?projectId=${selectedProjectId}`);
      if (res.ok) {
        const data = await res.json();
        setRepairs(data.repairs ?? []);
      }
    } catch {} finally {
      setLoading(null);
    }
  }, [selectedProjectId]);

  // ── Create Repair ──
  const createRepair = useCallback(async () => {
    if (!repairTestId || !repairOldSelector || !repairNewSelector) return;
    setLoading("create-repair");
    try {
      const res = await fetch("/api/self-heal/selector-repairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCaseId: repairTestId,
          oldSelector: repairOldSelector,
          newSelector: repairNewSelector,
          confidence: parseFloat(repairConfidence),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRepairTestId("");
        setRepairOldSelector("");
        setRepairNewSelector("");
        await loadRepairs();
      } else {
        alert(data.error || "Failed to create repair");
      }
    } catch {
      alert("Failed to create repair");
    } finally {
      setLoading(null);
    }
  }, [repairTestId, repairOldSelector, repairNewSelector, repairConfidence, loadRepairs]);

  // ── Approve/Reject Repair ──
  const reviewRepair = useCallback(async (repairId: string, status: "approved" | "rejected") => {
    try {
      const res = await fetch(`/api/self-heal/selector-repairs/${repairId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await loadRepairs();
      }
    } catch {} 
  }, [loadRepairs]);

  // ── Run Maintenance Scan ──
  const runMaintenanceScan = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading("maintenance");
    try {
      const res = await fetch("/api/self-heal/maintenance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMaintenanceRecords(data.records ?? []);
      } else {
        alert(data.error || "Maintenance scan failed");
      }
    } catch {
      alert("Maintenance scan failed");
    } finally {
      setLoading(null);
    }
  }, [selectedProjectId]);

  // ── Load Deprecations ──
  const loadDeprecations = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading("deprecations");
    try {
      const res = await fetch(`/api/self-heal/deprecations?projectId=${selectedProjectId}`);
      if (res.ok) {
        const data = await res.json();
        setDeprecations(data.deprecations ?? []);
      }
    } catch {} finally {
      setLoading(null);
    }
  }, [selectedProjectId]);

  // ── Auto-Repair ──
  const runAutoRepair = useCallback(async (testCaseId: string) => {
    setLoading("auto-repair");
    try {
      const res = await fetch("/api/self-heal/auto-repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId, confidenceThreshold: 0.8 }),
      });
      const data = await res.json();
      if (res.ok) {
        setAutoRepairResult(data);
        await loadRepairs();
      } else {
        alert(data.error || "Auto-repair failed");
      }
    } catch {
      alert("Auto-repair failed");
    } finally {
      setLoading(null);
    }
  }, [loadRepairs]);

  // Load data on project change
  React.useEffect(() => {
    loadRepairs();
    loadDeprecations();
  }, [loadRepairs, loadDeprecations]);

  // Summary counts
  const pendingRepairs = repairs.filter((r) => r.status === "pending").length;
  const appliedRepairs = repairs.filter((r) => r.status === "applied").length;
  const criticalIssues = maintenanceRecords.filter((r) => r.severity === "critical").length;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald to-teal-500">
            <Wrench className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-deep-indigo">Self-Healing v2</h2>
            <p className="text-xs text-muted-foreground">Selector repairs, auto-maintenance, deprecation detection</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Project:</Label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-8 rounded-md border px-2 text-xs"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center rounded-lg border p-3">
          <p className="text-2xl font-bold text-amber">{pendingRepairs}</p>
          <p className="text-[10px] text-muted-foreground">Pending Repairs</p>
        </div>
        <div className="text-center rounded-lg border p-3">
          <p className="text-2xl font-bold text-emerald">{appliedRepairs}</p>
          <p className="text-[10px] text-muted-foreground">Applied Repairs</p>
        </div>
        <div className="text-center rounded-lg border p-3">
          <p className="text-2xl font-bold text-warm-red">{criticalIssues}</p>
          <p className="text-[10px] text-muted-foreground">Critical Issues</p>
        </div>
      </div>

      {/* ── Selector Repairs Section ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4 cursor-pointer" onClick={() => toggleSection("repairs")}>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-electric-violet" />
            Selector Repairs
            <Badge variant="secondary" className="text-[10px] ml-1">{repairs.length}</Badge>
            <span className="ml-auto">{expandedSection === "repairs" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
          </CardTitle>
        </CardHeader>
        {expandedSection === "repairs" && (
          <CardContent className="px-4 pb-4 space-y-3">
            {/* Create Repair Form */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Test Case ID</Label>
                <Input placeholder="clx..." value={repairTestId} onChange={(e) => setRepairTestId(e.target.value)} className="text-xs h-8" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Confidence (0-1)</Label>
                <Input placeholder="0.85" value={repairConfidence} onChange={(e) => setRepairConfidence(e.target.value)} className="text-xs h-8" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Old Selector</Label>
                <Input placeholder='#old-btn' value={repairOldSelector} onChange={(e) => setRepairOldSelector(e.target.value)} className="text-xs h-8" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">New Selector</Label>
                <Input placeholder='#new-btn' value={repairNewSelector} onChange={(e) => setRepairNewSelector(e.target.value)} className="text-xs h-8" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={createRepair} disabled={loading === "create-repair" || !repairTestId}>
                {loading === "create-repair" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Wrench className="h-3.5 w-3.5 mr-1.5" />}
                Create Repair
              </Button>
              <span className="text-xs text-muted-foreground">8 credits</span>
            </div>

            {/* Repairs List */}
            {repairs.length > 0 && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {repairs.map((repair: any) => (
                  <div key={repair.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                    <RepairStatusBadge status={repair.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono truncate">{repair.oldSelector} → {repair.newSelector}</p>
                      <p className="text-[10px] text-muted-foreground">Confidence: {(repair.confidence * 100).toFixed(0)}%</p>
                    </div>
                    {repair.status === "pending" && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-emerald" onClick={() => reviewRepair(repair.id, "approved")}>
                          Approve
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-warm-red" onClick={() => reviewRepair(repair.id, "rejected")}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Auto-Maintenance Section ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4 cursor-pointer" onClick={() => toggleSection("maintenance")}>
          <CardTitle className="text-sm flex items-center gap-2">
            <Code2 className="h-4 w-4 text-blue-500" />
            Auto-Maintenance
            <Badge variant="secondary" className="text-[10px] ml-1">{maintenanceRecords.length} issues</Badge>
            <span className="ml-auto">{expandedSection === "maintenance" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
          </CardTitle>
        </CardHeader>
        {expandedSection === "maintenance" && (
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={runMaintenanceScan} disabled={loading === "maintenance"}>
                {loading === "maintenance" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Scan for Issues
              </Button>
              <span className="text-xs text-muted-foreground">6 credits</span>
            </div>

            {maintenanceRecords.length > 0 && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {maintenanceRecords.map((record: any) => (
                  <div key={record.id} className={`rounded-lg border p-3 ${
                    record.severity === "critical" ? "border-warm-red/30 bg-warm-red/5" : ""
                  }`}>
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={record.severity} />
                      <Badge variant="outline" className="text-[10px] border-0 capitalize">{record.category?.replace(/_/g, " ")}</Badge>
                      <span className="text-xs font-medium flex-1 truncate">{record.title}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{record.description}</p>
                    {record.suggestedDiff && (
                      <pre className="text-[9px] font-mono bg-gray-50 rounded p-1.5 mt-1.5 overflow-x-auto">{record.suggestedDiff}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Deprecations Section ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4 cursor-pointer" onClick={() => toggleSection("deprecations")}>
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber" />
            Deprecation Detection
            <Badge variant="secondary" className="text-[10px] ml-1">{deprecations.length}</Badge>
            <span className="ml-auto">{expandedSection === "deprecations" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
          </CardTitle>
        </CardHeader>
        {expandedSection === "deprecations" && (
          <CardContent className="px-4 pb-4">
            {deprecations.length > 0 ? (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {deprecations.map((dep: any) => (
                  <div key={dep.id} className="flex items-center gap-2 rounded-md border border-amber/20 bg-amber/5 p-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{dep.title}</p>
                      <p className="text-[10px] text-muted-foreground">{dep.description}</p>
                    </div>
                    <SeverityBadge severity={dep.severity} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No deprecations detected</p>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
