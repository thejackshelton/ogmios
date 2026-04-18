import type { MunadiStartArgs, MunadiStartResult } from '../command-types.js';
import type { SessionStore, MunadiSdkDriver } from '../session-store.js';

export interface MunadiStartDeps {
  sessionStore: SessionStore;
  driver: MunadiSdkDriver;
}

export function createMunadiStartHandler(deps: MunadiStartDeps) {
  return async (_ctx: unknown, args: MunadiStartArgs = {}): Promise<MunadiStartResult> => {
    const sessionId = await deps.sessionStore.start(deps.driver, args);
    return { sessionId };
  };
}
