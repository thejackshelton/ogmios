import type { OgmiosDrainArgs, OgmiosDrainResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface OgmiosDrainDeps {
  sessionStore: SessionStore;
}

export function createOgmiosDrainHandler(deps: OgmiosDrainDeps) {
  return async (_ctx: unknown, args: OgmiosDrainArgs): Promise<OgmiosDrainResult> => {
    return deps.sessionStore.drain(args.sessionId);
  };
}
