import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";

type JsonRpcId = string | number | null;

interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id?: JsonRpcId;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

interface ToolCallResult {
  readonly content?: readonly { readonly type?: string; readonly text?: string }[];
  readonly isError?: boolean;
}

interface AgentResult {
  readonly status?: string;
  readonly response?: string;
  readonly error?: { readonly phase?: string; readonly code?: string; readonly message?: string };
  readonly metadata?: { readonly cwd?: string };
}

class StdioMcpClient {
  private nextId = 1;
  private readonly pending = new Map<number, {
    readonly resolve: (response: JsonRpcResponse) => void;
    readonly reject: (error: Error) => void;
    readonly timer: NodeJS.Timeout;
  }>();
  private stderr = "";

  public constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { this.stderr += chunk; });

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => {
      let response: JsonRpcResponse;
      try {
        response = JSON.parse(line) as JsonRpcResponse;
      } catch {
        this.rejectAll(new Error(`Gateway wrote invalid JSON-RPC to stdout: ${line}`));
        return;
      }

      if (typeof response.id !== "number") return;
      const request = this.pending.get(response.id);
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(response.id);
      request.resolve(response);
    });

    child.once("exit", (code, signal) => {
      this.rejectAll(new Error(`Gateway exited before replying (code=${String(code)}, signal=${String(signal)}): ${this.stderr}`));
    });
  }

  public request(method: string, params?: unknown): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`Timed out waiting for ${method}; gateway stderr: ${this.stderr}`));
      }, 10_000);
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      this.write({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  public notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) });
  }

  public diagnostics(): string {
    return this.stderr;
  }

  private write(message: object): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}

function successfulResult(response: JsonRpcResponse): unknown {
  assert.equal(response.error, undefined, `Unexpected JSON-RPC error: ${JSON.stringify(response.error)}`);
  assert.ok("result" in response, "JSON-RPC response must include result");
  return response.result;
}

function toolResult(response: JsonRpcResponse): ToolCallResult {
  const result = successfulResult(response);
  assert.ok(typeof result === "object" && result !== null && !Array.isArray(result));
  return result as ToolCallResult;
}

function toolText(response: JsonRpcResponse): AgentResult & { readonly agents?: readonly { readonly name?: string }[] } {
  const result = toolResult(response);
  assert.equal(result.content?.[0]?.type, "text");
  assert.equal(typeof result.content?.[0]?.text, "string");
  return JSON.parse(result.content[0].text) as AgentResult & { readonly agents?: readonly { readonly name?: string }[] };
}

async function stopGateway(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.stdin.end();
  const exited = await new Promise<boolean>((resolvePromise) => {
    const finish = (didExit: boolean): void => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolvePromise(didExit);
    };
    const onExit = (): void => finish(true);
    const timer = setTimeout(() => finish(false), 1_000);
    child.once("exit", onExit);
  });
  if (exited || child.exitCode !== null || child.signalCode !== null) return;
  const killed = new Promise<void>((resolvePromise) => child.once("exit", () => resolvePromise()));
  child.kill();
  await killed;
}

test("DSH-style MCP client completes gateway stdio smoke flow", { timeout: 30_000 }, async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "dsh-agent-gateway-e2e-"));
  const workspace = join(tempRoot, "workspace");
  const configPath = join(tempRoot, "agents.jsonc");
  mkdirSync(workspace);

  const policy = { filesystem: "read-only", network: "deny", credentials: "deny", process: "deny-shell" };
  const config = {
    version: 1,
    defaults: { timeoutSeconds: 5, maxOutputBytes: 2_097_152, maxConcurrency: 2 },
    drivers: {
      fake: { kind: "fake", command: process.execPath, script: resolve("tests/fixtures/fake-cli/cli.mjs") },
      agy: { kind: "agy", command: process.execPath, script: resolve("tests/fixtures/fake-agy/cli.mjs") },
      codex: { kind: "codex", command: process.execPath, script: resolve("tests/fixtures/fake-codex/cli.mjs") },
      opencode: { kind: "opencode", command: process.execPath, script: resolve("tests/fixtures/fake-opencode/cli.mjs") },
    },
    agents: [
      { name: "fake-agent", label: "Fake Agent", description: "E2E fake fixture", driver: "fake", purposes: ["review"], policy, promptContract: "read-only-specialist", enabled: true },
      { name: "agy-reviewer", label: "AGY Reviewer", description: "E2E AGY fixture", driver: "agy", purposes: ["review"], policy, promptContract: "read-only-specialist", enabled: true },
      { name: "codex-reviewer", label: "Codex Reviewer", description: "E2E Codex fixture", driver: "codex", purposes: ["review"], policy, promptContract: "read-only-specialist", enabled: true },
      { name: "opencode-reviewer", label: "OpenCode Reviewer", description: "E2E OpenCode fixture", driver: "opencode", purposes: ["review"], policy, promptContract: "read-only-specialist", enabled: true },
    ],
  };
  writeFileSync(configPath, `// E2E-only gateway configuration\n${JSON.stringify(config, null, 2)}\n`, "utf8");

  const beforeFiles = readdirSync(workspace).sort();
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, DSH_AGENT_GATEWAY_CONFIG: configPath },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = new StdioMcpClient(child);

  try {
    const initialize = successfulResult(await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "dsh-e2e", version: "0.1.0" },
    })) as { readonly protocolVersion?: string; readonly capabilities?: { readonly tools?: unknown } };
    assert.equal(typeof initialize.protocolVersion, "string");
    assert.ok(initialize.capabilities?.tools !== undefined);
    client.notify("notifications/initialized");

    const listedTools = successfulResult(await client.request("tools/list")) as {
      readonly tools?: readonly { readonly name?: string; readonly inputSchema?: { readonly required?: readonly string[] } }[];
    };
    assert.ok(Array.isArray(listedTools.tools));
    const toolNames = new Set(listedTools.tools.map((tool) => tool.name));
    assert.ok(toolNames.has("list_agents"));
    assert.ok(toolNames.has("get_agent_status"));
    assert.ok(toolNames.has("call_agent"));
    const agentStatusTool = listedTools.tools.find((tool) => tool.name === "get_agent_status");
    assert.deepEqual(agentStatusTool?.inputSchema?.required, ["agent"]);
    const callAgentTool = listedTools.tools.find((tool) => tool.name === "call_agent");
    assert.deepEqual([...(callAgentTool?.inputSchema?.required ?? [])].sort(), ["agent", "cwd", "task"]);

    const agents = toolText(await client.request("tools/call", { name: "list_agents", arguments: {} })).agents;
    assert.equal(agents?.length, 4);
    assert.deepEqual(agents?.map((agent) => agent.name).sort(), ["agy-reviewer", "codex-reviewer", "fake-agent", "opencode-reviewer"]);

    const fakeStatus = toolText(await client.request("tools/call", {
      name: "get_agent_status",
      arguments: { agent: "fake-agent" },
    }));
    assert.equal(fakeStatus.status, "ready");

    const missingStatusResponse = await client.request("tools/call", {
      name: "get_agent_status",
      arguments: { agent: "missing-agent" },
    });
    assert.ok(missingStatusResponse.error, "get_agent_status with an unknown agent should return a JSON-RPC error");
    assert.match(missingStatusResponse.error.message, /not found/i);

    const fakeTask = "Đánh giá tiếng Việt & ký tự đặc biệt";
    const fakeResponse = await client.request("tools/call", {
      name: "call_agent",
      arguments: { agent: "fake-agent", task: fakeTask, cwd: workspace },
    });
    const fakeResult = toolText(fakeResponse);
    assert.equal(toolResult(fakeResponse).isError, false);
    assert.equal(fakeResult.status, "success");
    assert.equal(fakeResult.response, `echo: ${fakeTask}`);

    const agyTask = "Review gateway contract";
    const agyResponse = await client.request("tools/call", {
      name: "call_agent",
      arguments: { agent: "agy-reviewer", task: agyTask, cwd: workspace },
    });
    const agyResult = toolText(agyResponse);
    assert.equal(toolResult(agyResponse).isError, false);
    assert.equal(agyResult.status, "success");
    assert.equal(agyResult.response, `echo: ${agyTask}`);
    assert.equal(agyResult.metadata?.cwd, realpathSync(workspace));

    const codexTask = "Review Codex stdin contract";
    const codexResponse = await client.request("tools/call", {
      name: "call_agent",
      arguments: { agent: "codex-reviewer", task: codexTask, cwd: workspace },
    });
    const codexResult = toolText(codexResponse);
    assert.equal(toolResult(codexResponse).isError, false);
    assert.equal(codexResult.status, "success");
    assert.equal(codexResult.response, `echo: ${codexTask}`);
    assert.equal(codexResult.metadata?.cwd, realpathSync(workspace));

    const opencodeTask = "Review OpenCode argv contract";
    const opencodeResponse = await client.request("tools/call", {
      name: "call_agent",
      arguments: { agent: "opencode-reviewer", task: opencodeTask, cwd: workspace },
    });
    const opencodeResult = toolText(opencodeResponse);
    assert.equal(toolResult(opencodeResponse).isError, false);
    assert.equal(opencodeResult.status, "success");
    assert.equal(opencodeResult.response, `echo: ${opencodeTask}`);
    assert.equal(opencodeResult.metadata?.cwd, realpathSync(workspace));

    const deniedResponse = await client.request("tools/call", {
      name: "call_agent",
      arguments: { agent: "agy-reviewer", task: "PERMISSION_DENIED", cwd: workspace },
    });
    const deniedResult = toolText(deniedResponse);
    assert.equal(toolResult(deniedResponse).isError, true);
    assert.equal(deniedResult.status, "error");
    assert.equal(deniedResult.error?.phase, "permission");
    assert.equal(deniedResult.error?.code, "permission_denied");

    const missingResponse = await client.request("tools/call", {
      name: "call_agent",
      arguments: { agent: "missing-agent", task: "review", cwd: workspace },
    });
    if (missingResponse.error) {
      assert.match(missingResponse.error.message, /not found/i);
    } else {
      const missingResult = toolText(missingResponse);
      assert.equal(toolResult(missingResponse).isError, true);
      assert.equal(missingResult.status, "error");
      assert.ok(missingResult.error?.phase === "validation" || /not found/i.test(missingResult.error?.message ?? ""));
    }

    assert.deepEqual(readdirSync(workspace).sort(), beforeFiles);
    assert.equal(client.diagnostics(), "");
  } finally {
    await stopGateway(child);
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
