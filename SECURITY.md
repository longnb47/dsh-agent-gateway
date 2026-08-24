# Security policy

## Scope

This policy covers the `dsh-agent-gateway` package, its DSH bundle patch, MCP stdio server, configuration handling, process runner, and shipped drivers.

The gateway is an MCP adapter, not an orchestrator. DSH chooses agents, routes tasks, owns verification, and retains its existing background-job lifecycle. `subagent_codex` is intentionally outside the gateway.

## Reporting

For a vulnerability or a report containing sensitive details, use the repository's [GitHub private security advisory form](https://github.com/longnb47/dsh-agent-gateway/security/advisories/new). For non-sensitive security hardening or documentation issues, use [GitHub issues](https://github.com/longnb47/dsh-agent-gateway/issues).

Reports are handled on a best-effort basis. The project does not publish a private security email or a response-time guarantee. Do not include secrets, tokens, private prompts, or private repository contents in a public issue.

## Threat boundaries

### DSH and bundle loading

DSH is a developer-preview dependency. A new minor or RC may change its bundle loader, config behavior, or MCP client. The verified compatibility set is DSH `0.1.1-rc.2`, its shipped Node 24 runtime, and Windows; Linux/macOS and the Node `>=22.3.0` floor are unverified.

The bundle's `cordis.patch.yml` contains `!!js` values. DSH executes those expressions while loading configuration. A package and its bundle patch are therefore trusted code, not passive data. Review the package source and patch before installation.

### Local CLI execution

The gateway starts local AI CLIs with the current user's operating-system privileges. A profile's `cwd` and requested policy do not by themselves reduce those user privileges.

Configuration cannot provide arbitrary shell commands or argv. A driver owns its argument construction, invocation uses `shell: false`, and real CLI command paths are validated fail-closed as absolute paths. Requests cannot override the executable or inject arbitrary arguments.

### Configuration and workspaces

Treat `agents.jsonc` as trusted user configuration. Do not source it from an untrusted repository. `allowedWorkspaceRoots` can narrow accepted workspaces, but it is not a substitute for driver or operating-system enforcement.

Repository content and agent output are untrusted input. They may contain prompt injection or incorrect claims. DSH must verify output and workspace effects before accepting a result.

### Policy versus enforcement

The four policy dimensions express requested intent:

- Filesystem: `none`, `read-only`, or `workspace-write`.
- Network: `deny` or `allow`.
- Credentials: `deny` or `inherited-approved`.
- Process: `deny-shell` or `driver-default`.

Actual read-only enforcement is driver-specific and is reported in `list_agents` and result metadata:

- AGY: best-effort, permission-based enforcement.
- Codex: hard read-only sandbox for read-only profiles.
- OpenCode: best-effort enforcement.
- Fake: no real AI CLI, network access, or paid service.

The gateway does not claim a stronger boundary than the driver provides. DSH must continue to verify agent output even when a driver reports hard enforcement.

## Secrets and environment variables

Do not store API keys, tokens, passwords, or other credentials in `agents.jsonc`.

Child processes receive only a driver-specific environment allowlist, not the complete gateway environment. Credential variables are eligible only for profiles using `credentials: inherited-approved`. Secret values are never logged, returned in result metadata, or included in the package tarball.

The DSH MCP client's `env` setting may be used to pass `DSH_AGENT_GATEWAY_CONFIG`; it should contain a config path, not a credential. Ambient `DSH_*` variables are scrubbed before the gateway child is launched.

## Operational guidance

- Start with the shipped fake profile before configuring a real CLI.
- Keep `allowedWorkspaceRoots` narrow when using it.
- Prefer `credentials: deny` unless a driver explicitly requires approved inherited authentication.
- Inspect the enforcement summary returned for each profile.
- Review DSH output/logs for gateway startup errors, while also checking the expected config path directly.
- Keep live CLI tests opt-in so automated checks do not unexpectedly consume credentials, network access, or paid quota.
