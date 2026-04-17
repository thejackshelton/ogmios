import type { ShokiPhraseLogArgs, ShokiPhraseLogResult } from '../command-types.js';

export function createShokiPhraseLogHandler() {
  return async (_ctx: unknown, args: ShokiPhraseLogArgs): Promise<ShokiPhraseLogResult> => {
    void args;
    return [];
  };
}
