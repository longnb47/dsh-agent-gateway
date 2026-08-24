import test from "node:test";
import assert from "node:assert/strict";
import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolService } from "../../src/mcp/tools.js";

test("live AGY smoke test is opt-in", async (t) => {
  if (process.env.DSH_AGY_LIVE !== "1") return t.skip("set DSH_AGY_LIVE=1 and provide an explicit live-test config to run AGY");
  const command = process.env.DSH_AGY_COMMAND;
  const cwd = process.env.DSH_AGY_CWD;
  if (!command || !cwd) throw new Error("DSH_AGY_COMMAND and DSH_AGY_CWD are required when DSH_AGY_LIVE=1");
  const policy = { filesystem: "read-only" as const, network: "deny" as const, credentials: "deny" as const, process: "deny-shell" as const };
  const config = { version: 1 as const, defaults: { timeoutSeconds: 600 }, drivers: { agy: { kind: "agy", command } }, agents: [{ name: "agy-reviewer", label: "AGY", description: "live", driver: "agy", purposes: ["review"], policy, promptContract: "read-only-specialist", enabled: true }] };
  const result = await new ToolService(config, new DriverRegistry(config)).callAgent({ agent: "agy-reviewer", task: process.env.DSH_AGY_TASK ?? "Provide a concise reasoning-only review of this request.", cwd });
  assert.ok(result.status === "success" || result.status === "error" || result.status === "timeout" || result.status === "cancelled");
});
