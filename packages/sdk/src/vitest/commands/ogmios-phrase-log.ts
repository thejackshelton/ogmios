import type { OgmiosPhraseLogArgs, OgmiosPhraseLogResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface OgmiosPhraseLogDeps {
  sessionStore: SessionStore;
}

export function createOgmiosPhraseLogHandler(deps: OgmiosPhraseLogDeps) {
  return async (_ctx: unknown, args: OgmiosPhraseLogArgs): Promise<OgmiosPhraseLogResult> => {
    return deps.sessionStore.phraseLog(args.sessionId);
  };
}
