import type { DriverConfig } from "../../config/types.js";
import { renderContract } from "../../contracts/builtins.js";
import { GatewayError } from "../../mcp/errors.js";
import type { ProcessSpec, ResolvedAgentRequest } from "../types.js";

const SYSTEM_ENV = new Set(["systemroot", "systemdrive", "comspec", "path", "pathext", "temp", "tmp", "windir", "userprofile", "home", "homedrive", "homepath"]);
const AUTH_ENV_KEYS = new Set(["openai_api_key", "openai_base_url"]);

export function codexEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    const normalized = key.toLowerCase();
    if (SYSTEM_ENV.has(normalized) || AUTH_ENV_KEYS.has(normalized)) result[key] = value;
  }
  result.NO_COLOR = "1";
  result.FORCE_COLOR = "0";
  return result;
}

export function buildCodexInvocation(config: DriverConfig, request: ResolvedAgentRequest): ProcessSpec {
  if (config.script === undefined) {
    throw new GatewayError("codex driver requires script (codex.js entrypoint)", "config", "missing_script");
  }
  const args = [
    config.script,
    "exec",
    "-s", "read-only",
    "-C", request.cwd,
    "--ephemeral",
    "--skip-git-repo-check",
    ...(request.model === undefined ? [] : ["-m", request.model]),
    "-",
  ];
  return {
    executable: config.command,
    args,
    cwd: request.cwd,
    env: codexEnvironment(),
    stdin: renderContract(request.contract, request.task, { target: "Codex" }),
  };
}
