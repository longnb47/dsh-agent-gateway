export interface EnforcementSummary {
  readonly filesystem: string;
  readonly network: string;
  readonly process: string;
}

export type CostTier = "free" | "paid" | "n/a";

export interface DriverMetadata {
  readonly costTier: CostTier;
  readonly constraints: readonly string[];
  readonly enforcementSummary: EnforcementSummary;
}

export function driverMetadata(kind: string): DriverMetadata {
  switch (kind) {
    case "codex":
      return {
        costTier: "paid",
        constraints: [],
        enforcementSummary: { filesystem: "read-only", network: "unverified", process: "sandboxed" },
      };
    case "agy":
      return {
        costTier: "paid",
        constraints: ["read-only is best-effort (permission-based, not a hard sandbox)"],
        enforcementSummary: {
          filesystem: "read-only-best-effort",
          network: "deny-best-effort",
          process: "deny-shell-best-effort",
        },
      };
    case "opencode":
      return {
        costTier: "free",
        constraints: ["free-tier quota may be limited"],
        enforcementSummary: { filesystem: "read-only-best-effort", network: "unverified", process: "unverified" },
      };
    case "fake":
      return {
        costTier: "n/a",
        constraints: [],
        enforcementSummary: { filesystem: "none", network: "none", process: "argv-only" },
      };
    default:
      return {
        costTier: "n/a",
        constraints: [],
        enforcementSummary: { filesystem: "unknown", network: "unknown", process: "unknown" },
      };
  }
}
