export {
  type CommanderCommand,
  type CommanderCommandName,
  commanderCommands,
} from './commander-commands.js';
export {
  type CreateDriverHandleOptions,
  createDriverHandle,
} from './driver-handle.js';
export {
  BindingNotInstalledError,
  DriverNotFoundError,
  OgmiosError,
  UnsupportedPlatformError,
} from './errors.js';
export {
  type KeyboardCommand,
  type KeyboardCommandName,
  keyboardCommands,
} from './keyboard-commands.js';
export type {
  AwaitStableLogOptions,
  ScreenReaderHandle,
  OgmiosEvent,
  OgmiosEventSource,
} from './screen-reader.js';
export {
  type VoiceOverOptions,
  VoiceOverUnsupportedPlatformError,
  voiceOver,
} from './voice-over.js';
export { decodeEvents, EXPECTED_WIRE_VERSION } from './wire.js';

import { loadBinding } from './binding-loader.js';

/** binding.ping() round-trip — confirms the native addon is loaded. */
export function ping(): string {
  return loadBinding().ping();
}

/** Binding package version. */
export function version(): string {
  return loadBinding().version();
}

/** Current wire-format version (matches zig/src/core/wire.zig WIRE_VERSION). */
export function wireVersion(): number {
  return loadBinding().wireVersion();
}
