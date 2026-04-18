import type {
  MunadiGetDroppedCountArgs,
  MunadiGetDroppedCountResult,
} from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface MunadiGetDroppedCountDeps {
  sessionStore: SessionStore;
}

export function createMunadiGetDroppedCountHandler(deps: MunadiGetDroppedCountDeps) {
  return async (
    _ctx: unknown,
    args: MunadiGetDroppedCountArgs,
  ): Promise<MunadiGetDroppedCountResult> => {
    return deps.sessionStore.getDroppedCount(args.sessionId);
  };
}
