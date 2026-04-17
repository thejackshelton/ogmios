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
 * PHASE 1 STATUS: this factory wires to the "noop" driver as a placeholder.
 * The real "voiceover" driver lands in Phase 3 — when it does, the ONLY
 * change here is the driverName string. The ScreenReaderHandle surface
 * stays identical (EXT-01).
 */
export function voiceOver(opts: VoiceOverOptions = {}): ScreenReaderHandle {
  return createDriverHandle({
    // TODO(phase-3): change to 'voiceover' once the Zig driver lands.
    driverName: 'noop',
    logBufferSize: opts.logBufferSize,
  });
}
