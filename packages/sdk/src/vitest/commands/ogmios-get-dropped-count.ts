import type {
  OgmiosGetDroppedCountArgs,
  OgmiosGetDroppedCountResult,
} from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface OgmiosGetDroppedCountDeps {
  sessionStore: SessionStore;
}

export function createOgmiosGetDroppedCountHandler(deps: OgmiosGetDroppedCountDeps) {
  return async (
    _ctx: unknown,
    args: OgmiosGetDroppedCountArgs,
  ): Promise<OgmiosGetDroppedCountResult> => {
    return deps.sessionStore.getDroppedCount(args.sessionId);
  };
}
