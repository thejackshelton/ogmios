import type { ShokiLastPhraseArgs, ShokiLastPhraseResult } from '../command-types.js';

export function createShokiLastPhraseHandler() {
  return async (_ctx: unknown, args: ShokiLastPhraseArgs): Promise<ShokiLastPhraseResult> => {
    void args;
    return null;
  };
}
