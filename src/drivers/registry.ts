import type { GatewayConfig } from "../config/types.js";
import { AgyDriver } from "./agy/driver.js";
import { CodexDriver } from "./codex/driver.js";
import { FakeDriver } from "./fake/driver.js";
import { OpencodeDriver } from "./opencode/driver.js";
import type { AgentDriver } from "./types.js";
export class DriverRegistry {
  private readonly drivers = new Map<string, AgentDriver>();
  public constructor(config: GatewayConfig) {
    for (const [id, definition] of Object.entries(config.drivers)) {
      if (definition.kind === "fake")
        this.drivers.set(id, new FakeDriver(id, definition));
      else if (definition.kind === "agy")
        this.drivers.set(id, new AgyDriver(id, definition));
      else if (definition.kind === "codex")
        this.drivers.set(id, new CodexDriver(id, definition));
      else if (definition.kind === "opencode")
        this.drivers.set(id, new OpencodeDriver(id, definition));
      else throw new Error(`Unsupported driver kind: ${definition.kind}`);
    }
  }
  public get(id: string): AgentDriver | undefined {
    return this.drivers.get(id);
  }
  public hasKind(kind: string): boolean {
    return kind === "fake" || kind === "agy" || kind === "codex" || kind === "opencode";
  }
}
