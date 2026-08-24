import type { AgentPolicy } from "../types.js";
export interface GatewayDefaults { readonly timeoutSeconds?: number; readonly maxOutputBytes?: number; readonly maxConcurrency?: number; }
export interface DriverConfig { readonly kind: string; readonly command: string; readonly script?: string; }
export interface AgentConfig { readonly name: string; readonly label: string; readonly description: string; readonly driver: string; readonly purposes: readonly string[]; readonly policy: AgentPolicy; readonly promptContract: string; readonly agent?: string; readonly requiredSkill?: string; readonly defaults?: { readonly effort?: "low" | "medium" | "high"; readonly timeoutSeconds?: number; readonly model?: string }; readonly enabled: boolean; }
export interface GatewayConfig { readonly version: 1; readonly defaults: GatewayDefaults; readonly allowedWorkspaceRoots?: readonly string[]; readonly drivers: Readonly<Record<string, DriverConfig>>; readonly agents: readonly AgentConfig[]; }
