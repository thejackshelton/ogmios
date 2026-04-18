import type { OgmiosClearArgs, OgmiosClearResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface OgmiosClearDeps {
  sessionStore: SessionStore;
}

export function createOgmiosClearHandler(deps: OgmiosClearDeps) {
  return async (_ctx: unknown, args: OgmiosClearArgs): Promise<OgmiosClearResult> => {
    await deps.sessionStore.clear(args.sessionId);
    return { ok: true as const };
  };
}
