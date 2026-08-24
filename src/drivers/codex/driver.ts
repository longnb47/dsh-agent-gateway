import type { DriverConfig } from "../../config/types.js";
import type { AgentResult } from "../../types.js";
import type { AgentDriver, ProcessOutput, ProcessSpec, ResolvedAgentRequest } from "../types.js";
import { buildCodexInvocation } from "./invocation.js";
import { parseCodexResult } from "./parser.js";

export class CodexDriver implements AgentDriver {
  public readonly kind = "codex";
  public readonly capabilities = { supportsModel: true, supportsEffort: false } as const;
  public constructor(public readonly id: string, private readonly config: DriverConfig) {}
  public async buildInvocation(request: ResolvedAgentRequest): Promise<ProcessSpec> { return buildCodexInvocation(this.config, request); }
  public async parseResult(output: ProcessOutput, request: ResolvedAgentRequest): Promise<AgentResult> { return parseCodexResult(output, request); }
}
