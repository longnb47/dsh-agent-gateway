import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DriverConfig } from "../config/types.js";
import { resolveExecutable } from "../process/executable.js";
import { runProcess } from "../process/runner.js";

export interface AgentStatusResult {
  readonly agent: string;
  readonly driver: string;
  readonly kind: string;
  readonly enabled: boolean;
  readonly status: "ready" | "not-ready" | "unknown";
  readonly executable: string | null;
  readonly version: string | null;
  readonly auth: "ready" | "not-ready" | "unknown";
  readonly detail?: string;
}

export interface RunAgentHealthOptions {
  readonly agent?: string;
  readonly driver?: string;
  readonly enabled?: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly homeDir?: string;
  readonly cwd?: string;
}

export const SYSTEM_ENV = new Set([
  "systemroot",
  "systemdrive",
  "comspec",
  "path",
  "pathext",
  "temp",
  "tmp",
  "windir",
  "userprofile",
  "home",
  "homedrive",
  "homepath",
]);

function environmentValue(env: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(env)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

export function healthEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && SYSTEM_ENV.has(key.toLowerCase())) result[key] = value;
  }
  return result;
}

export function authState(
  kind: string,
  env: Readonly<Record<string, string | undefined>>,
  homeDir: string,
): AgentStatusResult["auth"] {
  if (kind === "agy") return existsSync(join(homeDir, ".gemini")) ? "ready" : "unknown";
  if (kind === "codex") {
    return existsSync(join(homeDir, ".codex", "config.toml")) || environmentValue(env, "OPENAI_API_KEY") !== undefined
      ? "ready"
      : "unknown";
  }
  if (kind === "opencode") {
    return existsSync(join(homeDir, ".local", "share", "opencode", "auth.json")) ? "ready" : "unknown";
  }
  return "unknown";
}

export function versionArgs(kind: string, config: DriverConfig): readonly string[] {
  if (kind === "agy" || kind === "opencode" || kind === "codex") {
    return config.script === undefined ? ["--version"] : [config.script, "--version"];
  }
  return [];
}

export async function runAgentHealth(
  kind: string,
  config: DriverConfig,
  options: RunAgentHealthOptions = {},
): Promise<AgentStatusResult> {
  const env = options.env ?? process.env;
  const auth = authState(kind, env, options.homeDir ?? homedir());
  const base = {
    agent: options.agent ?? kind,
    driver: options.driver ?? kind,
    kind,
    enabled: options.enabled ?? true,
    auth,
  } as const;
  const processEnv = healthEnvironment(env);

  let executable: string;
  try {
    executable = resolveExecutable(config.command, processEnv);
  } catch (error) {
    return {
      ...base,
      status: "not-ready",
      executable: null,
      version: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const args = versionArgs(kind, config);
  if (args.length === 0) return { ...base, status: "ready", executable, version: null };

  try {
    const output = await runProcess(
      { executable, args, cwd: options.cwd ?? process.cwd(), env: processEnv },
      { timeoutSeconds: 10, maxOutputBytes: 8192 },
    );
    if (output.exitCode !== 0) {
      return {
        ...base,
        status: "not-ready",
        executable,
        version: null,
        detail: `version probe failed (exit ${output.exitCode})`,
      };
    }
    return { ...base, status: "ready", executable, version: output.stdout.trim() };
  } catch {
    return { ...base, status: "not-ready", executable, version: null, detail: "version probe could not start" };
  }
}
