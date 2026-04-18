import type { MunadiClearArgs, MunadiClearResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface MunadiClearDeps {
  sessionStore: SessionStore;
}

export function createMunadiClearHandler(deps: MunadiClearDeps) {
  return async (_ctx: unknown, args: MunadiClearArgs): Promise<MunadiClearResult> => {
    await deps.sessionStore.clear(args.sessionId);
    return { ok: true as const };
  };
}
