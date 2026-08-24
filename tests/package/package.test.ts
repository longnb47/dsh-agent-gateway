import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Static packaging checks: the artifact manifest (package.json), the bundle
// patch (cordis.patch.yml), and the shipped example files. The dynamic
// clean-profile install/boot path is exercised by scripts/clean-profile-test.mjs.

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("package.json declares the DSH bundle patch", () => {
  assert.equal(pkg.dsh?.bundle?.patch, "./cordis.patch.yml");
});

test("package.json keeps the MCP stdio entry as main", () => {
  assert.equal(pkg.main, "dist/index.js");
});

test("package.json is ESM and ISC-licensed", () => {
  assert.equal(pkg.type, "module");
  assert.equal(pkg.license, "ISC");
});

test("package.json declares the public name and a Node engine floor", () => {
  assert.equal(pkg.name, "@longnb47/dsh-agent-gateway");
  assert.match(pkg.engines?.node ?? "", /^>=/);
});

test("package.json files allowlist ships runtime + public docs, not sources or dev notes", () => {
  const files: string[] = pkg.files ?? [];
  for (const required of [
    "dist",
    "cordis.patch.yml",
    "examples",
    "agents.schema.json",
    "docs/dsh-integration.md",
    "docs/config.md",
    "docs/troubleshooting.md",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "SECURITY.md",
  ]) {
    assert.ok(files.includes(required), `files must include ${required}`);
  }
  for (const forbidden of ["src", "tests", "scripts", "node_modules", ".git", "docs"]) {
    assert.ok(!files.includes(forbidden), `files must not include ${forbidden}`);
  }
});

test("prepack builds and verifies before packing", () => {
  const prepack: string = pkg.scripts?.prepack ?? "";
  assert.match(prepack, /build/);
  assert.match(prepack, /typecheck/);
  assert.match(prepack, /test/);
});

test("built MCP entry and bundle patch exist", () => {
  assert.ok(existsSync(join(root, "dist", "index.js")), "dist/index.js must exist (run pnpm build)");
  assert.ok(existsSync(join(root, "cordis.patch.yml")), "cordis.patch.yml must exist");
});

test("shipped fake CLI exists", () => {
  assert.ok(existsSync(join(root, "examples", "fake-cli", "cli.mjs")), "examples/fake-cli/cli.mjs must exist");
});

test("cordis.patch.yml declares the MCP client row with portable resolution", () => {
  const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
  assert.match(patch, /id:\s*dsh-agent-gateway/);
  assert.match(patch, /name:\s*"@deepseek-ai\/dsh-mcp-client"/);
  assert.match(patch, /serverName:\s*agent-gateway/);
  assert.match(patch, /transport:\s*stdio/);
  assert.match(patch, /command:\s*!!js process\.execPath/);
  assert.match(patch, /createRequire\(new URL\('package.json', ctx\.baseUrl\)\)\.resolve\('@longnb47\/dsh-agent-gateway'\)/);
  assert.match(patch, /failOnStartupError:\s*false/);
  assert.match(patch, /maxAttempts:\s*3/);
});

test("bundle patch contains no developer workspace path", () => {
  const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
  assert.doesNotMatch(patch, /dsh-plugin[\\/]dsh-agent-gateway/);
  assert.doesNotMatch(patch, /C:\\Users\\/);
});

test("shipped examples contain no developer machine paths", () => {
  const examples = [
    "examples/agents.example.jsonc",
    "examples/agents.agy.example.jsonc",
    "examples/agents.codex.example.jsonc",
    "examples/agents.opencode.example.jsonc",
  ];
  for (const file of examples) {
    const content = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(content, /C:\\Users\\|D:\\dsh-plugin|C:\\nvm4w/, `${file} must not leak machine paths`);
  }
});
