import type { MunadiStopArgs, MunadiStopResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface MunadiStopDeps {
  sessionStore: SessionStore;
}

export function createMunadiStopHandler(deps: MunadiStopDeps) {
  return async (_ctx: unknown, args: MunadiStopArgs): Promise<MunadiStopResult> => {
    return deps.sessionStore.stop(args.sessionId);
  };
}
