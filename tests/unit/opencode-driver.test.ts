import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../../src/config/validator.js";
import { renderContract } from "../../src/contracts/builtins.js";
import { OpencodeDriver } from "../../src/drivers/opencode/driver.js";
import { opencodeEnvironment } from "../../src/drivers/opencode/invocation.js";

const policy = { filesystem: "read-only" as const, network: "deny" as const, credentials: "deny" as const, process: "deny-shell" as const };
const request = (overrides: object = {}) => ({ profile: "opencode-reviewer", driver: "opencode-headless", contract: "read-only-specialist", task: "Review this", cwd: process.cwd(), timeoutSeconds: 600, maxOutputBytes: 10000, policy, ...overrides });
const output = (overrides: object = {}) => ({ stdout: '{"type":"text","part":{"type":"text","text":"done"}}\n', stderr: "", exitCode: 0, signal: null, durationMs: 9, truncated: false, ...overrides });

test("OpenCode invocation maps single-binary and optional-script argv with optional model", async () => {
  const binaryDriver = new OpencodeDriver("opencode-headless", { kind: "opencode", command: "opencode.exe" });
  const prompt = renderContract("read-only-specialist", "Review this", { target: "OpenCode" });
  const plain = await binaryDriver.buildInvocation(request());
  assert.deepEqual(plain.args, ["run", "--format", "json", "--dir", process.cwd(), prompt]);
  assert.equal(plain.stdin, undefined);

  const fixtureDriver = new OpencodeDriver("opencode-headless", { kind: "opencode", command: "node.exe", script: "cli.mjs" });
  const modeled = await fixtureDriver.buildInvocation(request({ model: "hy3-free" }));
  assert.deepEqual(modeled.args, ["cli.mjs", "run", "-m", "opencode/hy3-free", "--format", "json", "--dir", process.cwd(), prompt]);
});

test("OpenCode environment is exact, deny-by-default, and case-insensitive", () => {
  const env = opencodeEnvironment({ Path: "win", SystemRoot: "root", USERPROFILE: "profile", OPENAI_API_KEY: "secret", OPENCODE_API_KEY: "secret", UNRELATED: "no", NO_COLOR: "0", FORCE_COLOR: "1" });
  assert.deepEqual(env, { Path: "win", SystemRoot: "root", USERPROFILE: "profile", NO_COLOR: "1", FORCE_COLOR: "0" });
});

test("OpenCode parser handles ordered text events, Unicode, ANSI, and metadata", async () => {
  const driver = new OpencodeDriver("opencode-headless", { kind: "opencode", command: "opencode.exe" });
  const stdout = [
    '{"type":"step_start"}',
    '\u001b[32m{"type":"text","part":{"type":"text","text":"Đánh giá "}}\u001b[0m',
    '{"type":"text","part":{"type":"text","text":"tiếng Việt"}}',
    '{"type":"step_finish","reason":"stop"}',
  ].join("\n");
  const success = await driver.parseResult(output({ stdout }), request({ model: "hy3-free" }));
  assert.equal(success.status, "success");
  assert.equal(success.response, "Đánh giá tiếng Việt");
  assert.equal(success.metadata.modelRequested, "hy3-free");
  assert.equal(success.metadata.modelReported, "hy3-free");
  assert.deepEqual(success.metadata.enforcementReported, { filesystem: "read-only-best-effort", network: "unverified", process: "unverified" });
});

test("OpenCode parser fails closed for empty, truncated, and nonzero output", async () => {
  const driver = new OpencodeDriver("opencode-headless", { kind: "opencode", command: "opencode.exe" });
  const empty = await driver.parseResult(output({ stdout: '{"type":"step_start"}\n{"type":"step_finish","reason":"stop"}\n' }), request());
  assert.deepEqual(empty.error && { phase: empty.error.phase, code: empty.error.code, message: empty.error.message }, { phase: "protocol", code: "empty_response", message: "OpenCode returned no text events" });
  const truncated = await driver.parseResult(output({ truncated: true }), request());
  assert.deepEqual(truncated.error && { phase: truncated.error.phase, code: truncated.error.code }, { phase: "process", code: "output_truncated" });
  const nonzero = await driver.parseResult(output({ exitCode: 3, stderr: "\u001b[31mfailed\u001b[0m" }), request());
  assert.deepEqual(nonzero.error && { phase: nonzero.error.phase, code: nonzero.error.code, message: nonzero.error.message }, { phase: "process", code: "exit_nonzero", message: "failed" });
  const fallback = await driver.parseResult(output({ exitCode: 4, stderr: "" }), request());
  assert.equal(fallback.error?.message, "OpenCode exited with code 4");
});

test("OpenCode quota detection takes precedence over truncation and nonzero exit", async () => {
  const driver = new OpencodeDriver("opencode-headless", { kind: "opencode", command: "opencode.exe" });
  const quota = await driver.parseResult(output({ stdout: "", stderr: "\u001b[31mFree usage exceeded. Add credits\u001b[0m", exitCode: 1, truncated: true }), request());
  assert.deepEqual(quota.error && { phase: quota.error.phase, code: quota.error.code, message: quota.error.message }, { phase: "provider", code: "quota_exceeded", message: "Free usage exceeded. Add credits" });
  const stdoutQuota = await driver.parseResult(output({ stdout: "notice: rate limit", stderr: "", exitCode: 1 }), request());
  assert.equal(stdoutQuota.error?.code, "quota_exceeded");
  assert.equal(stdoutQuota.error?.message, "notice: rate limit");
});

test("OpenCode parser does not misclassify model text mentioning quota or rate limit", async () => {
  const driver = new OpencodeDriver("opencode-headless", { kind: "opencode", command: "opencode.exe" });
  const stdout = [
    '{"type":"step_start"}',
    '{"type":"text","part":{"type":"text","text":"Giới hạn quota và rate limit là 200 requests."}}',
    '{"type":"step_finish","reason":"stop"}',
  ].join("\n");
  const result = await driver.parseResult(output({ stdout }), request());
  assert.equal(result.status, "success");
  assert.equal(result.response, "Giới hạn quota và rate limit là 200 requests.");
});

test("OpenCode config rejects model slugs containing a provider prefix (/)", () => {
  const config = { version: 1, drivers: { opencode: { kind: "opencode", command: "opencode.exe" } }, agents: [{ name: "opencode-reviewer", label: "OpenCode", description: "review", driver: "opencode", purposes: [], policy, promptContract: "read-only-specialist", defaults: { model: "opencode/hy3-free" }, enabled: true }] };
  assert.throws(() => validateConfig(config), /model is invalid/);
});

test("OpenCode contract target and config kind/model support are registered", () => {
  assert.match(renderContract("read-only-specialist", "task", { target: "OpenCode" }), /^\[DSH → OpenCode: READ-ONLY SPECIALIST CONTRACT\]/);
  const config = { version: 1, drivers: { opencode: { kind: "opencode", command: "opencode.exe" } }, agents: [{ name: "opencode-reviewer", label: "OpenCode", description: "review", driver: "opencode", purposes: [], policy, promptContract: "read-only-specialist", defaults: { model: "hy3-free" }, enabled: true }] };
  const validated = validateConfig(config);
  assert.equal(validated.drivers.opencode.kind, "opencode");
  assert.equal(validated.agents[0]?.defaults?.model, "hy3-free");
});
