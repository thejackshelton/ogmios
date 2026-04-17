import type { ShokiClearArgs, ShokiClearResult } from '../command-types.js';

export function createShokiClearHandler() {
  return async (_ctx: unknown, args: ShokiClearArgs): Promise<ShokiClearResult> => {
    void args;
    return { ok: true };
  };
}
