import type { MunadiListenArgs, MunadiListenResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface MunadiListenDeps {
  sessionStore: SessionStore;
}

export function createMunadiListenHandler(deps: MunadiListenDeps) {
  return async (_ctx: unknown, args: MunadiListenArgs): Promise<MunadiListenResult> => {
    return deps.sessionStore.listen(args.sessionId, args.sinceMs);
  };
}
