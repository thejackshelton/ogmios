/**
 * Programmatic entry point for `ogmios/cli`.
 *
 * Historically this re-exported the `doctor` pipeline. Doctor was removed
 * in v0.1.7 (unactionable for consumers — `ogmios setup` handles permission
 * onboarding end-to-end), so this surface is now limited to the few helpers
 * that remain useful outside the CLI binary itself.
 */

export {
  type DiscoverHelperOptions,
  type DiscoverHelperResult,
  discoverHelper,
  type HelperLocation,
} from './helper-discovery.js';

export {
  DEFAULT_SNAPSHOT_PATH,
  restoreVoSettingsFromSnapshot,
} from './restore-vo-settings.js';

export {
  runSetup,
  SETUP_EXIT,
  type SetupOptions,
  type SetupResult,
} from './setup-command.js';

export {
  openTCCDatabase,
  SYSTEM_TCC_DB_PATH,
  type TCCOpenResult,
  USER_TCC_DB_PATH,
} from './tcc-db-paths.js';

export { warnOnLegacyStateDir } from './legacy-state.js';
