import type { ShokiStartArgs, ShokiStartResult } from '../command-types.js';

export interface ShokiStartDeps {
  registerStubSession?: (id: string) => void;
}

// Module-local counter — replaced by SessionStore in Plan 04-03.
let counter = 0;

export function createShokiStartHandler(deps: ShokiStartDeps = {}) {
  return async (_ctx: unknown, args: ShokiStartArgs = {}): Promise<ShokiStartResult> => {
    counter += 1;
    const sessionId = `shoki-${counter}`;
    deps.registerStubSession?.(sessionId);
    void args;
    return { sessionId };
  };
}
