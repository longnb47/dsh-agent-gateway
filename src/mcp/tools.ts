import type { GatewayConfig } from "../config/types.js";
import { MODEL_PATTERN } from "../config/validator.js";
import { runAgentHealth, type AgentStatusResult } from "../drivers/health.js";
import { driverMetadata } from "../drivers/metadata.js";
import { DriverRegistry } from "../drivers/registry.js";
import type { ResolvedAgentRequest } from "../drivers/types.js";
import { narrowPolicy } from "../policy/evaluator.js";
import { validateWorkspace } from "../policy/workspace-guard.js";
import { ProcessTerminationError, runProcess } from "../process/runner.js";
import type { AgentResult } from "../types.js";
import { GatewayError } from "./errors.js";

type JsonObject = Record<string, unknown>;

export const MAX_TASK_LENGTH = 30000;

function readString(value: JsonObject, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function fail(message: string): never {
  throw new GatewayError(message, "validation", "invalid_request");
}

function validateCwd(raw: string, allowedRoots?: readonly string[]): string {
  try {
    return validateWorkspace(raw, allowedRoots);
  } catch (error) {
    throw new GatewayError(error instanceof Error ? error.message : String(error), "validation", "invalid_workspace");
  }
}

export class ToolService {
  public constructor(
    private readonly config: GatewayConfig,
    private readonly drivers: DriverRegistry,
  ) {}

  public listAgents(): object {
    return {
      agents: this.config.agents
        .filter((agent) => agent.enabled)
        .map((agent) => {
          const kind = this.drivers.get(agent.driver)?.kind ?? "unknown";
          return {
            name: agent.name,
            label: agent.label,
            description: agent.description,
            purposes: agent.purposes,
            policy: agent.policy,
            driver: agent.driver,
            kind,
            enabled: agent.enabled,
            ...driverMetadata(kind),
          };
        }),
    };
  }

  public async agentStatus(input: unknown): Promise<AgentStatusResult> {
    let value: JsonObject = {};
    if (typeof input === "object" && input !== null && !Array.isArray(input)) value = input as JsonObject;

    const agentName = readString(value, "agent");
    if (agentName === undefined) fail("agent is required");

    const agent = this.config.agents.find((candidate) => candidate.name === agentName);
    if (!agent) fail("Agent not found");

    const driver = this.drivers.get(agent.driver);
    const driverConfig = this.config.drivers[agent.driver];
    if (!driver || !driverConfig) fail("Driver not found");

    return runAgentHealth(driver.kind, driverConfig, {
      agent: agent.name,
      driver: agent.driver,
      enabled: agent.enabled,
    });
  }

  public async callAgent(input: unknown, signal?: AbortSignal): Promise<AgentResult> {
    let value: JsonObject = {};
    if (typeof input === "object" && input !== null && !Array.isArray(input)) {
      value = input as JsonObject;
    }

    const agentName = readString(value, "agent");
    const task = readString(value, "task");
    const cwdRaw = readString(value, "cwd");
    if (agentName === undefined || task === undefined || task.length === 0 || cwdRaw === undefined) {
      fail("agent, task, and cwd are required");
    }
    if (task.length > MAX_TASK_LENGTH) {
      fail("task exceeds 30000 characters (Windows argv limit)");
    }

    const agent = this.config.agents.find((candidate) => candidate.name === agentName && candidate.enabled);
    if (!agent) fail("Agent not found or disabled");

    const driver = this.drivers.get(agent.driver);
    if (!driver) fail("Driver not found");

    const modelRaw = value.model ?? agent.defaults?.model;
    let model: string | undefined;
    if (modelRaw !== undefined) {
      if (typeof modelRaw !== "string") fail("model is not a valid slug");
      model = modelRaw.trim();
      if (!MODEL_PATTERN.test(model)) fail("model is not a valid slug");
      if (!driver.capabilities.supportsModel) fail("model is not supported by this driver");
    }

    const effortRaw = value.effort ?? agent.defaults?.effort;
    if (
      effortRaw !== undefined &&
      ((effortRaw !== "low" && effortRaw !== "medium" && effortRaw !== "high") || !driver.capabilities.supportsEffort)
    ) {
      fail("effort is not supported by this driver");
    }
    const effort = effortRaw === "low" || effortRaw === "medium" || effortRaw === "high" ? effortRaw : undefined;

    const maximumTimeout = agent.defaults?.timeoutSeconds ?? this.config.defaults.timeoutSeconds ?? 600;
    const timeoutRaw = value.timeoutSeconds;
    if (
      timeoutRaw !== undefined &&
      (typeof timeoutRaw !== "number" || !Number.isFinite(timeoutRaw) || timeoutRaw <= 0 || timeoutRaw > maximumTimeout)
    ) {
      fail("timeoutSeconds may only reduce the agent timeout");
    }

    const cwd = validateCwd(cwdRaw, this.config.allowedWorkspaceRoots);

    const request: ResolvedAgentRequest = {
      profile: agent.name,
      driver: agent.driver,
      contract: agent.promptContract,
      ...(agent.agent === undefined ? {} : { agent: agent.agent }),
      ...(agent.requiredSkill === undefined ? {} : { requiredSkill: agent.requiredSkill }),
      task,
      cwd,
      ...(model === undefined ? {} : { model }),
      ...(effort === undefined ? {} : { effort }),
      timeoutSeconds: typeof timeoutRaw === "number" ? timeoutRaw : maximumTimeout,
      maxOutputBytes: this.config.defaults.maxOutputBytes ?? 2097152,
      policy: narrowPolicy(agent.policy),
    };

    try {
      const output = await runProcess(await driver.buildInvocation(request), {
        timeoutSeconds: request.timeoutSeconds,
        maxOutputBytes: request.maxOutputBytes,
        signal,
      });
      return await driver.parseResult(output, request);
    } catch (error) {
      if (error instanceof ProcessTerminationError) {
        return {
          status: error.reason,
          error: { phase: error.reason, code: error.reason, message: `Process ${error.reason}` },
          metadata: {
            agent: request.profile,
            driver: request.driver,
            cwd: request.cwd,
            durationMs: error.output.durationMs,
            exitCode: error.output.exitCode,
            policyRequested: request.policy,
            enforcementReported: {},
            outputTruncated: error.output.truncated,
          },
        };
      }
      const gatewayError = error instanceof GatewayError ? error : undefined;
      return {
        status: "error",
        error: {
          phase: gatewayError?.phase ?? "internal",
          code: gatewayError?.code ?? "error",
          message: error instanceof Error ? error.message : String(error),
        },
        metadata: {
          agent: request.profile,
          driver: request.driver,
          cwd: request.cwd,
          durationMs: 0,
          exitCode: null,
          policyRequested: request.policy,
          enforcementReported: {},
          outputTruncated: false,
        },
      };
    }
  }
}
