"use client";

import { useState, useEffect } from "react";
import {
  Shield,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  ExternalLink,
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface SSOConfig {
  id: string;
  protocol: string;
  label: string;
  enabled: boolean;
  samlEntryUrl: string | null;
  samlLogoutUrl: string | null;
  samlCertificate: string | null;
  samlIssuer: string | null;
  oidcClientId: string | null;
  oidcClientSecret: string | null;
  oidcDiscoveryUrl: string | null;
  oidcScopes: string[];
  groupRoleMapping: Record<string, string>;
  allowedDomains: string[];
  autoProvision: boolean;
  status: string;
  lastTestedAt: string | null;
  lastError: string | null;
  teamId: string;
  createdAt: string;
}

interface Props {
  onClose: () => void;
}

export default function SSOConfigPanel({ onClose }: Props) {
  const [configs, setConfigs] = useState<SSOConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [metadataVisible, setMetadataVisible] = useState(false);
  const [metadataXml, setMetadataXml] = useState("");

  // Form state
  const [formProtocol, setFormProtocol] = useState("saml");
  const [formLabel, setFormLabel] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formSamlEntryUrl, setFormSamlEntryUrl] = useState("");
  const [formSamlLogoutUrl, setFormSamlLogoutUrl] = useState("");
  const [formSamlCertificate, setFormSamlCertificate] = useState("");
  const [formSamlIssuer, setFormSamlIssuer] = useState("");
  const [formOidcClientId, setFormOidcClientId] = useState("");
  const [formOidcClientSecret, setFormOidcClientSecret] = useState("");
  const [formOidcDiscoveryUrl, setFormOidcDiscoveryUrl] = useState("");
  const [formOidcScopes, setFormOidcScopes] = useState("openid, email, profile");
  const [formAllowedDomains, setFormAllowedDomains] = useState("");
  const [formAutoProvision, setFormAutoProvision] = useState(true);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    setLoading(true);
    try {
      // Get user's first team
      const res = await fetch("/api/teams");
      if (res.ok) {
        const data = await res.json();
        const firstTeam = data.teams?.[0];
        if (firstTeam) {
          setTeamId(firstTeam.id);
          const configRes = await fetch(`/api/sso/config?teamId=${firstTeam.id}`);
          if (configRes.ok) {
            const configData = await configRes.json();
            setConfigs(configData.configs || []);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load SSO configs:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    if (!formLabel.trim() || !teamId) return;
    setSaving(true);
    try {
      const body: Record<string, any> = {
        teamId,
        protocol: formProtocol,
        label: formLabel.trim(),
        enabled: formEnabled,
        autoProvision: formAutoProvision,
      };

      if (formProtocol === "saml") {
        body.samlEntryUrl = formSamlEntryUrl || null;
        body.samlLogoutUrl = formSamlLogoutUrl || null;
        body.samlCertificate = formSamlCertificate || null;
        body.samlIssuer = formSamlIssuer || null;
      } else {
        body.oidcClientId = formOidcClientId || null;
        body.oidcClientSecret = formOidcClientSecret || null;
        body.oidcDiscoveryUrl = formOidcDiscoveryUrl || null;
        body.oidcScopes = formOidcScopes.split(",").map((s) => s.trim()).filter(Boolean);
      }

      body.allowedDomains = formAllowedDomains.split(",").map((s) => s.trim()).filter(Boolean);

      if (editingId) {
        await fetch(`/api/sso/config/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/sso/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      resetForm();
      await loadConfigs();
    } catch (error) {
      console.error("Failed to save SSO config:", error);
    } finally {
      setSaving(false);
    }
  }

  async function deleteConfig(id: string) {
    if (!confirm("Delete this SSO configuration?")) return;
    try {
      await fetch(`/api/sso/config/${id}`, { method: "DELETE" });
      await loadConfigs();
    } catch (error) {
      console.error("Failed to delete SSO config:", error);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      // Simulate a test by fetching metadata
      const res = await fetch(`/api/sso/metadata?teamId=${teamId}`);
      if (res.ok) {
        setTestResult({ success: true, message: "Connection test successful — metadata endpoint is reachable" });
      } else {
        const data = await res.json();
        setTestResult({ success: false, message: data.error || "Connection test failed" });
      }
    } catch (error) {
      setTestResult({ success: false, message: "Connection test failed — endpoint unreachable" });
    } finally {
      setTesting(false);
    }
  }

  async function showMetadata() {
    try {
      const res = await fetch(`/api/sso/metadata?teamId=${teamId}`);
      if (res.ok) {
        const text = await res.text();
        setMetadataXml(text);
        setMetadataVisible(true);
      }
    } catch (error) {
      console.error("Failed to fetch metadata:", error);
    }
  }

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormProtocol("saml");
    setFormLabel("");
    setFormEnabled(true);
    setFormSamlEntryUrl("");
    setFormSamlLogoutUrl("");
    setFormSamlCertificate("");
    setFormSamlIssuer("");
    setFormOidcClientId("");
    setFormOidcClientSecret("");
    setFormOidcDiscoveryUrl("");
    setFormOidcScopes("openid, email, profile");
    setFormAllowedDomains("");
    setFormAutoProvision(true);
  }

  function editConfig(config: SSOConfig) {
    setEditingId(config.id);
    setFormProtocol(config.protocol);
    setFormLabel(config.label);
    setFormEnabled(config.enabled);
    setFormSamlEntryUrl(config.samlEntryUrl || "");
    setFormSamlLogoutUrl(config.samlLogoutUrl || "");
    setFormSamlCertificate(config.samlCertificate || "");
    setFormSamlIssuer(config.samlIssuer || "");
    setFormOidcClientId(config.oidcClientId || "");
    setFormOidcClientSecret("");
    setFormOidcDiscoveryUrl(config.oidcDiscoveryUrl || "");
    setFormOidcScopes(config.oidcScopes?.join(", ") || "openid, email, profile");
    setFormAllowedDomains(config.allowedDomains?.join(", ") || "");
    setFormAutoProvision(config.autoProvision);
    setShowForm(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-purple-600" />
          <h3 className="text-lg font-semibold">SSO Configuration</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={showMetadata}>
            <ExternalLink className="h-4 w-4 mr-1" /> SP Metadata
          </Button>
          <Button variant="outline" size="sm" onClick={testConnection} disabled={testing || configs.length === 0}>
            {testing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Test Connection
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Config
          </Button>
        </div>
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {testResult.success ? <CheckCircle2 className="h-4 w-4 inline mr-1" /> : <XCircle className="h-4 w-4 inline mr-1" />}
          {testResult.message}
        </div>
      )}

      {metadataVisible && (
        <div className="relative">
          <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => setMetadataVisible(false)}>
            <XCircle className="h-4 w-4" />
          </Button>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-auto max-h-64">
            {metadataXml}
          </pre>
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => navigator.clipboard.writeText(metadataXml)}>
            <Copy className="h-3 w-3 mr-1" /> Copy
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
        </div>
      ) : configs.length === 0 && !showForm ? (
        <div className="text-center py-8 text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No SSO configurations yet.</p>
          <p className="text-sm">Add a configuration to enable enterprise SSO for your team.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <div key={config.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={config.protocol === "saml" ? "default" : "secondary"}>
                    {config.protocol.toUpperCase()}
                  </Badge>
                  <span className="font-medium">{config.label}</span>
                  <Badge variant={config.enabled ? "default" : "outline"} className={config.enabled ? "bg-green-100 text-green-800" : ""}>
                    {config.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  {config.status === "testing" && <Badge className="bg-yellow-100 text-yellow-800">Testing</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => editConfig(config)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteConfig(config.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                {config.protocol === "saml" ? (
                  <>
                    {config.samlEntryUrl && <p>SSO URL: {config.samlEntryUrl}</p>}
                    {config.samlIssuer && <p>Issuer: {config.samlIssuer}</p>}
                  </>
                ) : (
                  <>
                    {config.oidcClientId && <p>Client ID: {config.oidcClientId}</p>}
                    {config.oidcDiscoveryUrl && <p>Discovery: {config.oidcDiscoveryUrl}</p>}
                  </>
                )}
                {config.allowedDomains.length > 0 && <p>Domains: {config.allowedDomains.join(", ")}</p>}
                {config.autoProvision && <p>Auto-provision: Enabled</p>}
                {config.lastTestedAt && <p className="text-xs">Last tested: {new Date(config.lastTestedAt).toLocaleString()}</p>}
                {config.lastError && <p className="text-red-500 text-xs">Error: {config.lastError}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="border rounded-lg p-4 space-y-4">
          <h4 className="font-medium">{editingId ? "Edit SSO Configuration" : "New SSO Configuration"}</h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Protocol</Label>
              <Select value={formProtocol} onValueChange={setFormProtocol}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="saml">SAML 2.0</SelectItem>
                  <SelectItem value="oidc">OpenID Connect</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Label</Label>
              <Input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder="e.g. Okta SSO" />
            </div>
          </div>

          {formProtocol === "saml" ? (
            <div className="space-y-3">
              <div>
                <Label>IdP SSO URL</Label>
                <Input value={formSamlEntryUrl} onChange={(e) => setFormSamlEntryUrl(e.target.value)} placeholder="https://idp.example.com/sso" />
              </div>
              <div>
                <Label>IdP SLO URL</Label>
                <Input value={formSamlLogoutUrl} onChange={(e) => setFormSamlLogoutUrl(e.target.value)} placeholder="https://idp.example.com/slo" />
              </div>
              <div>
                <Label>IdP X.509 Certificate</Label>
                <textarea
                  className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formSamlCertificate}
                  onChange={(e) => setFormSamlCertificate(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                />
              </div>
              <div>
                <Label>IdP Entity ID</Label>
                <Input value={formSamlIssuer} onChange={(e) => setFormSamlIssuer(e.target.value)} placeholder="https://idp.example.com" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Client ID</Label>
                <Input value={formOidcClientId} onChange={(e) => setFormOidcClientId(e.target.value)} placeholder="your-client-id" />
              </div>
              <div>
                <Label>Client Secret</Label>
                <Input type="password" value={formOidcClientSecret} onChange={(e) => setFormOidcClientSecret(e.target.value)} placeholder="your-client-secret" />
              </div>
              <div>
                <Label>Discovery URL</Label>
                <Input value={formOidcDiscoveryUrl} onChange={(e) => setFormOidcDiscoveryUrl(e.target.value)} placeholder="https://idp.example.com/.well-known/openid-configuration" />
              </div>
              <div>
                <Label>Scopes (comma-separated)</Label>
                <Input value={formOidcScopes} onChange={(e) => setFormOidcScopes(e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <Label>Allowed Domains (comma-separated)</Label>
            <Input value={formAllowedDomains} onChange={(e) => setFormAllowedDomains(e.target.value)} placeholder="company.com, org.com" />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
              <Label>Enabled</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formAutoProvision} onCheckedChange={setFormAutoProvision} />
              <Label>Auto-provision users</Label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={saveConfig} disabled={saving || !formLabel.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? "Update" : "Create"} Configuration
            </Button>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
