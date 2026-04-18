import type { OgmiosStartArgs, OgmiosStartResult } from '../command-types.js';
import type { SessionStore, OgmiosSdkDriver } from '../session-store.js';

export interface OgmiosStartDeps {
  sessionStore: SessionStore;
  driver: OgmiosSdkDriver;
}

export function createOgmiosStartHandler(deps: OgmiosStartDeps) {
  return async (_ctx: unknown, args: OgmiosStartArgs = {}): Promise<OgmiosStartResult> => {
    const sessionId = await deps.sessionStore.start(deps.driver, args);
    return { sessionId };
  };
}
