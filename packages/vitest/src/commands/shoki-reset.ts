import type { ShokiResetArgs, ShokiResetResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface ShokiResetDeps {
  sessionStore: SessionStore;
}

export function createShokiResetHandler(deps: ShokiResetDeps) {
  return async (_ctx: unknown, args: ShokiResetArgs): Promise<ShokiResetResult> => {
    await deps.sessionStore.reset(args.sessionId);
    return { ok: true as const };
  };
}
