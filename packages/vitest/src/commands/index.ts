import { createShokiStartHandler } from './shoki-start.js';
import { createShokiStopHandler } from './shoki-stop.js';
import { createShokiListenHandler } from './shoki-listen.js';
import { createShokiDrainHandler } from './shoki-drain.js';
import { createShokiPhraseLogHandler } from './shoki-phrase-log.js';
import { createShokiLastPhraseHandler } from './shoki-last-phrase.js';
import { createShokiClearHandler } from './shoki-clear.js';
import { createShokiResetHandler } from './shoki-reset.js';
import { createShokiAwaitStableHandler } from './shoki-await-stable.js';
import { createShokiGetDroppedCountHandler } from './shoki-get-dropped-count.js';

// biome-ignore lint/suspicious/noEmptyInterface: Plan 04-03 extends with { sessionStore, driver }
export interface CreateCommandsDeps {}

export function createCommands(deps: CreateCommandsDeps = {}) {
  void deps;
  return {
    shokiStart: createShokiStartHandler(),
    shokiStop: createShokiStopHandler(),
    shokiListen: createShokiListenHandler(),
    shokiDrain: createShokiDrainHandler(),
    shokiPhraseLog: createShokiPhraseLogHandler(),
    shokiLastPhrase: createShokiLastPhraseHandler(),
    shokiClear: createShokiClearHandler(),
    shokiReset: createShokiResetHandler(),
    shokiAwaitStable: createShokiAwaitStableHandler(),
    shokiGetDroppedCount: createShokiGetDroppedCountHandler(),
  };
}

export type ShokiCommands = ReturnType<typeof createCommands>;
