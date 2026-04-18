import type { MunadiLastPhraseArgs, MunadiLastPhraseResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface MunadiLastPhraseDeps {
  sessionStore: SessionStore;
}

export function createMunadiLastPhraseHandler(deps: MunadiLastPhraseDeps) {
  return async (_ctx: unknown, args: MunadiLastPhraseArgs): Promise<MunadiLastPhraseResult> => {
    return deps.sessionStore.lastPhrase(args.sessionId);
  };
}
