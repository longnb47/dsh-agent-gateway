import assert from "node:assert/strict";
import test from "node:test";
import { driverMetadata } from "../../src/drivers/metadata.js";

test("driverMetadata reports the static metadata for every supported kind", () => {
  assert.deepEqual(driverMetadata("codex"), {
    costTier: "paid",
    constraints: [],
    enforcementSummary: { filesystem: "read-only", network: "unverified", process: "sandboxed" },
  });
  assert.deepEqual(driverMetadata("agy"), {
    costTier: "paid",
    constraints: ["read-only is best-effort (permission-based, not a hard sandbox)"],
    enforcementSummary: {
      filesystem: "read-only-best-effort",
      network: "deny-best-effort",
      process: "deny-shell-best-effort",
    },
  });
  assert.deepEqual(driverMetadata("opencode"), {
    costTier: "free",
    constraints: ["free-tier quota may be limited"],
    enforcementSummary: { filesystem: "read-only-best-effort", network: "unverified", process: "unverified" },
  });
  assert.deepEqual(driverMetadata("fake"), {
    costTier: "n/a",
    constraints: [],
    enforcementSummary: { filesystem: "none", network: "none", process: "argv-only" },
  });
  assert.deepEqual(driverMetadata("future-driver"), {
    costTier: "n/a",
    constraints: [],
    enforcementSummary: { filesystem: "unknown", network: "unknown", process: "unknown" },
  });
});
