import { realShokiSdkDriver, SessionStore, type ShokiSdkDriver } from '../session-store.js';
import { createShokiAwaitStableHandler } from './shoki-await-stable.js';
import { createShokiClearHandler } from './shoki-clear.js';
import { createShokiDrainHandler } from './shoki-drain.js';
import { createShokiGetDroppedCountHandler } from './shoki-get-dropped-count.js';
import { createShokiLastPhraseHandler } from './shoki-last-phrase.js';
import { createShokiListenHandler } from './shoki-listen.js';
import { createShokiPhraseLogHandler } from './shoki-phrase-log.js';
import { createShokiResetHandler } from './shoki-reset.js';
import { createShokiStartHandler } from './shoki-start.js';
import { createShokiStopHandler } from './shoki-stop.js';

export interface CreateCommandsDeps {
  sessionStore?: SessionStore;
  driver?: ShokiSdkDriver;
}

export function createCommands(deps: CreateCommandsDeps = {}) {
  const sessionStore = deps.sessionStore ?? new SessionStore();
  const driver = deps.driver ?? realShokiSdkDriver;
  return {
    shokiStart: createShokiStartHandler({ sessionStore, driver }),
    shokiStop: createShokiStopHandler({ sessionStore }),
    shokiListen: createShokiListenHandler({ sessionStore }),
    shokiDrain: createShokiDrainHandler({ sessionStore }),
    shokiPhraseLog: createShokiPhraseLogHandler({ sessionStore }),
    shokiLastPhrase: createShokiLastPhraseHandler({ sessionStore }),
    shokiClear: createShokiClearHandler({ sessionStore }),
    shokiReset: createShokiResetHandler({ sessionStore }),
    shokiAwaitStable: createShokiAwaitStableHandler({ sessionStore }),
    shokiGetDroppedCount: createShokiGetDroppedCountHandler({ sessionStore }),
  };
}

export type ShokiCommands = ReturnType<typeof createCommands>;
export { SessionStore };
