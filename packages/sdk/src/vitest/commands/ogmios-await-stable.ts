import type { OgmiosAwaitStableArgs, OgmiosAwaitStableResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface OgmiosAwaitStableDeps {
  sessionStore: SessionStore;
}

export function createOgmiosAwaitStableHandler(deps: OgmiosAwaitStableDeps) {
  return async (_ctx: unknown, args: OgmiosAwaitStableArgs): Promise<OgmiosAwaitStableResult> => {
    return deps.sessionStore.awaitStable(args.sessionId, {
      quietMs: args.quietMs,
      timeoutMs: args.timeoutMs,
    });
  };
}
