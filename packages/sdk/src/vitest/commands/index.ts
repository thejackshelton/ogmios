import { realOgmiosSdkDriver, SessionStore, type OgmiosSdkDriver } from '../session-store.js';
import { createOgmiosAwaitStableHandler } from './ogmios-await-stable.js';
import { createOgmiosClearHandler } from './ogmios-clear.js';
import { createOgmiosDrainHandler } from './ogmios-drain.js';
import { createOgmiosGetDroppedCountHandler } from './ogmios-get-dropped-count.js';
import { createOgmiosLastPhraseHandler } from './ogmios-last-phrase.js';
import { createOgmiosListenHandler } from './ogmios-listen.js';
import { createOgmiosPhraseLogHandler } from './ogmios-phrase-log.js';
import { createOgmiosResetHandler } from './ogmios-reset.js';
import { createOgmiosStartHandler } from './ogmios-start.js';
import { createOgmiosStopHandler } from './ogmios-stop.js';

export interface CreateCommandsDeps {
  sessionStore?: SessionStore;
  driver?: OgmiosSdkDriver;
}

export function createCommands(deps: CreateCommandsDeps = {}) {
  const sessionStore = deps.sessionStore ?? new SessionStore();
  const driver = deps.driver ?? realOgmiosSdkDriver;
  return {
    ogmiosStart: createOgmiosStartHandler({ sessionStore, driver }),
    ogmiosStop: createOgmiosStopHandler({ sessionStore }),
    ogmiosListen: createOgmiosListenHandler({ sessionStore }),
    ogmiosDrain: createOgmiosDrainHandler({ sessionStore }),
    ogmiosPhraseLog: createOgmiosPhraseLogHandler({ sessionStore }),
    ogmiosLastPhrase: createOgmiosLastPhraseHandler({ sessionStore }),
    ogmiosClear: createOgmiosClearHandler({ sessionStore }),
    ogmiosReset: createOgmiosResetHandler({ sessionStore }),
    ogmiosAwaitStable: createOgmiosAwaitStableHandler({ sessionStore }),
    ogmiosGetDroppedCount: createOgmiosGetDroppedCountHandler({ sessionStore }),
  };
}

export type OgmiosCommands = ReturnType<typeof createCommands>;
export { SessionStore };
