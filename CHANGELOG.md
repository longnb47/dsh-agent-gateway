# Changelog

## 0.1.0-rc.2 - 2026-08-24

### Added

- First DSH bundle release of `dsh-agent-gateway`.
- Patch-only bundle installation of the `dsh-agent-gateway` MCP client row, with the gateway entry resolved from the installed package instead of a developer workspace.
- Built-in `fake`, `agy`, `codex`, and `opencode` driver kinds.
- A shipped fake CLI and example configuration for smoke testing without a real AI CLI, network access, credentials, or a paid service.

### Defaults

- `failOnStartupError: false`, allowing DSH to boot when the gateway config has not yet been created. Gateway tools remain unregistered and the actionable error is forwarded through child stderr.
- `reconnect.maxAttempts: 3`, bounding repeated startup attempts for a persistent configuration error.

### Changed (post-review hardening; rc.1 was never published)

- Aligned `repository`/`bugs`/`homepage` URLs to the real remote `dsh-agent-gateway`.
- Expanded `agents.schema.json` to model driver kinds, agent fields, policy enums, required fields, and unknown-field rejection.
- Removed the `$schema` hint from shipped examples (they are copied out of the package).
- Hardened the clean-profile release gate: missing-config path, positive connection signal, and DSH liveness.
- Added a `verify:release` gate; `prepack` now also runs the packaging tests.

### Known limitations

- Verified only with DSH `0.1.1-rc.2`, the Node 24 runtime shipped with DSH, and Windows.
- The bundle expression requires `process.getBuiltinModule`, available in Node `>=22.3.0`; that compatibility floor is unverified.
- Linux and macOS have not been tested.
- Live AGY, Codex, and OpenCode CLI tests are opt-in only. The default smoke path uses the fake CLI.
