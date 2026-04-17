import type { ShokiResetArgs, ShokiResetResult } from '../command-types.js';

export function createShokiResetHandler() {
  return async (_ctx: unknown, args: ShokiResetArgs): Promise<ShokiResetResult> => {
    void args;
    return { ok: true };
  };
}
