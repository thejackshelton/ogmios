import type { MunadiPhraseLogArgs, MunadiPhraseLogResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface MunadiPhraseLogDeps {
  sessionStore: SessionStore;
}

export function createMunadiPhraseLogHandler(deps: MunadiPhraseLogDeps) {
  return async (_ctx: unknown, args: MunadiPhraseLogArgs): Promise<MunadiPhraseLogResult> => {
    return deps.sessionStore.phraseLog(args.sessionId);
  };
}
