import type { ShokiListenArgs, ShokiListenResult } from '../command-types.js';

export function createShokiListenHandler() {
  return async (_ctx: unknown, args: ShokiListenArgs): Promise<ShokiListenResult> => {
    void args;
    return [];
  };
}
