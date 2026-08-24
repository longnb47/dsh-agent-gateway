import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../../src/config/validator.js";
import { renderContract } from "../../src/contracts/builtins.js";
import { CodexDriver } from "../../src/drivers/codex/driver.js";
import { codexEnvironment } from "../../src/drivers/codex/invocation.js";
import { GatewayError } from "../../src/mcp/errors.js";

const policy = { filesystem: "read-only" as const, network: "deny" as const, credentials: "deny" as const, process: "deny-shell" as const };
const request = (overrides: object = {}) => ({ profile: "codex-reviewer", driver: "codex-headless", contract: "read-only-specialist", task: "Review this", cwd: process.cwd(), timeoutSeconds: 600, maxOutputBytes: 10000, policy, ...overrides });
const output = (overrides: object = {}) => ({ stdout: "done", stderr: "OpenAI Codex v0.149.0\nmodel: fake-codex\nsandbox: read-only", exitCode: 0, signal: null, durationMs: 9, truncated: false, ...overrides });

test("Codex invocation maps argv, stdin contract, and optional model", async () => {
  const driver = new CodexDriver("codex-headless", { kind: "codex", command: "node.exe", script: "codex.js" });
  const spec = await driver.buildInvocation(request());
  assert.deepEqual(spec.args, ["codex.js", "exec", "-s", "read-only", "-C", process.cwd(), "--ephemeral", "--skip-git-repo-check", "-"]);
  assert.equal(spec.stdin, renderContract("read-only-specialist", "Review this", { target: "Codex" }));
  const modeled = await driver.buildInvocation(request({ model: "gpt-test" }));
  assert.deepEqual(modeled.args, ["codex.js", "exec", "-s", "read-only", "-C", process.cwd(), "--ephemeral", "--skip-git-repo-check", "-m", "gpt-test", "-"]);
});

test("Codex invocation requires the codex.js script", async () => {
  const driver = new CodexDriver("codex-headless", { kind: "codex", command: "node.exe" });
  await assert.rejects(driver.buildInvocation(request()), (error: unknown) => error instanceof GatewayError && error.phase === "config" && error.code === "missing_script");
});

test("Codex environment is exact, deny-by-default, and case-insensitive", () => {
  const env = codexEnvironment({ Path: "win", SystemRoot: "root", openai_api_key: "key", OpenAI_Base_URL: "https://example.test", OPENAI_CONFIG_FILE: "secret.toml", CODEX_HOME: "private", UNRELATED: "no", NO_COLOR: "0" });
  assert.deepEqual(env, { Path: "win", SystemRoot: "root", openai_api_key: "key", OpenAI_Base_URL: "https://example.test", NO_COLOR: "1", FORCE_COLOR: "0" });
});

test("Codex parser handles success, Unicode, ANSI, model reporting, and failures", async () => {
  const driver = new CodexDriver("codex-headless", { kind: "codex", command: "node.exe", script: "codex.js" });
  const success = await driver.parseResult(output({ stdout: " \u001b[32mĐánh giá tiếng Việt\u001b[0m \n" }), request());
  assert.equal(success.status, "success");
  assert.equal(success.response, "Đánh giá tiếng Việt");
  assert.equal(success.metadata.modelReported, "fake-codex");
  assert.deepEqual(success.metadata.enforcementReported, { sandbox: true, mode: "read-only", filesystem: "read-only", network: "unverified", process: "sandboxed" });

  const fallback = await driver.parseResult(output({ stderr: "no header" }), request({ model: "requested-model" }));
  assert.equal(fallback.metadata.modelReported, "requested-model");
  const absent = await driver.parseResult(output({ stderr: "no header" }), request());
  assert.equal(absent.metadata.modelReported, undefined);

  const empty = await driver.parseResult(output({ stdout: " \u001b[0m " }), request());
  assert.deepEqual(empty.error && { phase: empty.error.phase, code: empty.error.code }, { phase: "protocol", code: "empty_response" });
  const nonzero = await driver.parseResult(output({ exitCode: 3, stderr: "\u001b[31mfailed\u001b[0m" }), request());
  assert.deepEqual(nonzero.error && { phase: nonzero.error.phase, code: nonzero.error.code, message: nonzero.error.message }, { phase: "process", code: "exit_nonzero", message: "failed" });
  const fallbackError = await driver.parseResult(output({ exitCode: 4, stderr: "" }), request());
  assert.equal(fallbackError.error?.message, "Codex exited with code 4");
});

test("Codex contract target and config kind are registered without changing the AGY default", () => {
  assert.match(renderContract("read-only-specialist", "task", { target: "Codex" }), /^\[DSH → Codex: READ-ONLY SPECIALIST CONTRACT\]/);
  assert.match(renderContract("read-only-specialist", "task"), /^\[DSH → AGY: READ-ONLY SPECIALIST CONTRACT\]/);
  const config = { version: 1, drivers: { codex: { kind: "codex", command: "node.exe", script: "codex.js" } }, agents: [{ name: "codex-reviewer", label: "Codex", description: "review", driver: "codex", purposes: [], policy, promptContract: "read-only-specialist", enabled: true }] };
  assert.equal(validateConfig(config).drivers.codex.kind, "codex");
});
