import type { AgentResult } from "../../types.js";
import type { ProcessOutput, ResolvedAgentRequest } from "../types.js";
import { stripAnsi, truncateDiagnostics } from "./diagnostics.js";

const QUOTA_PATTERN = /free usage exceeded|add credits|quota|rate limit/i;

function metadata(output: ProcessOutput, request: ResolvedAgentRequest): AgentResult["metadata"] {
  return {
    agent: request.profile,
    driver: request.driver,
    cwd: request.cwd,
    durationMs: output.durationMs,
    exitCode: output.exitCode,
    ...(request.model === undefined ? {} : { modelRequested: request.model, modelReported: request.model }),
    policyRequested: request.policy,
    enforcementReported: { filesystem: "read-only-best-effort", network: "unverified", process: "unverified" },
    outputTruncated: output.truncated,
  };
}

interface ParsedEvents { readonly text: string; readonly diagnostics: string; }

// Splits the JSONL event stream into model text (type:"text" events) and
// everything else (diagnostics: non-JSON lines, step_start/step_finish, error
// events). Quota detection only scans diagnostics, never the model's own text,
// so a legitimate answer mentioning "quota"/"rate limit" is not misclassified.
function parseEvents(stdout: string): ParsedEvents {
  const text: string[] = [];
  const diagnostics: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      const event: unknown = JSON.parse(line);
      if (typeof event !== "object" || event === null || Array.isArray(event)) {
        diagnostics.push(line);
        continue;
      }
      const record = event as Record<string, unknown>;
      const part = record.part;
      if (record.type === "text" && typeof part === "object" && part !== null && !Array.isArray(part)) {
        const textPart = part as Record<string, unknown>;
        if (textPart.type === "text" && typeof textPart.text === "string") {
          text.push(textPart.text);
          continue;
        }
      }
      diagnostics.push(line);
    } catch {
      diagnostics.push(line);
    }
  }
  return { text: text.join("").trim(), diagnostics: diagnostics.join("\n") };
}

export function parseOpencodeResult(output: ProcessOutput, request: ResolvedAgentRequest): AgentResult {
  const resultMetadata = metadata(output, request);
  const stdout = stripAnsi(output.stdout);
  const stderr = stripAnsi(output.stderr);
  const { text, diagnostics } = parseEvents(stdout);
  const error = (phase: string, code: string, message: string): AgentResult => ({ status: "error", error: { phase, code, message }, metadata: resultMetadata });

  const quotaText = `${stderr}\n${diagnostics}`;
  if (QUOTA_PATTERN.test(quotaText)) {
    const stderrDiagnostics = truncateDiagnostics(stderr.trim());
    const matchedLine = quotaText.split(/\r?\n/).find((line) => QUOTA_PATTERN.test(line))?.trim();
    return error("provider", "quota_exceeded", stderrDiagnostics || truncateDiagnostics(matchedLine ?? "OpenCode quota exceeded"));
  }
  if (output.truncated) return error("process", "output_truncated", "Process output exceeded limit");
  if (output.exitCode !== 0) {
    const diagnosticsOut = truncateDiagnostics(stderr.trim());
    return error("process", "exit_nonzero", diagnosticsOut || `OpenCode exited with code ${output.exitCode}`);
  }
  if (text === "") return error("protocol", "empty_response", "OpenCode returned no text events");
  return { status: "success", response: text, metadata: resultMetadata };
}
