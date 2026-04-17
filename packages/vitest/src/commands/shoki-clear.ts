import type { ShokiClearArgs, ShokiClearResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface ShokiClearDeps {
  sessionStore: SessionStore;
}

export function createShokiClearHandler(deps: ShokiClearDeps) {
  return async (_ctx: unknown, args: ShokiClearArgs): Promise<ShokiClearResult> => {
    await deps.sessionStore.clear(args.sessionId);
    return { ok: true as const };
  };
}
