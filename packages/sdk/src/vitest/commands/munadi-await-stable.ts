import type { MunadiAwaitStableArgs, MunadiAwaitStableResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface MunadiAwaitStableDeps {
  sessionStore: SessionStore;
}

export function createMunadiAwaitStableHandler(deps: MunadiAwaitStableDeps) {
  return async (_ctx: unknown, args: MunadiAwaitStableArgs): Promise<MunadiAwaitStableResult> => {
    return deps.sessionStore.awaitStable(args.sessionId, {
      quietMs: args.quietMs,
      timeoutMs: args.timeoutMs,
    });
  };
}
