import { createDriverHandle } from './driver-handle.js';
import type { ScreenReaderHandle } from './screen-reader.js';

export interface VoiceOverOptions {
  speechRate?: number;
  mute?: boolean;
  takeOverExisting?: boolean;
  timeoutMs?: number;
  logBufferSize?: number;
}

/**
 * Construct a VoiceOver ScreenReaderHandle.
 *
 * Phase 3 flips the target driver from "noop" to "voiceover". The registry in
 * `zig/src/core/registry.zig` gets its voiceover entry wired up by Plan 05;
 * until then this factory will error at start with DriverNotFoundError, which
 * is the intended behavior (SDK surface is stable; native driver is pending).
 */
export function voiceOver(opts: VoiceOverOptions = {}): ScreenReaderHandle {
  return createDriverHandle({
    driverName: 'voiceover',
    logBufferSize: opts.logBufferSize,
  });
}
