import type { OgmiosListenArgs, OgmiosListenResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface OgmiosListenDeps {
  sessionStore: SessionStore;
}

export function createOgmiosListenHandler(deps: OgmiosListenDeps) {
  return async (_ctx: unknown, args: OgmiosListenArgs): Promise<OgmiosListenResult> => {
    return deps.sessionStore.listen(args.sessionId, args.sinceMs);
  };
}
