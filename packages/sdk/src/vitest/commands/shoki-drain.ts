import type { ShokiDrainArgs, ShokiDrainResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface ShokiDrainDeps {
  sessionStore: SessionStore;
}

export function createShokiDrainHandler(deps: ShokiDrainDeps) {
  return async (_ctx: unknown, args: ShokiDrainArgs): Promise<ShokiDrainResult> => {
    return deps.sessionStore.drain(args.sessionId);
  };
}
