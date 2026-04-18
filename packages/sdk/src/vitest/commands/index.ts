import { realMunadiSdkDriver, SessionStore, type MunadiSdkDriver } from '../session-store.js';
import { createMunadiAwaitStableHandler } from './munadi-await-stable.js';
import { createMunadiClearHandler } from './munadi-clear.js';
import { createMunadiDrainHandler } from './munadi-drain.js';
import { createMunadiGetDroppedCountHandler } from './munadi-get-dropped-count.js';
import { createMunadiLastPhraseHandler } from './munadi-last-phrase.js';
import { createMunadiListenHandler } from './munadi-listen.js';
import { createMunadiPhraseLogHandler } from './munadi-phrase-log.js';
import { createMunadiResetHandler } from './munadi-reset.js';
import { createMunadiStartHandler } from './munadi-start.js';
import { createMunadiStopHandler } from './munadi-stop.js';

export interface CreateCommandsDeps {
  sessionStore?: SessionStore;
  driver?: MunadiSdkDriver;
}

export function createCommands(deps: CreateCommandsDeps = {}) {
  const sessionStore = deps.sessionStore ?? new SessionStore();
  const driver = deps.driver ?? realMunadiSdkDriver;
  return {
    munadiStart: createMunadiStartHandler({ sessionStore, driver }),
    munadiStop: createMunadiStopHandler({ sessionStore }),
    munadiListen: createMunadiListenHandler({ sessionStore }),
    munadiDrain: createMunadiDrainHandler({ sessionStore }),
    munadiPhraseLog: createMunadiPhraseLogHandler({ sessionStore }),
    munadiLastPhrase: createMunadiLastPhraseHandler({ sessionStore }),
    munadiClear: createMunadiClearHandler({ sessionStore }),
    munadiReset: createMunadiResetHandler({ sessionStore }),
    munadiAwaitStable: createMunadiAwaitStableHandler({ sessionStore }),
    munadiGetDroppedCount: createMunadiGetDroppedCountHandler({ sessionStore }),
  };
}

export type MunadiCommands = ReturnType<typeof createCommands>;
export { SessionStore };
