import type { ShokiStopArgs, ShokiStopResult } from '../command-types.js';

export function createShokiStopHandler() {
  return async (_ctx: unknown, args: ShokiStopArgs): Promise<ShokiStopResult> => {
    void args;
    return { stopped: true, remainingRefs: 0 };
  };
}
