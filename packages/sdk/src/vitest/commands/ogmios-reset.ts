import type { OgmiosResetArgs, OgmiosResetResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface OgmiosResetDeps {
  sessionStore: SessionStore;
}

export function createOgmiosResetHandler(deps: OgmiosResetDeps) {
  return async (_ctx: unknown, args: OgmiosResetArgs): Promise<OgmiosResetResult> => {
    await deps.sessionStore.reset(args.sessionId);
    return { ok: true as const };
  };
}
