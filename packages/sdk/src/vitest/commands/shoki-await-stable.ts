import type { ShokiAwaitStableArgs, ShokiAwaitStableResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface ShokiAwaitStableDeps {
  sessionStore: SessionStore;
}

export function createShokiAwaitStableHandler(deps: ShokiAwaitStableDeps) {
  return async (_ctx: unknown, args: ShokiAwaitStableArgs): Promise<ShokiAwaitStableResult> => {
    return deps.sessionStore.awaitStable(args.sessionId, {
      quietMs: args.quietMs,
      timeoutMs: args.timeoutMs,
    });
  };
}
