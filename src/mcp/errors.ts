export interface JsonRpcError { readonly code: number; readonly message: string; readonly data?: unknown; }
export const invalidParams = (message: string): JsonRpcError => ({ code: -32602, message }); export const internalError = (message: string): JsonRpcError => ({ code: -32603, message });
export class GatewayError extends Error { public constructor(message: string, public readonly phase: string = "internal", public readonly code: string = "error") { super(message); this.name = "GatewayError"; } }
