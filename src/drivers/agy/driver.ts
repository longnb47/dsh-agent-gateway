import type { DriverConfig } from "../../config/types.js";
import type { AgentResult } from "../../types.js";
import type { AgentDriver, ProcessOutput, ProcessSpec, ResolvedAgentRequest } from "../types.js";
import { buildAgyInvocation } from "./invocation.js";
import { parseAgyResult } from "./parser.js";

export class AgyDriver implements AgentDriver {
  public readonly kind = "agy";
  public readonly capabilities = { supportsModel: true, supportsEffort: true } as const;
  public constructor(public readonly id: string, private readonly config: DriverConfig) {}
  public async buildInvocation(request: ResolvedAgentRequest): Promise<ProcessSpec> { return buildAgyInvocation(this.config, request); }
  public async parseResult(output: ProcessOutput, request: ResolvedAgentRequest): Promise<AgentResult> { return parseAgyResult(output, request); }
}
