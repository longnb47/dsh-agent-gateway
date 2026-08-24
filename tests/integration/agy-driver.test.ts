import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolService } from "../../src/mcp/tools.js";

const script = resolve("tests/fixtures/fake-agy/cli.mjs");
const policy = { filesystem: "read-only" as const, network: "deny" as const, credentials: "deny" as const, process: "deny-shell" as const };
const config = { version: 1 as const, defaults: { timeoutSeconds: 2, maxOutputBytes: 2097152 }, drivers: { agy: { kind: "agy", command: process.execPath, script } }, agents: [{ name: "agy-reviewer", label: "AGY reviewer", description: "fixture", driver: "agy", purposes: ["review"], policy, promptContract: "read-only-specialist", defaults: { model: "gemini-default", effort: "low" as const }, enabled: true }] };
const service = new ToolService(config, new DriverRegistry(config));

test("AGY fixture preserves cwd and Unicode through call_agent", async () => {
  const task = "Đánh giá tiếng Việt";
  const result = await service.callAgent({ agent: "agy-reviewer", task, cwd: process.cwd() });
  assert.equal(result.status, "success"); assert.equal(result.response, `echo: ${task}`); assert.equal(result.metadata.cwd, process.cwd());
});

test("call_agent resolves profile model and effort defaults with input model override", async () => {
  const fromProfile = await service.callAgent({ agent: "agy-reviewer", task: "ECHO_OPTIONS", cwd: process.cwd() });
  assert.equal(fromProfile.status, "success");
  assert.equal(fromProfile.metadata.modelRequested, "gemini-default");
  assert.deepEqual(JSON.parse(fromProfile.response ?? ""), { model: "gemini-default", effort: "low" });

  const overridden = await service.callAgent({ agent: "agy-reviewer", task: "ECHO_OPTIONS", cwd: process.cwd(), model: "  gemini-override  " });
  assert.equal(overridden.metadata.modelRequested, "gemini-override");
  assert.deepEqual(JSON.parse(overridden.response ?? ""), { model: "gemini-override", effort: "low" });

  await assert.rejects(service.callAgent({ agent: "agy-reviewer", task: "hello", cwd: process.cwd(), model: "bad model!" }), /model is not a valid slug/);
});

test("AGY fixture maps fail-closed error cases", async () => {
  for (const [task, phase, code] of [["PERMISSION_DENIED", "permission", "permission_denied"], ["INVALID_JSON", "parse", "invalid_json"], ["EMPTY_RESPONSE", "protocol", "empty_response"]] as const) {
    const result = await service.callAgent({ agent: "agy-reviewer", task, cwd: process.cwd() });
    assert.equal(result.status, "error"); assert.equal(result.error?.phase, phase); assert.equal(result.error?.code, code);
  }
});
