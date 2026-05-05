/**
 * Probato SDK — Plugins Resource
 *
 * SDK resource for Plugin Architecture (M33).
 * Provides methods for listing, installing, configuring,
 * activating, and deactivating plugins.
 */

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  status: string;
  enabled: boolean;
  config: Record<string, any>;
  installedAt: string;
  updatedAt: string;
}

export interface ListPluginsResult {
  success: boolean;
  plugins: Plugin[];
  total: number;
}

export interface InstallPluginData {
  name: string;
  version: string;
  manifest: any;
}

export interface InstallPluginResult {
  success: boolean;
  plugin: Plugin;
}

export interface ConfigurePluginResult {
  success: boolean;
  plugin: Plugin;
}

export interface ActivatePluginResult {
  success: boolean;
  plugin: { id: string; name: string; enabled: boolean; status: string };
}

export class PluginsResource {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: { baseUrl: string; apiKey: string }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };
  }

  /** List installed plugins for a team */
  async list(teamId: string): Promise<ListPluginsResult> {
    const res = await fetch(
      `${this.baseUrl}/api/plugins?teamId=${encodeURIComponent(teamId)}`,
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new PluginError(
        `List plugins failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Install a plugin */
  async install(
    teamId: string,
    data: InstallPluginData
  ): Promise<InstallPluginResult> {
    const res = await fetch(`${this.baseUrl}/api/plugins`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ teamId, ...data }),
    });

    if (!res.ok) {
      throw new PluginError(
        `Install plugin failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Configure a plugin */
  async configure(
    pluginId: string,
    config: Record<string, any>
  ): Promise<ConfigurePluginResult> {
    const res = await fetch(
      `${this.baseUrl}/api/plugins/${encodeURIComponent(pluginId)}`,
      {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify({ config }),
      }
    );

    if (!res.ok) {
      throw new PluginError(
        `Configure plugin failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Activate a plugin */
  async activate(pluginId: string): Promise<ActivatePluginResult> {
    const res = await fetch(
      `${this.baseUrl}/api/plugins/${encodeURIComponent(pluginId)}/activate`,
      {
        method: "POST",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new PluginError(
        `Activate plugin failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }

  /** Deactivate a plugin */
  async deactivate(pluginId: string): Promise<ActivatePluginResult> {
    const res = await fetch(
      `${this.baseUrl}/api/plugins/${encodeURIComponent(pluginId)}/deactivate`,
      {
        method: "POST",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new PluginError(
        `Deactivate plugin failed: ${res.status}`,
        res.status
      );
    }

    return res.json();
  }
}

export class PluginError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PluginError";
    this.status = status;
  }
}
