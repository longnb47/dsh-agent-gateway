import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { resolveExecutable } from "../../src/process/executable.js";

function fixtureName(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

test("resolveExecutable finds a bare name in PATH as an absolute file", () => {
  const directory = mkdtempSync(join(tmpdir(), "gateway-executable-path-"));
  try {
    const candidate = join(directory, fixtureName("fixture-command"));
    writeFileSync(candidate, "fixture");
    assert.equal(resolveExecutable("fixture-command", { PATH: directory }), resolve(candidate));
    assert.equal(isAbsolute(resolveExecutable("fixture-command", { PATH: directory })), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("resolveExecutable fails closed for missing, non-file, and relative inputs", () => {
  const directory = mkdtempSync(join(tmpdir(), "gateway-executable-abs-"));
  try {
    const existing = join(directory, fixtureName("absolute-command"));
    writeFileSync(existing, "fixture");

    // Absolute path to an existing file → returned as-is.
    assert.equal(resolveExecutable(existing, { PATH: "" }), existing);
    // Absolute path to a missing file → throws.
    assert.throws(() => resolveExecutable(join(directory, "nope.exe"), { PATH: "" }), /not found/);
    // Missing bare name → throws (never falls back to the bare name).
    assert.throws(() => resolveExecutable("missing-command", { PATH: "" }), /not found/);
    // Relative path → rejected.
    assert.throws(() => resolveExecutable(join("relative", "command"), { PATH: "" }), /not allowed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("resolveExecutable does not search the current working directory", () => {
  const originalCwd = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "gateway-executable-cwd-"));
  const emptyPath = mkdtempSync(join(tmpdir(), "gateway-executable-empty-path-"));
  try {
    writeFileSync(join(directory, fixtureName("cwd-only-command")), "fixture");
    process.chdir(directory);
    assert.throws(() => resolveExecutable("cwd-only-command", { PATH: [".", emptyPath].join(delimiter) }), /not found/);
  } finally {
    process.chdir(originalCwd);
    rmSync(directory, { recursive: true, force: true });
    rmSync(emptyPath, { recursive: true, force: true });
  }
});

test("resolveExecutable reads PATH case-insensitively", () => {
  const directory = mkdtempSync(join(tmpdir(), "gateway-executable-case-"));
  try {
    const candidate = join(directory, fixtureName("case-command"));
    writeFileSync(candidate, "fixture");
    // Windows env keys are often enumerated as `Path` (mixed case).
    assert.equal(resolveExecutable("case-command", { Path: directory }), resolve(candidate));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
