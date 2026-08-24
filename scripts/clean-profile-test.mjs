#!/usr/bin/env node
/**
 * Clean-profile integration test for the dsh-agent-gateway bundle.
 *
 * Requires (on PATH): `dsh` (DSH 0.1.1-rc.2), `pnpm`, and Node >= 22.
 * Runs the same release-gate steps the plan's Phase 0/3/5 require, against an
 * isolated DSH_HOME in the OS temp dir whose path contains a space:
 *
 *   1. pack the repo into a tarball (prepack builds + typechecks + tests),
 *   2. `dsh plugin add <tarball>` into a clean profile,
 *   3. `dsh --dump-config` -> exactly one dsh-agent-gateway row, !!js kept verbatim,
 *      no workspace literal path,
 *   4. evaluate the !!js entry expression -> resolves into the profile's
 *      node_modules (installed package), not the workspace,
 *   5. MCP handshake against the installed entry with a fake-driver config ->
 *      list_agents / get_agent_status / call_agent all work,
 *   6. boot the profile with missing config -> DSH survives all four failed
 *      gateway starts and no gateway child remains connected,
 *   7. boot the profile with fake config -> no startup / connection failure,
 *      and the installed gateway child remains connected,
 *   8. `dsh plugin remove <pkg>` -> row disappears, user config preserved.
 *
 * Exit code 0 = all steps passed; non-zero = at least one failed.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_NAME = "@longnb47/dsh-agent-gateway";
const PROFILE = "spike";
const EXPR = "process.getBuiltinModule('node:module').createRequire(new URL('package.json', ctx.baseUrl)).resolve('@longnb47/dsh-agent-gateway')";

let failures = 0;
function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Resolve a pnpm-style Windows .cmd shim to { node, script } (its node.exe + mjs/js entry). */
function resolveNodeShim(name) {
  const where = spawnSync("where.exe", [name], { encoding: "utf8" });
  const lines = (where.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    if (!line.toLowerCase().endsWith(".cmd")) continue;
    const basedir = dirname(line);
    const content = readFileSync(line, "utf8");
    const m = /node_modules\\([^\r\n"]+\.(?:mjs|js))"/.exec(content);
    if (m) {
      const node = join(basedir, "node.exe");
      return { node: existsSync(node) ? node : "node", script: join(basedir, "node_modules", m[1]) };
    }
  }
  // Non-Windows or unusual layout: invoke the bare command.
  return { node: name, script: null };
}

function run(cmd, args, env = {}, opts = {}) {
  const { node, script } = cmd;
  const fullArgs = script ? [script, ...args] : args;
  return spawnSync(node, fullArgs, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
}

/** Evaluate the bundle's !!js entry expression the same way the DSH loader does. */
function resolveEntry(profileDir) {
  const baseUrl = pathToFileURL(profileDir).href + "/";
  const evaluate = new Function("ctx", "expr", "with (ctx) { return eval(expr) }");
  return evaluate({ baseUrl }, EXPR);
}

/** Count live Windows node.exe processes whose command line contains `entryPath`. */
function countGatewayChildren(entryPath) {
  if (process.platform !== "win32") return 0;
  try {
    // `entryPath` is a Windows path with no `*`, `?`, `[`, `]`, or `'`, so it is safe
    // to embed literally in a `-like` wildcard pattern. `@(...)` forces an array so
    // `.Count` is 0 when no process matches (instead of $null for a scalar result).
    const script = `@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*${entryPath}*' }).Count`;
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
    if (result.status !== 0) return 0;
    const count = Number.parseInt((result.stdout || "").trim(), 10);
    return Number.isInteger(count) && count >= 0 ? count : 0;
  } catch {
    return 0;
  }
}

/** Minimal MCP stdio client handshake: initialize, tools/list, then a few tools/call. */
async function mcpProbe(entry, configPath, cwd) {
  const child = spawn(process.execPath, [entry], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, DSH_AGENT_GATEWAY_CONFIG: configPath },
  });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let nextId = 1;
  const pending = new Map();
  const request = (method, params) => {
    const id = nextId++;
    return new Promise((resolveP, reject) => {
      pending.set(id, { resolveP, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  };
  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof msg.id === "number" && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolveP(msg.result);
    }
  });
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });
  const text = (r) =>
    Array.isArray(r?.content) ? r.content.map((b) => (b.type === "text" ? b.text : JSON.stringify(b))).join("\n") : JSON.stringify(r);

  try {
    await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "0.0.0" } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const tools = await request("tools/list", {});
    const names = tools.tools.map((t) => t.name).sort();
    const list = await request("tools/call", { name: "list_agents", arguments: {} });
    const status = await request("tools/call", { name: "get_agent_status", arguments: { agent: "fake-agent" } });
    const call = await request("tools/call", { name: "call_agent", arguments: { agent: "fake-agent", task: "hello smoke", cwd } });
    return { names, list: text(list), status: text(status), call: text(call), stderr };
  } finally {
    child.stdin.end();
    await new Promise((r) => setTimeout(r, 200));
    if (child.exitCode === null) child.kill();
  }
}

/** Boot the profile for `ms`, snapshot state, then kill the process tree. */
function bootFor(dsh, spikeHome, overlay, ms, beforeTeardown = () => {}) {
  const child = spawn(dsh.node, dsh.script ? [dsh.script, "--profile", PROFILE, "--patch", overlay] : ["--profile", PROFILE, "--patch", overlay], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DSH_HOME: spikeHome },
  });
  let out = "";
  child.stdout.on("data", (d) => {
    out += d.toString();
  });
  child.stderr.on("data", (d) => {
    out += d.toString();
  });
  return new Promise((resolveP) => {
    setTimeout(() => {
      const alive = child.exitCode === null;
      beforeTeardown();
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else child.kill();
      resolveP({ out, alive });
    }, ms);
  });
}

async function main() {
  const dsh = resolveNodeShim("dsh");
  const pnpm = resolveNodeShim("pnpm");
  const tmp = join(tmpdir(), `dsh-ag-cleanprofile-${randomUUID()}`);
  const spikeHome = join(tmp, "DSH Home Test");
  const packDir = join(tmp, "pack");
  const profileDir = join(spikeHome, "profiles", PROFILE);
  mkdirSync(packDir, { recursive: true });

  console.log(`tmp        = ${tmp}`);
  console.log(`dsh node   = ${dsh.node}`);
  console.log(`dsh script = ${dsh.script}`);

  // 1. Pack (prepack builds + typechecks + tests).
  const packed = run(pnpm, ["pack", "--pack-destination", packDir], {}, { cwd: ROOT });
  const tgz = (() => {
    try {
      return readdirSync(packDir).find((f) => f.endsWith(".tgz"));
    } catch {
      return undefined;
    }
  })();
  check("pnpm pack produced a tarball", packed.status === 0 && tgz !== undefined, packed.stderr?.trim().split("\n").slice(-2).join(" "));
  const tgzPath = tgz ? join(packDir, tgz) : undefined;

  // 2. Install into a clean profile.
  const added = run(dsh, ["plugin", "--profile", PROFILE, "add", tgzPath], { DSH_HOME: spikeHome });
  check("dsh plugin add succeeds", added.status === 0, added.stderr?.trim().split("\n").slice(-2).join(" "));

  // 3. dump-config.
  const dump = run(dsh, ["--profile", PROFILE, "--dump-config"], { DSH_HOME: spikeHome });
  const dumpOut = `${dump.stdout}\n${dump.stderr}`;
  check("dump-config exits 0", dump.status === 0);
  const rowCount = (dumpOut.match(/id:\s*dsh-agent-gateway/g) || []).length;
  check("exactly one dsh-agent-gateway row", rowCount === 1, `found ${rowCount}`);
  check("row name is the MCP client", /name:\s*'?@deepseek-ai\/dsh-mcp-client'?/.test(dumpOut));
  check("!!js entry expression kept verbatim", /createRequire\(new\s+URL\('package.json',\s*ctx\.baseUrl\)\)\.resolve\('@longnb47\/dsh-agent-gateway'\)/.test(dumpOut.replace(/\s+/g, " ")));
  check("no workspace literal path in dump", !/D:\/dsh-plugin|D:\\dsh-plugin/.test(dumpOut));

  // 4. Entry expression resolves to the installed package.
  const resolved = resolveEntry(profileDir);
  check("entry resolves into the profile (not workspace)", existsSync(resolved) && !/dsh-plugin[\\/]dsh-agent-gateway/.test(resolved), resolved);
  check("entry is the package dist/index.js", resolved.endsWith(join("dist", "index.js")), resolved);

  // 5. MCP handshake against the installed entry (fake config).
  const configPath = join(spikeHome, "agent-gateway", "agents.jsonc");
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify({
      version: 1,
      defaults: { timeoutSeconds: 600, maxOutputBytes: 2097152, maxConcurrency: 2 },
      drivers: { fake: { kind: "fake", command: "node", script: "examples/fake-cli/cli.mjs" } },
      agents: [{ name: "fake-agent", label: "Fake Agent", description: "Fake read-only agent for smoke tests", driver: "fake", purposes: ["review", "second-opinion"], policy: { filesystem: "read-only", network: "deny", credentials: "deny", process: "deny-shell" }, promptContract: "read-only-specialist", defaults: { timeoutSeconds: 60 }, enabled: true }],
    }),
  );
  const probe = await mcpProbe(resolved, configPath, ROOT);
  check("tools discovered", JSON.stringify(probe.names) === JSON.stringify(["call_agent", "get_agent_status", "list_agents"]), JSON.stringify(probe.names));
  check("list_agents returns fake-agent", /"name":"fake-agent"/.test(probe.list), probe.list);
  check("get_agent_status is ready", /"status":"ready"/.test(probe.status), probe.status);
  check("call_agent succeeds via fake driver", /"status":"success"/.test(probe.call) && /echo: hello smoke/.test(probe.call), probe.call);

  // 6. Boot with a missing-config overlay: DSH stays alive through all retries.
  const missingConfigPath = join(spikeHome, "agent-gateway", "agents-missing.jsonc");
  const missingOverlay = join(tmp, "overlay-missing.yml");
  writeFileSync(
    missingOverlay,
    [
      "- id: dsh-agent-gateway",
      '  name: "@deepseek-ai/dsh-mcp-client"',
      "  config:",
      "    serverName: agent-gateway",
      "    transport: stdio",
      "    command: !!js process.execPath",
      "    args:",
      `      - !!js "process.getBuiltinModule('node:module').createRequire(new URL('package.json', ctx.baseUrl)).resolve('@longnb47/dsh-agent-gateway')"`,
      "    toolCallTimeoutMs: 660000",
      "    failOnStartupError: false",
      "    reconnect:",
      "      maxAttempts: 3",
      "    env:",
      `      DSH_AGENT_GATEWAY_CONFIG: "${missingConfigPath.replace(/\\/g, "/")}"`,
    ].join("\n") + "\n",
  );
  let missingGatewayChildren = 0;
  const missingBoot = await bootFor(dsh, spikeHome, missingOverlay, 8000, () => {
    missingGatewayChildren = countGatewayChildren(resolved);
  });
  const startupFailureCount = (missingBoot.out.match(/startup failed/g) || []).length;
  check("missing config: DSH remains alive", missingBoot.alive, missingBoot.out.split("\n").slice(-2).join(" "));
  check("missing config: exactly four gateway startup failures", startupFailureCount === 4, `found ${startupFailureCount}`);
  check("missing config: no gateway child remains connected", missingGatewayChildren === 0, `found ${missingGatewayChildren}`);

  // 7. Boot with a fake-config overlay: the installed gateway stays connected.
  const overlay = join(tmp, "overlay.yml");
  writeFileSync(
    overlay,
    [
      "- id: dsh-agent-gateway",
      '  name: "@deepseek-ai/dsh-mcp-client"',
      "  config:",
      "    serverName: agent-gateway",
      "    transport: stdio",
      "    command: !!js process.execPath",
      "    args:",
      `      - !!js "process.getBuiltinModule('node:module').createRequire(new URL('package.json', ctx.baseUrl)).resolve('@longnb47/dsh-agent-gateway')"`,
      "    toolCallTimeoutMs: 660000",
      "    failOnStartupError: false",
      "    reconnect:",
      "      maxAttempts: 3",
      "    env:",
      `      DSH_AGENT_GATEWAY_CONFIG: "${configPath.replace(/\\/g, "/")}"`,
    ].join("\n") + "\n",
  );
  let fakeGatewayChildren = 0;
  const fakeBoot = await bootFor(dsh, spikeHome, overlay, 8000, () => {
    fakeGatewayChildren = countGatewayChildren(resolved);
  });
  check("boot: no gateway startup failure", !/startup failed/.test(fakeBoot.out), fakeBoot.out.split("\n").slice(-2).join(" "));
  check("boot: no MCP connection failure", !/connection attempt failed/.test(fakeBoot.out), fakeBoot.out.split("\n").slice(-2).join(" "));
  check("boot: DSH remains alive", fakeBoot.alive, fakeBoot.out.split("\n").slice(-2).join(" "));
  check("boot: installed gateway child is connected", fakeGatewayChildren >= 1, `found ${fakeGatewayChildren}`);

  // 8. Uninstall.
  const removed = run(dsh, ["plugin", "--profile", PROFILE, "remove", PACKAGE_NAME], { DSH_HOME: spikeHome });
  check("dsh plugin remove succeeds", removed.status === 0, removed.stderr?.trim().split("\n").slice(-2).join(" "));
  const dumpAfter = run(dsh, ["--profile", PROFILE, "--dump-config"], { DSH_HOME: spikeHome });
  check("row removed after uninstall", !/dsh-agent-gateway|dsh-mcp-client|agent-gateway/.test(`${dumpAfter.stdout}\n${dumpAfter.stderr}`));
  check("user config preserved after uninstall", existsSync(configPath));

  // Cleanup.
  rmSync(tmp, { recursive: true, force: true });

  console.log(failures === 0 ? "\nALL CLEAN-PROFILE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("clean-profile-test aborted:", error);
  process.exitCode = 1;
});
