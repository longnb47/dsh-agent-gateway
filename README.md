# dsh-agent-gateway

An MCP stdio gateway that exposes local AI CLI agents to DeepSeek Harness (DSH) as MCP tools.

The gateway discovers configured agent profiles, invokes the matching CLI driver, applies the profile policy to the extent supported by that driver, and returns normalized results. DSH remains the orchestrator: it chooses agents, routes work, and verifies results. The gateway does not plan, route, merge, or accept work on DSH's behalf.

`subagent_codex` is intentionally outside this gateway because it retains DSH's background-job lifecycle. The gateway provides single-shot MCP calls.

## Quick start

DSH is currently a developer preview. Install the bundle into the intended DSH profile:

```console
dsh plugin add @longnb47/dsh-agent-gateway
```

Use `--profile <profile>` when targeting a specific profile:

```console
dsh plugin --profile <profile> add @longnb47/dsh-agent-gateway
```

For an RC distributed as a local package tarball, pass the tarball path instead of the package name:

```console
dsh plugin --profile <profile> add <path-to-package.tgz>
```

The package declares a DSH bundle patch. Installation adds the package to the profile's bundles and inserts one `@deepseek-ai/dsh-mcp-client` row named `dsh-agent-gateway`. That row starts the installed gateway with Node; it does not refer to a developer checkout.

Before starting DSH, create the gateway config at:

```text
~/.dsh/agent-gateway/agents.jsonc
```

For a zero-cost smoke test, copy [examples/agents.example.jsonc](examples/agents.example.jsonc) to that location. It uses the shipped fake CLI, requires no real AI CLI, makes no network call, and uses no paid service. The fake script path resolves relative to the installed package root.

If you use a custom `DSH_HOME`, the gateway does not derive its default from it. Set `DSH_AGENT_GATEWAY_CONFIG` in the MCP row's `env` configuration; setting it only in your shell does not work because the DSH MCP client scrubs ambient `DSH_*` variables. See [DSH integration](docs/dsh-integration.md#custom-config-location-and-dsh_home).

Restart or start the selected DSH profile after creating the config.

## Fake smoke test

From DSH, call these tools in order:

1. `mcp__agent-gateway__list_agents` with no input. Confirm that `fake-agent` is listed.
2. `mcp__agent-gateway__get_agent_status` with `{ "agent": "fake-agent" }`. Confirm that the fake executable/version/auth readiness result is returned without reading credentials.
3. `mcp__agent-gateway__call_agent` with a real absolute workspace directory:

```json
{
  "agent": "fake-agent",
  "task": "Return a smoke-test response.",
  "cwd": "<absolute path to a workspace>",
  "timeoutSeconds": 60
}
```

The fake call returns the same normalized `AgentResult` shape as a real driver, without contacting an AI service.

## Tool surface

DSH exposes MCP tools as `mcp__<serverName>__<rawName>`. The public bundle uses `serverName: agent-gateway`, so the tools are:

- `mcp__agent-gateway__list_agents` returns enabled profiles, including `name`, `label`, `description`, `purposes`, `policy`, `driver`, `kind`, `costTier`, `constraints`, and `enforcementSummary`.
- `mcp__agent-gateway__call_agent` accepts `{ agent, task, cwd, model?, effort?, timeoutSeconds? }`. It returns a normalized `AgentResult` with `status` (`success`, `error`, `timeout`, or `cancelled`), a `response` or structured `error { phase, code, message }`, and metadata.
- `mcp__agent-gateway__get_agent_status` accepts `{ agent }` and reports executable, version, and auth readiness without reading or returning credentials.

## Drivers and enforcement

| Kind | Purpose | Read-only enforcement |
|---|---|---|
| `fake` | Offline smoke tests and fixtures | No real AI CLI; no network or paid service |
| `agy` | AGY headless specialist calls | Best-effort, permission-based; not an OS sandbox |
| `codex` | Codex one-shot specialist calls | Hard read-only sandbox for read-only profiles |
| `opencode` | OpenCode specialist calls | Best-effort |

Policy intent and actual enforcement are different. The gateway reports the requested policy and driver enforcement honestly; DSH must still treat agent output as untrusted evidence and verify it.

## Missing or invalid config

The public bundle deliberately uses `failOnStartupError: false`. If the config file is missing or invalid, the gateway writes an actionable error to its stderr, which the DSH MCP client forwards to DSH output/logs. DSH continues booting, but the gateway tools are not registered.

The bundle also sets `reconnect.maxAttempts: 3`, bounding the failure noise to about four total spawn attempts (roughly 3.5 seconds) instead of the MCP client's default ten retries. Check the config path proactively rather than relying only on child stderr. After setup, you may change the profile row to `failOnStartupError: true` for fail-fast startup or raise `reconnect.maxAttempts` if longer recovery is appropriate. See [Troubleshooting](docs/troubleshooting.md).

## Compatibility

| Component | Status |
|---|---|
| DSH `0.1.1-rc.2`, Node 24 shipped with DSH, Windows | Verified together |
| Node `>=22.3.0` | Required by the bundle's `process.getBuiltinModule` expression; compatibility floor is unverified |
| Linux and macOS | Unverified; no tests yet |

A new DSH minor or RC may change the bundle loader or MCP client because DSH is a developer preview.

## Security

- A bundle patch can contain `!!js`, which executes during config loading. The package and its patch are trusted code; inspect packages before installation.
- The gateway launches local CLIs with the current user's privileges. Config cannot supply arbitrary shell arguments: drivers own argv construction and processes use `shell: false`.
- Secrets are passed only through driver-specific environment allowlists. They are never logged, included in result metadata, or packed in the package tarball. Do not store API keys or tokens in `agents.jsonc`.
- Read-only enforcement varies by driver as shown above. DSH must verify all agent output.

See [SECURITY.md](SECURITY.md) for the threat boundaries and reporting process.

## Documentation

- [Configuration reference](docs/config.md)
- [DSH bundle integration](docs/dsh-integration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

Repository: <https://github.com/longnb47/dsh-agent-gateway>
