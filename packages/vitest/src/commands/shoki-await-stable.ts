import type { ShokiAwaitStableArgs, ShokiAwaitStableResult } from '../command-types.js';

export function createShokiAwaitStableHandler() {
  return async (_ctx: unknown, args: ShokiAwaitStableArgs): Promise<ShokiAwaitStableResult> => {
    void args;
    return [];
  };
}
