import { statSync } from "node:fs";
import { delimiter, extname, isAbsolute, resolve } from "node:path";

function getEnv(env: Readonly<Record<string, string>>, key: string): string | undefined {
  const direct = env[key];
  if (direct !== undefined) return direct;
  const target = key.toLowerCase();
  for (const [candidate, value] of Object.entries(env)) {
    if (candidate.toLowerCase() === target) return value;
  }
  return undefined;
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function pathEntries(pathValue: string | undefined): readonly string[] {
  if (!pathValue) return [];
  return pathValue
    .split(delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/g, ""))
    .filter((entry) => entry.length > 0 && isAbsolute(entry));
}

// Intentionally excludes `.cmd`/`.bat`: on Windows Node routes those through
// `cmd.exe`, which re-opens the quoting/injection surface (and EINVAL on Node 24).
function executableExtensions(): readonly string[] {
  return process.platform === "win32" ? [".exe", ".com", ""] : [""];
}

/**
 * Resolve a configured `command` to an absolute executable path without ever
 * consulting the (untrusted) workspace cwd, to prevent CWD binary hijacking.
 * Throws instead of returning a bare/relative name so the caller fails closed.
 */
export function resolveExecutable(executable: string, env: Readonly<Record<string, string>>): string {
  if (isAbsolute(executable)) {
    if (isFile(executable)) return executable;
    throw new Error(`Executable not found at absolute path: ${executable}`);
  }
  if (executable.includes("/") || executable.includes("\\")) {
    throw new Error(`Relative executable paths are not allowed (use an absolute path): ${executable}`);
  }
  const extensions = extname(executable) !== "" ? [""] : executableExtensions();
  for (const directory of pathEntries(getEnv(env, "PATH"))) {
    for (const extension of extensions) {
      const candidate = resolve(directory, `${executable}${extension}`);
      if (isFile(candidate)) return candidate;
    }
  }
  throw new Error(`Executable not found in safe PATH entries: ${executable}`);
}
