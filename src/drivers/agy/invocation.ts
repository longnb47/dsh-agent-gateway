import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { DriverConfig } from "../../config/types.js";
import { renderContract } from "../../contracts/builtins.js";
import { GatewayError } from "../../mcp/errors.js";
import type { ProcessSpec, ResolvedAgentRequest } from "../types.js";

// Lowercased so matching is case-insensitive: on Windows `process.env` keys are
// enumerated with their native casing (e.g. `Path`, not `PATH`).
const SYSTEM_ENV = new Set(["systemroot", "systemdrive", "comspec", "path", "pathext", "temp", "tmp", "windir", "userprofile", "home", "homedrive", "homepath"]);
// Exact allowlist, deny-by-default. Credential-file vars such as
// GOOGLE_APPLICATION_CREDENTIALS are intentionally NOT forwarded.
const AUTH_ENV_KEYS = new Set(["gemini_api_key", "google_api_key", "google_genai_api_key", "anthropic_api_key", "openai_api_key"]);

export function agyEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    const normalized = key.toLowerCase();
    if (SYSTEM_ENV.has(normalized) || AUTH_ENV_KEYS.has(normalized)) result[key] = value;
  }
  return result;
}

export function assertInstalledCustomization(kind: "agent" | "skill", name: string | undefined, cwd: string): void {
  if (!name) return;
  const folder = kind === "skill" ? "skills" : "agents";
  const file = kind === "skill" ? "SKILL.md" : "agent.md";
  const candidates = [
    join(cwd, ".agents", folder, name, file),
    ...(kind === "skill" ? [join(cwd, ".agent", folder, name, file)] : []),
    join(homedir(), ".gemini", "config", folder, name, file),
  ];
  if (!candidates.some(existsSync)) throw new GatewayError(`${kind === "skill" ? "Skill" : "Agent"} \`${name}\` is not installed in the workspace or AGY global configuration.`, "validation", "customization_not_installed");
}

export function buildAgyInvocation(config: DriverConfig, request: ResolvedAgentRequest): ProcessSpec {
  assertInstalledCustomization("agent", request.agent, request.cwd);
  assertInstalledCustomization("skill", request.requiredSkill, request.cwd);
  const args = [
    ...(config.script === undefined ? [] : [config.script]),
    "--mode", "plan", "--sandbox", "--output-format", "json", "--effort", request.effort ?? "high",
    "--print-timeout", `${request.timeoutSeconds}s`, "--log-file", join(tmpdir(), "agy-cli.log"),
  ];
  if (request.agent) args.push("--agent", request.agent);
  if (request.model) args.push("--model", request.model);
  args.push("-p", renderContract(request.contract, request.task, ...(request.requiredSkill === undefined ? [] : [{ requiredSkill: request.requiredSkill }])));
  return { executable: config.command, args, cwd: request.cwd, env: agyEnvironment() };
}
