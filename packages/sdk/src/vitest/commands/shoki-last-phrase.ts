import type { ShokiLastPhraseArgs, ShokiLastPhraseResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface ShokiLastPhraseDeps {
  sessionStore: SessionStore;
}

export function createShokiLastPhraseHandler(deps: ShokiLastPhraseDeps) {
  return async (_ctx: unknown, args: ShokiLastPhraseArgs): Promise<ShokiLastPhraseResult> => {
    return deps.sessionStore.lastPhrase(args.sessionId);
  };
}
