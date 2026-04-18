import type { MunadiDrainArgs, MunadiDrainResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface MunadiDrainDeps {
  sessionStore: SessionStore;
}

export function createMunadiDrainHandler(deps: MunadiDrainDeps) {
  return async (_ctx: unknown, args: MunadiDrainArgs): Promise<MunadiDrainResult> => {
    return deps.sessionStore.drain(args.sessionId);
  };
}
