import type { ShokiListenArgs, ShokiListenResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface ShokiListenDeps {
  sessionStore: SessionStore;
}

export function createShokiListenHandler(deps: ShokiListenDeps) {
  return async (_ctx: unknown, args: ShokiListenArgs): Promise<ShokiListenResult> => {
    return deps.sessionStore.listen(args.sessionId, args.sinceMs);
  };
}
