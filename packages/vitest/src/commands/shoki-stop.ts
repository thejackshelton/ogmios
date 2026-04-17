import type { ShokiStopArgs, ShokiStopResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface ShokiStopDeps {
  sessionStore: SessionStore;
}

export function createShokiStopHandler(deps: ShokiStopDeps) {
  return async (_ctx: unknown, args: ShokiStopArgs): Promise<ShokiStopResult> => {
    return deps.sessionStore.stop(args.sessionId);
  };
}
