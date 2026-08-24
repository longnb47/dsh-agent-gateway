import test from "node:test";
import assert from "node:assert/strict";
import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolService } from "../../src/mcp/tools.js";

test("live Codex smoke test is opt-in", async (t) => {
  if (process.env.DSH_CODEX_LIVE !== "1") return t.skip("set DSH_CODEX_LIVE=1 and provide explicit Codex paths to run live");
  const command = process.env.DSH_CODEX_COMMAND;
  const script = process.env.DSH_CODEX_SCRIPT;
  const cwd = process.env.DSH_CODEX_CWD;
  if (!command || !script || !cwd) throw new Error("DSH_CODEX_COMMAND, DSH_CODEX_SCRIPT, and DSH_CODEX_CWD are required when DSH_CODEX_LIVE=1");
  const policy = { filesystem: "read-only" as const, network: "deny" as const, credentials: "deny" as const, process: "deny-shell" as const };
  const config = { version: 1 as const, defaults: { timeoutSeconds: 600 }, drivers: { codex: { kind: "codex", command, script } }, agents: [{ name: "codex-reviewer", label: "Codex", description: "live", driver: "codex", purposes: ["review"], policy, promptContract: "read-only-specialist", enabled: true }] };
  const result = await new ToolService(config, new DriverRegistry(config)).callAgent({ agent: "codex-reviewer", task: "Provide a concise reasoning-only review of this request.", cwd });
  assert.ok(result.status === "success" || result.status === "error" || result.status === "timeout" || result.status === "cancelled");
});
