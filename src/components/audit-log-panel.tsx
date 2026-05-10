"use client";

import { useState, useEffect } from "react";
import {
  FileSearch,
  Filter,
  ChevronDown,
  ChevronRight,
  Shield,
  Loader2,
  Download,
  Plus,
  Trash2,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
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
import { Separator } from "@/components/ui/separator";

interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  ipAddress: string | null;
  beforeSnapshot: any;
  afterSnapshot: any;
  metadata: any;
  previousHash: string | null;
  entryHash: string;
  chainValid: boolean;
  severity: string;
  teamId: string | null;
  createdAt: string;
}

interface AuditExport {
  id: string;
  name: string;
  destination: string;
  retention: string;
  schedule: string;
  enabled: boolean;
  lastExportAt: string | null;
  exportCount: number;
  lastError: string | null;
}

interface Props {
  onClose: () => void;
}

const severityColors: Record<string, string> = {
  info: "bg-blue-100 text-blue-800",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};

const severityIcons: Record<string, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  critical: XCircle,
};

export default function AuditLogPanel({ onClose }: Props) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState("");
  const [filterResource, setFilterResource] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Verify
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    totalEntries: number;
    tamperedEntries: number;
    tamperedIds: string[];
    message: string;
  } | null>(null);

  // Exports
  const [exports, setExports] = useState<AuditExport[]>([]);
  const [showExportForm, setShowExportForm] = useState(false);
  const [newExportName, setNewExportName] = useState("");
  const [newExportDest, setNewExportDest] = useState("webhook");
  const [newExportSchedule, setNewExportSchedule] = useState("weekly");

  const teamId = ""; // Will use first team

  useEffect(() => {
    loadLogs();
    loadExports();
  }, []);

  async function loadLogs(cursor?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (cursor) params.set("cursor", cursor);
      if (filterAction) params.set("action", filterAction);
      if (filterResource) params.set("resource", filterResource);
      if (filterSeverity) params.set("severity", filterSeverity);
      if (filterStartDate) params.set("startDate", filterStartDate);
      if (filterEndDate) params.set("endDate", filterEndDate);

      const res = await fetch(`/api/audit/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (cursor) {
          setLogs((prev) => [...prev, ...data.logs]);
        } else {
          setLogs(data.logs || []);
        }
        setTotal(data.total || 0);
        setHasMore(data.hasMore || false);
        setNextCursor(data.nextCursor || null);
      }
    } catch (error) {
      console.error("Failed to load audit logs:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadExports() {
    try {
      // Try first team
      const teamRes = await fetch("/api/teams");
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        const firstTeam = teamData.teams?.[0];
        if (firstTeam) {
          const res = await fetch(`/api/audit/exports?teamId=${firstTeam.id}`);
          if (res.ok) {
            const data = await res.json();
            setExports(data.exports || []);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load exports:", error);
    }
  }

  async function verifyChain() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/audit/verify", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setVerifyResult(data);
      }
    } catch (error) {
      console.error("Failed to verify chain:", error);
    } finally {
      setVerifying(false);
    }
  }

  async function createExport() {
    if (!newExportName.trim()) return;
    try {
      const teamRes = await fetch("/api/teams");
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        const firstTeam = teamData.teams?.[0];
        if (firstTeam) {
          const res = await fetch("/api/audit/exports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              teamId: firstTeam.id,
              name: newExportName.trim(),
              destination: newExportDest,
              schedule: newExportSchedule,
            }),
          });
          if (res.ok) {
            setNewExportName("");
            setShowExportForm(false);
            await loadExports();
          }
        }
      }
    } catch (error) {
      console.error("Failed to create export:", error);
    }
  }

  async function deleteExport(id: string) {
    if (!confirm("Delete this export configuration?")) return;
    try {
      await fetch(`/api/audit/exports/${id}`, { method: "DELETE" });
      await loadExports();
    } catch (error) {
      console.error("Failed to delete export:", error);
    }
  }

  function applyFilters() {
    loadLogs();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-amber-600" />
          <h3 className="text-lg font-semibold">Audit Log</h3>
          <Badge variant="secondary" className="text-xs">{total} entries</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={verifyChain} disabled={verifying}>
            {verifying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Shield className="h-4 w-4 mr-1" />}
            Verify Chain
          </Button>
        </div>
      </div>

      {verifyResult && (
        <div className={`p-3 rounded-lg text-sm border ${verifyResult.valid ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"}`}>
          {verifyResult.valid ? <CheckCircle2 className="h-4 w-4 inline mr-1" /> : <XCircle className="h-4 w-4 inline mr-1" />}
          {verifyResult.message}
          {verifyResult.tamperedEntries > 0 && (
            <p className="mt-1 text-xs">Tampered IDs: {verifyResult.tamperedIds.join(", ")}</p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4" /> Filters
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Action</Label>
            <Input value={filterAction} onChange={(e) => setFilterAction(e.target.value)} placeholder="e.g. project.create" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Resource</Label>
            <Input value={filterResource} onChange={(e) => setFilterResource(e.target.value)} placeholder="e.g. project" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Severity</Label>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button size="sm" onClick={applyFilters}>Apply</Button>
          </div>
        </div>
      </div>

      {/* Log entries */}
      {loading && logs.length === 0 ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileSearch className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No audit log entries found.</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {logs.map((log) => {
            const SeverityIcon = severityIcons[log.severity] || Info;
            const isExpanded = expandedId === log.id;
            return (
              <div key={log.id} className="border rounded-lg">
                <button
                  className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <SeverityIcon className={`h-4 w-4 shrink-0 ${log.severity === "critical" ? "text-red-500" : log.severity === "warning" ? "text-amber-500" : "text-blue-500"}`} />
                  <span className="font-mono text-sm font-medium">{log.action}</span>
                  <Badge variant="outline" className="text-xs">{log.resource}</Badge>
                  <Badge className={`text-xs ${severityColors[log.severity] || "bg-gray-100"}`}>{log.severity}</Badge>
                  {!log.chainValid && <Badge className="text-xs bg-red-100 text-red-800">Tampered</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {log.userName || log.userEmail || "System"} · {new Date(log.createdAt).toLocaleString()}
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 space-y-2 text-sm border-t">
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      {log.resourceId && <p><span className="text-muted-foreground">Resource ID:</span> {log.resourceId}</p>}
                      {log.ipAddress && <p><span className="text-muted-foreground">IP:</span> {log.ipAddress}</p>}
                      <p><span className="text-muted-foreground">Hash:</span> <span className="font-mono text-xs">{(log.entryHash ?? "").slice(0, 16)}...</span></p>
                      <p><span className="text-muted-foreground">Previous:</span> <span className="font-mono text-xs">{(log.previousHash || "genesis").slice(0, 16)}...</span></p>
                    </div>
                    {log.beforeSnapshot && (
                      <div>
                        <p className="font-medium text-amber-700 mb-1">Before:</p>
                        <pre className="bg-amber-50 p-2 rounded text-xs overflow-auto max-h-32">
                          {JSON.stringify(log.beforeSnapshot, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.afterSnapshot && (
                      <div>
                        <p className="font-medium text-green-700 mb-1">After:</p>
                        <pre className="bg-green-50 p-2 rounded text-xs overflow-auto max-h-32">
                          {JSON.stringify(log.afterSnapshot, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.metadata && (
                      <div>
                        <p className="font-medium text-blue-700 mb-1">Metadata:</p>
                        <pre className="bg-blue-50 p-2 rounded text-xs overflow-auto max-h-32">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {hasMore && (
            <div className="text-center py-2">
              <Button variant="outline" size="sm" onClick={() => nextCursor && loadLogs(nextCursor)}>
                Load More
              </Button>
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* Export Configuration */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <Download className="h-4 w-4" /> Export Configurations
          </h4>
          <Button size="sm" variant="outline" onClick={() => setShowExportForm(!showExportForm)}>
            <Plus className="h-4 w-4 mr-1" /> Add Export
          </Button>
        </div>

        {exports.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No export configurations yet.</p>
        ) : (
          <div className="space-y-2">
            {exports.map((exp) => (
              <div key={exp.id} className="border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{exp.name}</span>
                  <div className="text-xs text-muted-foreground">
                    {exp.destination} · {exp.schedule} · Retention: {exp.retention}
                    {exp.exportCount > 0 && ` · ${exp.exportCount} exports`}
                    {exp.lastError && <span className="text-red-500 ml-2">Error: {exp.lastError}</span>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteExport(exp.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {showExportForm && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={newExportName} onChange={(e) => setNewExportName(e.target.value)} placeholder="Weekly SIEM Export" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Destination</Label>
                <Select value={newExportDest} onValueChange={setNewExportDest}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="splunk">Splunk</SelectItem>
                    <SelectItem value="datadog">Datadog</SelectItem>
                    <SelectItem value="aws_cloudtrail">AWS CloudTrail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Schedule</Label>
                <Select value={newExportSchedule} onValueChange={setNewExportSchedule}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={createExport} disabled={!newExportName.trim()}>Create Export</Button>
              <Button size="sm" variant="outline" onClick={() => setShowExportForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
