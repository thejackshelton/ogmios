import type { ShokiPhraseLogArgs, ShokiPhraseLogResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface ShokiPhraseLogDeps {
  sessionStore: SessionStore;
}

export function createShokiPhraseLogHandler(deps: ShokiPhraseLogDeps) {
  return async (_ctx: unknown, args: ShokiPhraseLogArgs): Promise<ShokiPhraseLogResult> => {
    return deps.sessionStore.phraseLog(args.sessionId);
  };
}
