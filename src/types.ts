export type FilesystemPolicy = "none" | "read-only" | "workspace-write";
export type NetworkPolicy = "deny" | "allow";
export type CredentialPolicy = "deny" | "inherited-approved";
export type ProcessPolicy = "deny-shell" | "driver-default";
export interface AgentPolicy { readonly filesystem: FilesystemPolicy; readonly network: NetworkPolicy; readonly credentials: CredentialPolicy; readonly process: ProcessPolicy; }
export interface AgentResult { readonly status: "success" | "error" | "timeout" | "cancelled"; readonly response?: string; readonly error?: { readonly phase: string; readonly code: string; readonly message: string }; readonly metadata: { readonly agent: string; readonly driver: string; readonly cwd: string; readonly durationMs: number; readonly exitCode: number | null; readonly modelRequested?: string; readonly modelReported?: string; readonly policyRequested: object; readonly enforcementReported: object; readonly outputTruncated: boolean; }; }