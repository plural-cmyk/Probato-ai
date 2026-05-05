/**
 * Probato SDK — Main Entry Point
 *
 * Unified SDK for the Probato AI Testing Platform.
 * Provides access to all Phase 6 resources:
 * - Intelligence (M29): Smart test selection, flakiness analysis, impact prioritization
 * - Self-Heal (M30): Auto-repair selectors, maintenance scans, deprecation tracking
 * - Monitoring (M31): Synthetic checkpoints, performance baselines, regressions
 * - Plugins (M33): Plugin management, marketplace integration
 */

import { IntelligenceResource } from "./intelligence";
import { SelfHealResource } from "./self-heal";
import { MonitoringResource } from "./monitoring";
import { PluginsResource } from "./plugins";

export interface ProbatoSDKConfig {
  /** Base URL of the Probato API (e.g. "https://probato.ai") */
  baseUrl: string;
  /** API key for authentication (pb_live_xxx or pb_test_xxx) */
  apiKey: string;
}

export class ProbatoSDK {
  public intelligence: IntelligenceResource;
  public selfHeal: SelfHealResource;
  public monitoring: MonitoringResource;
  public plugins: PluginsResource;

  /** SDK configuration */
  public readonly config: ProbatoSDKConfig;

  constructor(config: ProbatoSDKConfig) {
    this.config = config;
    this.intelligence = new IntelligenceResource(config);
    this.selfHeal = new SelfHealResource(config);
    this.monitoring = new MonitoringResource(config);
    this.plugins = new PluginsResource(config);
  }
}

// Re-export resource classes for direct usage
export { IntelligenceResource, IntelligenceError } from "./intelligence";
export { SelfHealResource, SelfHealError } from "./self-heal";
export { MonitoringResource, MonitoringError } from "./monitoring";
export { PluginsResource, PluginError } from "./plugins";

// Re-export types
export type {
  IntelligenceSelectOptions,
  IntelligenceSelectResult,
  FlakinessAnalysisResult,
  PrioritizeResult,
  DependenciesResult,
} from "./intelligence";

export type {
  AutoRepairOptions,
  AutoRepairResult,
  SelectorRepairEntry,
  SelectorRepairsResult,
  MaintenanceScanResult,
  DeprecationEntry,
  DeprecationsResult,
} from "./self-heal";

export type {
  Checkpoint,
  CreateCheckpointData,
  ListCheckpointsResult,
  CreateCheckpointResult,
  RunCheckpointResult,
  Baseline,
  BaselinesResult,
  Regression,
  RegressionsResult,
} from "./monitoring";

export type {
  Plugin,
  ListPluginsResult,
  InstallPluginData,
  InstallPluginResult,
  ConfigurePluginResult,
  ActivatePluginResult,
} from "./plugins";

export default ProbatoSDK;
