# DSH integration

The standard integration is a DSH bundle install. Do not point DSH at a gateway file in a developer workspace.

## Standard flow: install the bundle

Install the package into the intended DSH profile:

```console
dsh plugin --profile <profile> add @longnb47/dsh-agent-gateway
```

For an RC supplied as a local tarball, use its path instead:

```console
dsh plugin --profile <profile> add <path-to-package.tgz>
```

`dsh plugin add` forwards the package or tarball to pnpm in the profile directory and automatically appends the package to `dsh.profile.bundles` because the package declares `dsh.bundle.patch`. DSH then applies the shipped `cordis.patch.yml`.

Create the gateway config before starting the profile. The default location is:

```text
~/.dsh/agent-gateway/agents.jsonc
```

The package's [fake example](../examples/agents.example.jsonc) is a zero-cost first configuration. See [Configuration](config.md) and [Troubleshooting](troubleshooting.md).

## What the bundle patch adds

The shipped patch inserts this MCP client row:

```yaml
- insert:
    - id: dsh-agent-gateway
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: agent-gateway
        transport: stdio
        command: !!js process.execPath
        args:
          - !!js "process.getBuiltinModule('node:module').createRequire(new URL('package.json', ctx.baseUrl)).resolve('@longnb47/dsh-agent-gateway')"
        toolCallTimeoutMs: 660000
        failOnStartupError: false
        reconnect:
          maxAttempts: 3
```

`command` uses the Node executable that is running DSH. The `args` expression creates a module resolver rooted at the profile configuration base URL and resolves the installed `@longnb47/dsh-agent-gateway` package entry. The resulting path is one argv element, so it does not depend on a developer workspace and works with Windows paths containing spaces.

Both `!!js` values execute while DSH loads the configuration. Treat the package and its bundle patch as trusted code.

`toolCallTimeoutMs: 660000` leaves a buffer above a typical 600-second gateway timeout. `failOnStartupError: false` lets DSH boot before the user has created a gateway config, and `reconnect.maxAttempts: 3` bounds retry noise.

## Tool names visible to DSH

The MCP client exposes raw names as `mcp__<serverName>__<rawName>`. With the public `serverName: agent-gateway`, DSH sees:

- `mcp__agent-gateway__list_agents`
- `mcp__agent-gateway__call_agent`
- `mcp__agent-gateway__get_agent_status`

Changing `serverName` also changes this namespace.

## Custom config location and `DSH_HOME`

Config resolution is:

1. `DSH_AGENT_GATEWAY_CONFIG`, if passed to the gateway process.
2. `~/.dsh/agent-gateway/agents.jsonc`, where `~` is the operating-system user home.

The DSH MCP client scrubs ambient `DSH_*` environment variables before launching the child. Therefore, setting `DSH_AGENT_GATEWAY_CONFIG` in the user's shell is not sufficient. Put it in the MCP row's `env` config:

```yaml
        env:
          DSH_AGENT_GATEWAY_CONFIG: "<absolute path to agents.jsonc>"
```

Users with a custom `DSH_HOME` must add this override because the gateway's default is based on the operating-system home, not `DSH_HOME`.

## Startup behavior

If the config is missing or invalid, the gateway writes an actionable message to its stderr. The MCP client forwards that stream to DSH output/logs. With the public default `failOnStartupError: false`, DSH still starts, but the three gateway tools are absent. The retry setting results in about four total spawn attempts (roughly 3.5 seconds).

Once configuration is stable, a profile may override the row with `failOnStartupError: true` to make gateway startup failure fail fast. A profile may also raise `reconnect.maxAttempts` if it deliberately wants a longer retry period.

## Appendix: manual patch fallback (not the standard flow)

Use a manual row only for troubleshooting or environments where the bundle patch was not applied. The package must still be installed and resolvable from the DSH profile. Do not use a path to a checkout or a built file in a developer workspace.

Add the row shown in [What the bundle patch adds](#what-the-bundle-patch-adds) to the profile's `cordis.patch.yml`. If a row with `id: dsh-agent-gateway` already exists, diagnose or adjust that row rather than inserting a duplicate. Add the `env` block from the previous section when using a custom config location or custom `DSH_HOME`.

This fallback preserves the same portable package resolution as the shipped bundle patch; it is not a separate workspace-based installation method.
