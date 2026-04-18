import type { OgmiosStopArgs, OgmiosStopResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface OgmiosStopDeps {
  sessionStore: SessionStore;
}

export function createOgmiosStopHandler(deps: OgmiosStopDeps) {
  return async (_ctx: unknown, args: OgmiosStopArgs): Promise<OgmiosStopResult> => {
    return deps.sessionStore.stop(args.sessionId);
  };
}
