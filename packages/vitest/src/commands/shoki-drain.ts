import type { ShokiDrainArgs, ShokiDrainResult } from '../command-types.js';

export function createShokiDrainHandler() {
  return async (_ctx: unknown, args: ShokiDrainArgs): Promise<ShokiDrainResult> => {
    void args;
    return [];
  };
}
