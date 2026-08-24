import type { DriverConfig } from "../../config/types.js";
import type { AgentResult } from "../../types.js";
import type { AgentDriver, ProcessOutput, ProcessSpec, ResolvedAgentRequest } from "../types.js";
import { buildOpencodeInvocation } from "./invocation.js";
import { parseOpencodeResult } from "./parser.js";

export class OpencodeDriver implements AgentDriver {
  public readonly kind = "opencode";
  public readonly capabilities = { supportsModel: true, supportsEffort: false } as const;
  public constructor(public readonly id: string, private readonly config: DriverConfig) {}
  public async buildInvocation(request: ResolvedAgentRequest): Promise<ProcessSpec> { return buildOpencodeInvocation(this.config, request); }
  public async parseResult(output: ProcessOutput, request: ResolvedAgentRequest): Promise<AgentResult> { return parseOpencodeResult(output, request); }
}
