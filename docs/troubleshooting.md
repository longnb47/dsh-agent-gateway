# Troubleshooting

## DSH starts, but gateway tools are missing

The public bundle uses `failOnStartupError: false`. A missing or invalid gateway config therefore does not stop DSH. Instead:

- DSH continues booting.
- `mcp__agent-gateway__list_agents`, `mcp__agent-gateway__call_agent`, and `mcp__agent-gateway__get_agent_status` are not registered.
- The gateway writes an actionable config error to child stderr.
- The DSH MCP client forwards that stderr to DSH output/logs.
- `reconnect.maxAttempts: 3` causes about four total spawn attempts (roughly 3.5 seconds), then stops retrying.

Check the config path directly; do not rely only on the forwarded stderr message.

The default path is `~/.dsh/agent-gateway/agents.jsonc`, relative to the operating-system user home. On Windows PowerShell:

```powershell
Test-Path "$env:USERPROFILE\.dsh\agent-gateway\agents.jsonc"
```

On a POSIX shell:

```sh
test -f "$HOME/.dsh/agent-gateway/agents.jsonc"
```

Linux and macOS gateway compatibility is currently unverified; the POSIX command above only checks whether the file exists.

If the file exists, compare it with [Configuration](config.md): `version` must be `1`, every agent must reference a defined driver, and real CLI `command` values must be absolute paths.

## A custom config path is ignored

The DSH MCP client scrubs ambient `DSH_*` variables from the gateway child. An override set only in the user's shell will not reach the gateway.

Add it to the `dsh-agent-gateway` MCP row:

```yaml
      config:
        env:
          DSH_AGENT_GATEWAY_CONFIG: "<absolute path to agents.jsonc>"
```

This also applies when `DSH_HOME` is customized. The gateway's default path uses the operating-system home and does not follow `DSH_HOME`.

## Enable fail-fast startup

After the config is in place and stable, change the gateway MCP row from:

```yaml
failOnStartupError: false
```

to:

```yaml
failOnStartupError: true
```

This makes a gateway startup failure fail DSH startup instead of leaving the gateway tools absent. The public default remains `false` so a fresh install can boot before the user creates `agents.jsonc`.

## Adjust reconnect behavior

The public row bounds startup retries with:

```yaml
reconnect:
  maxAttempts: 3
```

Raise `maxAttempts` in the profile's gateway row only when a longer recovery window is useful. Increasing it also increases repeated startup messages for a persistent config error. The MCP client's unmodified default is ten retries.

## Tools appear under a different name

DSH namespaces MCP tools as `mcp__<serverName>__<rawName>`. The public patch uses `serverName: agent-gateway`. If a manual override changes `serverName`, use the corresponding namespace and ensure no live MCP client uses the same server name.

## Status reports the CLI as not ready

Call `mcp__agent-gateway__get_agent_status` with `{ "agent": "<profile name>" }`. It checks executable, version, and auth readiness without reading or returning credentials. Correct the configured executable path or the CLI's own local authentication setup; do not put credentials in `agents.jsonc`.
