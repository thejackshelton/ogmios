import type {
  ShokiGetDroppedCountArgs,
  ShokiGetDroppedCountResult,
} from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface ShokiGetDroppedCountDeps {
  sessionStore: SessionStore;
}

export function createShokiGetDroppedCountHandler(deps: ShokiGetDroppedCountDeps) {
  return async (
    _ctx: unknown,
    args: ShokiGetDroppedCountArgs,
  ): Promise<ShokiGetDroppedCountResult> => {
    return deps.sessionStore.getDroppedCount(args.sessionId);
  };
}
