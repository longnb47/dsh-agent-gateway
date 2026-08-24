import assert from "node:assert/strict";
import test from "node:test";
import { runAgentHealth } from "../../src/drivers/health.js";

test("live agent status probe is opt-in", async (t) => {
  if (process.env.DSH_STATUS_LIVE !== "1") {
    return t.skip("set DSH_STATUS_LIVE=1 and provide DSH_STATUS_COMMAND, DSH_STATUS_KIND, and DSH_STATUS_CWD");
  }
  const command = process.env.DSH_STATUS_COMMAND;
  const kind = process.env.DSH_STATUS_KIND;
  const cwd = process.env.DSH_STATUS_CWD;
  if (!command || !kind || !cwd) {
    throw new Error("DSH_STATUS_COMMAND, DSH_STATUS_KIND, and DSH_STATUS_CWD are required when DSH_STATUS_LIVE=1");
  }

  const result = await runAgentHealth(kind, { kind, command }, { agent: "live-status", driver: "live-status", cwd });
  assert.ok(result.status === "ready" || result.status === "not-ready" || result.status === "unknown");
});
