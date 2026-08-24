import type { AgentResult } from "../../types.js";
import type { ProcessOutput, ResolvedAgentRequest } from "../types.js";
import { stripAnsi, truncateDiagnostics } from "./diagnostics.js";

function metadata(output: ProcessOutput, request: ResolvedAgentRequest): AgentResult["metadata"] {
  const stderr = stripAnsi(output.stderr);
  const reported = /(?:model)\s*:\s*([^\r\n,]+)/i.exec(stderr)?.[1]?.trim();
  const modelReported = reported || request.model;
  return {
    agent: request.profile,
    driver: request.driver,
    cwd: request.cwd,
    durationMs: output.durationMs,
    exitCode: output.exitCode,
    ...(request.model === undefined ? {} : { modelRequested: request.model }),
    ...(modelReported === undefined ? {} : { modelReported }),
    policyRequested: request.policy,
    enforcementReported: { sandbox: true, mode: "read-only", filesystem: "read-only", network: "unverified", process: "sandboxed" },
    outputTruncated: output.truncated,
  };
}

export function parseCodexResult(output: ProcessOutput, request: ResolvedAgentRequest): AgentResult {
  const resultMetadata = metadata(output, request);
  const clean = stripAnsi(output.stdout).trim();
  if (output.exitCode !== 0) {
    const diagnostics = truncateDiagnostics(stripAnsi(output.stderr).trim());
    return {
      status: "error",
      error: { phase: "process", code: "exit_nonzero", message: diagnostics || `Codex exited with code ${output.exitCode}` },
      metadata: resultMetadata,
    };
  }
  if (clean === "") {
    return {
      status: "error",
      error: { phase: "protocol", code: "empty_response", message: "Codex exited successfully but returned an empty response" },
      metadata: resultMetadata,
    };
  }
  return { status: "success", response: clean, metadata: resultMetadata };
}
