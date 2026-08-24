import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolService } from "../../src/mcp/tools.js";

const script = resolve("tests/fixtures/fake-opencode/cli.mjs");
const policy = { filesystem: "read-only" as const, network: "deny" as const, credentials: "deny" as const, process: "deny-shell" as const };
const config = { version: 1 as const, defaults: { timeoutSeconds: 2, maxOutputBytes: 2097152 }, drivers: { opencode: { kind: "opencode", command: process.execPath, script } }, agents: [{ name: "opencode-reviewer", label: "OpenCode reviewer", description: "fixture", driver: "opencode", purposes: ["review"], policy, promptContract: "read-only-specialist", defaults: { model: "hy3-free" }, enabled: true }] };
const service = new ToolService(config, new DriverRegistry(config));

test("OpenCode fixture echoes contract task and preserves cwd, Unicode, and model metadata", async () => {
  const task = "Đánh giá tiếng Việt";
  const result = await service.callAgent({ agent: "opencode-reviewer", task, cwd: process.cwd() });
  assert.equal(result.status, "success");
  assert.equal(result.response, `echo: ${task}`);
  assert.equal(result.metadata.cwd, process.cwd());
  assert.equal(result.metadata.modelRequested, "hy3-free");
  assert.equal(result.metadata.modelReported, "hy3-free");
});

test("OpenCode fixture maps empty, nonzero, and quota results fail-closed", async () => {
  for (const [task, phase, code] of [["EMPTY", "protocol", "empty_response"], ["EXIT_NONZERO", "process", "exit_nonzero"], ["QUOTA", "provider", "quota_exceeded"]] as const) {
    const result = await service.callAgent({ agent: "opencode-reviewer", task, cwd: process.cwd() });
    assert.equal(result.status, "error");
    assert.equal(result.error?.phase, phase);
    assert.equal(result.error?.code, code);
  }
});
