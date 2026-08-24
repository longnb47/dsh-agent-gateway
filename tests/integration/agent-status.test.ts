import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolService } from "../../src/mcp/tools.js";

const policy = { filesystem: "read-only" as const, network: "deny" as const, credentials: "deny" as const, process: "deny-shell" as const };

test("ToolService reports agent health, versions, metadata, and disabled state", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "gateway-agent-status-"));
  const script = join(tempRoot, "version.mjs");
  writeFileSync(script, 'process.stdout.write("v1.2.3\\n");\n', "utf8");
  const config = {
    version: 1 as const,
    defaults: {},
    drivers: {
      codex: { kind: "codex", command: process.execPath, script },
      fake: { kind: "fake", command: process.execPath },
    },
    agents: [
      { name: "codex-disabled", label: "Codex", description: "fixture", driver: "codex", purposes: ["review"], policy, promptContract: "read-only-specialist", enabled: false },
      { name: "fake-agent", label: "Fake", description: "fixture", driver: "fake", purposes: ["review"], policy, promptContract: "read-only-specialist", enabled: true },
    ],
  };

  try {
    const service = new ToolService(config, new DriverRegistry(config));
    const codex = await service.agentStatus({ agent: "codex-disabled" });
    assert.equal(codex.status, "ready");
    assert.equal(codex.version, "v1.2.3");
    assert.equal(codex.enabled, false);
    assert.equal(codex.kind, "codex");

    const fake = await service.agentStatus({ agent: "fake-agent" });
    assert.equal(fake.status, "ready");
    assert.equal(fake.version, null);
    assert.equal(fake.enabled, true);

    const listed = service.listAgents() as { readonly agents: readonly Record<string, unknown>[] };
    assert.equal(listed.agents.length, 1);
    assert.deepEqual(listed.agents[0], {
      name: "fake-agent",
      label: "Fake",
      description: "fixture",
      purposes: ["review"],
      policy,
      driver: "fake",
      kind: "fake",
      enabled: true,
      costTier: "n/a",
      constraints: [],
      enforcementSummary: { filesystem: "none", network: "none", process: "argv-only" },
    });

    await assert.rejects(service.agentStatus({ agent: "missing" }), /Agent not found/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
