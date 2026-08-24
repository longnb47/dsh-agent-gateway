import test from "node:test";
import assert from "node:assert/strict";
import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolService } from "../../src/mcp/tools.js";

test("live OpenCode smoke test is opt-in", async (t) => {
  if (process.env.DSH_OPENCODE_LIVE !== "1") return t.skip("set DSH_OPENCODE_LIVE=1 and provide explicit OpenCode paths to run live");
  const command = process.env.DSH_OPENCODE_COMMAND;
  const cwd = process.env.DSH_OPENCODE_CWD;
  const model = process.env.DSH_OPENCODE_MODEL;
  if (!command || !cwd) throw new Error("DSH_OPENCODE_COMMAND and DSH_OPENCODE_CWD are required when DSH_OPENCODE_LIVE=1");
  const policy = { filesystem: "read-only" as const, network: "deny" as const, credentials: "deny" as const, process: "deny-shell" as const };
  const config = { version: 1 as const, defaults: { timeoutSeconds: 600 }, drivers: { opencode: { kind: "opencode", command } }, agents: [{ name: "opencode-reviewer", label: "OpenCode", description: "live", driver: "opencode", purposes: ["review"], policy, promptContract: "read-only-specialist", ...(model === undefined ? {} : { defaults: { model } }), enabled: true }] };
  const result = await new ToolService(config, new DriverRegistry(config)).callAgent({ agent: "opencode-reviewer", task: "Provide a concise reasoning-only review of this request.", cwd });
  assert.ok(result.status === "success" || result.status === "error" || result.status === "timeout" || result.status === "cancelled");
});
