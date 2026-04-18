import type { OgmiosLastPhraseArgs, OgmiosLastPhraseResult } from '../command-types.js';
import type { SessionStore } from '../session-store.js';

export interface OgmiosLastPhraseDeps {
  sessionStore: SessionStore;
}

export function createOgmiosLastPhraseHandler(deps: OgmiosLastPhraseDeps) {
  return async (_ctx: unknown, args: OgmiosLastPhraseArgs): Promise<OgmiosLastPhraseResult> => {
    return deps.sessionStore.lastPhrase(args.sessionId);
  };
}
