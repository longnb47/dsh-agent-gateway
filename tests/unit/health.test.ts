import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { authState, healthEnvironment, runAgentHealth, versionArgs } from "../../src/drivers/health.js";

test("healthEnvironment forwards only system variables case-insensitively", () => {
  assert.deepEqual(
    healthEnvironment({
      Path: "bin",
      SYSTEMROOT: "root",
      userProfile: "profile",
      HOME: "home",
      OPENAI_API_KEY: "secret",
      DSH_STATUS_COMMAND: "private",
      EMPTY_ALLOWED: undefined,
    }),
    { Path: "bin", SYSTEMROOT: "root", userProfile: "profile", HOME: "home" },
  );
});

test("authState detects supported auth locations without reading credentials", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "gateway-health-auth-"));
  try {
    assert.equal(authState("agy", {}, homeDir), "unknown");
    assert.equal(authState("codex", {}, homeDir), "unknown");
    assert.equal(authState("opencode", {}, homeDir), "unknown");
    assert.equal(authState("fake", {}, homeDir), "unknown");

    mkdirSync(join(homeDir, ".gemini"));
    mkdirSync(join(homeDir, ".codex"));
    writeFileSync(join(homeDir, ".codex", "config.toml"), "fixture");
    mkdirSync(join(homeDir, ".local", "share", "opencode"), { recursive: true });
    writeFileSync(join(homeDir, ".local", "share", "opencode", "auth.json"), "fixture");

    assert.equal(authState("agy", {}, homeDir), "ready");
    assert.equal(authState("codex", {}, homeDir), "ready");
    assert.equal(authState("codex", { openai_api_key: "fixture" }, join(homeDir, "missing")), "ready");
    assert.equal(authState("opencode", {}, homeDir), "ready");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("versionArgs maps each driver kind without invoking it", () => {
  assert.deepEqual(versionArgs("agy", { kind: "agy", command: "agy" }), ["--version"]);
  assert.deepEqual(versionArgs("agy", { kind: "agy", command: "node", script: "agy.js" }), ["agy.js", "--version"]);
  assert.deepEqual(versionArgs("opencode", { kind: "opencode", command: "opencode" }), ["--version"]);
  assert.deepEqual(versionArgs("opencode", { kind: "opencode", command: "node", script: "oc.js" }), ["oc.js", "--version"]);
  assert.deepEqual(versionArgs("codex", { kind: "codex", command: "codex" }), ["--version"]);
  assert.deepEqual(versionArgs("codex", { kind: "codex", command: "node", script: "codex.js" }), ["codex.js", "--version"]);
  assert.deepEqual(versionArgs("fake", { kind: "fake", command: "fake" }), []);
  assert.deepEqual(versionArgs("unknown", { kind: "unknown", command: "unknown" }), []);
});

test("runAgentHealth resolves fake executables without a version probe", async () => {
  const result = await runAgentHealth("fake", { kind: "fake", command: process.execPath }, {
    agent: "fake-agent",
    driver: "fake-driver",
    enabled: false,
    env: {},
  });
  assert.deepEqual(result, {
    agent: "fake-agent",
    driver: "fake-driver",
    kind: "fake",
    enabled: false,
    status: "ready",
    executable: process.execPath,
    version: null,
    auth: "unknown",
  });

  const missing = await runAgentHealth("fake", { kind: "fake", command: join(tmpdir(), "missing-health-command") }, { env: {} });
  assert.equal(missing.status, "not-ready");
  assert.equal(missing.executable, null);
  assert.match(missing.detail ?? "", /not found/i);
});

test("runAgentHealth reports not-ready when the version probe exits nonzero", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "gateway-health-nonzero-"));
  const script = join(tempRoot, "broken.mjs");
  writeFileSync(script, "process.exitCode = 1;\n", "utf8");
  try {
    const result = await runAgentHealth("codex", { kind: "codex", command: process.execPath, script }, { env: {} });
    assert.equal(result.status, "not-ready");
    assert.equal(result.version, null);
    assert.match(result.detail ?? "", /exit 1/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
