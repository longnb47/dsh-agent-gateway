import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolService } from "../../src/mcp/tools.js";

const script = resolve("tests/fixtures/fake-codex/cli.mjs");
const policy = { filesystem: "read-only" as const, network: "deny" as const, credentials: "deny" as const, process: "deny-shell" as const };
const config = { version: 1 as const, defaults: { timeoutSeconds: 2, maxOutputBytes: 2097152 }, drivers: { codex: { kind: "codex", command: process.execPath, script } }, agents: [{ name: "codex-reviewer", label: "Codex reviewer", description: "fixture", driver: "codex", purposes: ["review"], policy, promptContract: "read-only-specialist", enabled: true }] };
const service = new ToolService(config, new DriverRegistry(config));

test("Codex fixture receives the stdin contract and preserves cwd and Unicode", async () => {
  const task = "Đánh giá tiếng Việt";
  const result = await service.callAgent({ agent: "codex-reviewer", task, cwd: process.cwd() });
  assert.equal(result.status, "success");
  assert.equal(result.response, `echo: ${task}`);
  assert.equal(result.metadata.cwd, process.cwd());
  assert.equal(result.metadata.modelReported, "fake-codex");
});

test("Codex fixture maps empty and nonzero results fail-closed", async () => {
  const empty = await service.callAgent({ agent: "codex-reviewer", task: "EMPTY", cwd: process.cwd() });
  assert.deepEqual(empty.error && { phase: empty.error.phase, code: empty.error.code }, { phase: "protocol", code: "empty_response" });
  const failed = await service.callAgent({ agent: "codex-reviewer", task: "EXIT_NONZERO", cwd: process.cwd() });
  assert.deepEqual(failed.error && { phase: failed.error.phase, code: failed.error.code }, { phase: "process", code: "exit_nonzero" });
});
