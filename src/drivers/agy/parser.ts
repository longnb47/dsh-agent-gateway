import type { ProcessOutput, ResolvedAgentRequest } from "../types.js";
import type { AgentResult } from "../../types.js";
import { cleanAgyOutput, truncateDiagnostics } from "./diagnostics.js";

interface AgyEnvelope { readonly status?: unknown; readonly response?: unknown; readonly error?: unknown; }

export function parseAgyEnvelope(stdout: string): AgyEnvelope | undefined {
  const clean = cleanAgyOutput(stdout);
  if (!clean) return undefined;
  const parse = (value: string): AgyEnvelope | undefined => {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as AgyEnvelope : undefined;
    } catch { return undefined; }
  };
  const whole = parse(clean);
  if (whole) return whole;
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return start >= 0 && end > start ? parse(clean.slice(start, end + 1)) : undefined;
}

function metadata(output: ProcessOutput, request: ResolvedAgentRequest): AgentResult["metadata"] {
  return {
    agent: request.profile,
    driver: request.driver,
    cwd: request.cwd,
    durationMs: output.durationMs,
    exitCode: output.exitCode,
    ...(request.model === undefined ? {} : { modelRequested: request.model }),
    policyRequested: request.policy,
    enforcementReported: { sandbox: true, mode: "plan", filesystem: "read-only-best-effort", network: "deny-best-effort", process: "deny-shell-best-effort" },
    outputTruncated: output.truncated,
  };
}

const stringValue = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;

export function parseAgyResult(output: ProcessOutput, request: ResolvedAgentRequest): AgentResult {
  const resultMetadata = metadata(output, request);
  const envelope = parseAgyEnvelope(output.stdout);
  const stderr = truncateDiagnostics(cleanAgyOutput(output.stderr));
  const reportedError = stringValue(envelope?.error);
  const diagnostic = reportedError || stderr;
  const permissionText = `${reportedError ?? ""}\n${stderr}\n${cleanAgyOutput(output.stdout)}`;
  const error = (phase: string, code: string, message: string): AgentResult => ({ status: "error", error: { phase, code, message }, metadata: resultMetadata });

  if (/permission check failed/i.test(permissionText)) return error("permission", "permission_denied", diagnostic || "AGY permission check failed");
  if (output.truncated) return error("process", "output_truncated", "Process output exceeded limit");
  if (output.exitCode !== 0) return error("process", "exit_nonzero", diagnostic || `AGY exited with code ${output.exitCode}`);
  if (!envelope) return error("parse", "invalid_json", stderr || `AGY did not return valid JSON (exit ${output.exitCode})`);
  if (typeof envelope.status !== "string" || envelope.status.toLowerCase() !== "success") {
    return error("protocol", "status_not_success", reportedError || stringValue(envelope.response) || "AGY reported non-success status");
  }
  const response = typeof envelope.response === "string" ? envelope.response.trim() : "";
  if (!response) return error("protocol", "empty_response", "AGY reported success but returned an empty response");
  return { status: "success", response, metadata: resultMetadata };
}
