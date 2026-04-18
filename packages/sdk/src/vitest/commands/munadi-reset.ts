import type { MunadiResetArgs, MunadiResetResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface MunadiResetDeps {
  sessionStore: SessionStore;
}

export function createMunadiResetHandler(deps: MunadiResetDeps) {
  return async (_ctx: unknown, args: MunadiResetArgs): Promise<MunadiResetResult> => {
    await deps.sessionStore.reset(args.sessionId);
    return { ok: true as const };
  };
}
