export { shokiVitest, detectVoiceOverImports, type ShokiVitestPluginOptions } from './plugin.js';
export { createCommands, type ShokiCommands, SessionStore } from './commands/index.js';
export { realShokiSdkDriver, type ShokiSdkDriver, toWireEvent } from './session-store.js';
export {
  ShokiBindingNotAvailableError,
  ShokiConcurrentTestError,
  ShokiPlatformUnsupportedError,
  ShokiSessionNotFoundError,
} from './errors.js';
export type * from './command-types.js';
