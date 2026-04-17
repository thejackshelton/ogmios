import type { ShokiStartArgs, ShokiStartResult } from '../command-types.js';
import type { SessionStore, ShokiSdkDriver } from '../session-store.js';

export interface ShokiStartDeps {
  sessionStore: SessionStore;
  driver: ShokiSdkDriver;
}

export function createShokiStartHandler(deps: ShokiStartDeps) {
  return async (_ctx: unknown, args: ShokiStartArgs = {}): Promise<ShokiStartResult> => {
    const sessionId = await deps.sessionStore.start(deps.driver, args);
    return { sessionId };
  };
}
