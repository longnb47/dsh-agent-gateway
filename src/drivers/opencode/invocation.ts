import type { DriverConfig } from "../../config/types.js";
import { renderContract } from "../../contracts/builtins.js";
import type { ProcessSpec, ResolvedAgentRequest } from "../types.js";

const SYSTEM_ENV = new Set(["systemroot", "systemdrive", "comspec", "path", "pathext", "temp", "tmp", "windir", "userprofile", "home", "homedrive", "homepath"]);

export function opencodeEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (SYSTEM_ENV.has(key.toLowerCase())) result[key] = value;
  }
  result.NO_COLOR = "1";
  result.FORCE_COLOR = "0";
  return result;
}

export function buildOpencodeInvocation(config: DriverConfig, request: ResolvedAgentRequest): ProcessSpec {
  const prompt = renderContract(request.contract, request.task, { target: "OpenCode" });
  const args = [
    ...(config.script === undefined ? [] : [config.script]),
    "run",
    ...(request.model === undefined ? [] : ["-m", `opencode/${request.model}`]),
    "--format", "json",
    "--dir", request.cwd,
    prompt,
  ];
  return { executable: config.command, args, cwd: request.cwd, env: opencodeEnvironment() };
}
