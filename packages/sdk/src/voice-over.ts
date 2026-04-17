import { createDriverHandle } from './driver-handle.js';
import { ShokiError } from './errors.js';
import type { ScreenReaderHandle } from './screen-reader.js';

export interface VoiceOverOptions {
  speechRate?: number;
  mute?: boolean;
  takeOverExisting?: boolean;
  timeoutMs?: number;
  logBufferSize?: number;
}

/**
 * Thrown by {@link voiceOver} when called on a non-darwin host. VoiceOver is
 * a macOS-only screen reader; Linux runs Orca and Windows runs NVDA — those
 * drivers land in later phases.
 */
export class VoiceOverUnsupportedPlatformError extends ShokiError {
  constructor(public readonly platform: string) {
    super(
      `VoiceOver driver is macOS-only; this process is running on ${platform}. ` +
        `Use nvda() on win32 or orca() on linux when those drivers ship.`,
      'ERR_VOICEOVER_UNSUPPORTED_PLATFORM',
    );
    this.name = 'VoiceOverUnsupportedPlatformError';
  }
}

/**
 * Construct a VoiceOver ScreenReaderHandle.
 *
 * Plan 03-05 wired the "voiceover" entry into the Zig registry and this factory
 * now resolves to the real driver on darwin. On non-darwin hosts we throw at
 * construction time rather than DriverNotFoundError at start() — earlier signal,
 * same outcome.
 */
export function voiceOver(opts: VoiceOverOptions = {}): ScreenReaderHandle {
  if (process.platform !== 'darwin') {
    throw new VoiceOverUnsupportedPlatformError(process.platform);
  }
  return createDriverHandle({
    driverName: 'voiceover',
    logBufferSize: opts.logBufferSize,
  });
}
