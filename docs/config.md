# Configuration

The gateway reads one trusted JSONC file when it starts. Comments and a `$schema` editor hint are allowed.

## Location and precedence

1. `DSH_AGENT_GATEWAY_CONFIG`, when it is passed directly to the gateway process.
2. `~/.dsh/agent-gateway/agents.jsonc`, relative to the operating-system user home.

The DSH MCP client removes ambient `DSH_*` variables from the child environment. To override the path, set the variable in the MCP row rather than only in your shell:

```yaml
env:
  DSH_AGENT_GATEWAY_CONFIG: "<absolute path to agents.jsonc>"
```

This is required when using a custom `DSH_HOME`, because the gateway default does not follow `DSH_HOME`. See [DSH integration](dsh-integration.md#custom-config-location-and-dsh_home).

## Top-level schema

| Field | Meaning |
|---|---|
| `$schema` | Optional editor hint. Shipped examples intentionally omit this field because they are meant to be copied out of the package, where a relative path would break. For editor validation, add a path to the package's shipped `agents.schema.json` (for example, an absolute file path or `file://` URL), or use a stable public URL once the package is published. |
| `version` | Required configuration version. It must be `1`. |
| `defaults` | Optional gateway defaults: `timeoutSeconds`, `maxOutputBytes`, and `maxConcurrency`. |
| `allowedWorkspaceRoots` | Optional array limiting accepted invocation workspaces. |
| `drivers` | Required object keyed by driver ID. Each entry selects a built-in driver and its executable. |
| `agents` | Required array of agent profiles exposed by `list_agents` when enabled. |

### Global defaults

| Field | Meaning |
|---|---|
| `timeoutSeconds` | Default maximum duration of an agent call, in seconds. |
| `maxOutputBytes` | Maximum captured child-process output, in bytes. |
| `maxConcurrency` | Maximum concurrent gateway calls. |

### Driver entries

Each property name under `drivers` is a stable ID referenced by an agent's `driver` field.

| Field | Meaning |
|---|---|
| `kind` | One of `fake`, `agy`, `codex`, or `opencode`. |
| `command` | Executable to launch. Real CLI configurations require an absolute path and fail closed otherwise. No shell command line is accepted. |
| `script` | Optional driver script path. The shipped fake script resolves relative to the installed package root; the Codex example uses an absolute local script path. |

Drivers construct their own argv and launch with `shell: false`. Config cannot provide arbitrary `args`, placeholders, or task-controlled commands. The shipped fake smoke fixture is the portable package-owned exception to real-CLI command paths: it uses `"command": "node"` with the packaged `examples/fake-cli/cli.mjs` script.

### Agent profiles

| Field | Meaning |
|---|---|
| `name` | Stable profile name used by `call_agent` and `get_agent_status`. |
| `label` | Human-readable name. |
| `description` | Short routing description shown to DSH. |
| `driver` | Driver ID defined in the top-level `drivers` object. |
| `purposes` | Array of intended uses such as `review`, `design`, `security`, or `second-opinion`. |
| `policy` | Four-dimensional permission intent, described below. |
| `promptContract` | Built-in prompt contract ID, such as `read-only-specialist`. |
| `defaults` | Profile defaults: optional `model`, optional `effort`, and optional `timeoutSeconds`. |
| `enabled` | Whether the profile is exposed by `list_agents`. |

Agent `defaults` do not turn unsupported CLI options into supported ones. Model and effort handling remain driver-specific.

### Policy

Every profile declares four independent policy dimensions:

| Field | Allowed values |
|---|---|
| `filesystem` | `none`, `read-only`, `workspace-write` |
| `network` | `deny`, `allow` |
| `credentials` | `deny`, `inherited-approved` |
| `process` | `deny-shell`, `driver-default` |

Policy is requested intent, not a universal sandbox. `list_agents` and call metadata report the driver's actual enforcement. AGY and OpenCode read-only operation is best-effort; AGY is permission-based. Codex read-only profiles use a hard read-only sandbox. DSH must still verify agent output.

## Workspace roots

`allowedWorkspaceRoots` narrows the directories accepted as `cwd` for calls:

```jsonc
"allowedWorkspaceRoots": [
  "<absolute path to workspace root one>",
  "<absolute path to workspace root two>"
]
```

When the list is present, a call outside those roots is rejected. Callers must always provide an absolute workspace directory. Keep the list as narrow as practical; `cwd` alone is not a security sandbox for drivers that cannot enforce filesystem boundaries.

## Driver examples

The dedicated files under `examples/` are the copyable versions.

### Fake

This profile requires no AI CLI, network, credential, or paid service:

```jsonc
{
  "version": 1,
  "defaults": { "timeoutSeconds": 600, "maxOutputBytes": 2097152, "maxConcurrency": 2 },
  "drivers": {
    "fake": {
      "kind": "fake",
      "command": "node",
      "script": "examples/fake-cli/cli.mjs"
    }
  },
  "agents": [{
    "name": "fake-agent",
    "label": "Fake Agent",
    "description": "Fake read-only agent for smoke tests (no real CLI, no network)",
    "driver": "fake",
    "purposes": ["review", "second-opinion"],
    "policy": { "filesystem": "read-only", "network": "deny", "credentials": "deny", "process": "deny-shell" },
    "promptContract": "read-only-specialist",
    "defaults": { "timeoutSeconds": 60 },
    "enabled": true
  }]
}
```

### AGY

```jsonc
{
  "version": 1,
  "defaults": { "timeoutSeconds": 600, "maxOutputBytes": 2097152, "maxConcurrency": 2 },
  "drivers": {
    "agy-headless": { "kind": "agy", "command": "<absolute path to agy.exe>" }
  },
  "agents": [{
    "name": "agy-reviewer",
    "label": "AGY Reviewer",
    "description": "Read-only AGY review and second opinion (best-effort enforcement)",
    "driver": "agy-headless",
    "purposes": ["review", "design", "security", "second-opinion"],
    "policy": { "filesystem": "read-only", "network": "deny", "credentials": "deny", "process": "deny-shell" },
    "promptContract": "read-only-specialist",
    "defaults": { "effort": "high", "timeoutSeconds": 600 },
    "enabled": true
  }]
}
```

### Codex

The Node executable and Codex JavaScript entry are both machine-local absolute paths:

```jsonc
{
  "version": 1,
  "defaults": { "timeoutSeconds": 600, "maxOutputBytes": 2097152, "maxConcurrency": 2 },
  "drivers": {
    "codex-headless": {
      "kind": "codex",
      "command": "<absolute path to node.exe>",
      "script": "<absolute path to codex.js>"
    }
  },
  "agents": [{
    "name": "codex-reviewer",
    "label": "Codex Reviewer",
    "description": "Read-only Codex review and second opinion (hard read-only sandbox)",
    "driver": "codex-headless",
    "purposes": ["review", "design", "security", "second-opinion"],
    "policy": { "filesystem": "read-only", "network": "deny", "credentials": "deny", "process": "deny-shell" },
    "promptContract": "read-only-specialist",
    "defaults": { "timeoutSeconds": 600 },
    "enabled": true
  }]
}
```

### OpenCode

```jsonc
{
  "version": 1,
  "defaults": { "timeoutSeconds": 600, "maxOutputBytes": 2097152, "maxConcurrency": 2 },
  "drivers": {
    "opencode-headless": { "kind": "opencode", "command": "<absolute path to opencode.exe>" }
  },
  "agents": [{
    "name": "opencode-reviewer",
    "label": "OpenCode Reviewer",
    "description": "Read-only OpenCode review and second opinion (best-effort; free zen models, server-side quota)",
    "driver": "opencode-headless",
    "purposes": ["review", "design", "second-opinion"],
    "policy": { "filesystem": "read-only", "network": "deny", "credentials": "deny", "process": "deny-shell" },
    "promptContract": "read-only-specialist",
    "defaults": { "model": "hy3-free", "timeoutSeconds": 600 },
    "enabled": true
  }]
}
```

## Secrets and credentials

Do not put API keys, access tokens, passwords, or credential material in this file. When a profile uses `credentials: inherited-approved`, the gateway passes only the approved driver-specific environment allowlist. It does not forward the full environment. Secret values are not logged, returned in metadata, or included in the package tarball.

## Fail-closed validation

The gateway refuses unsafe or ambiguous configuration rather than guessing. Startup fails for a missing or unparsable file, a version other than `1`, an unsupported driver kind, an invalid driver reference, or a real CLI command that is not an absolute path. Calls also fail closed for invalid agent names or workspaces outside configured roots.

With the public bundle default, startup failure leaves DSH running but registers no gateway tools. The actionable config error is written to child stderr and forwarded to DSH output/logs. See [Troubleshooting](troubleshooting.md).
