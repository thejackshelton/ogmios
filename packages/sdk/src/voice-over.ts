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
 * Shape of the `voiceOver` export. Callable as a factory (returns a fresh
 * handle; caller owns start/end), and usable as a namespace whose
 * {@link VoiceOverFn.start}/{@link VoiceOverFn.end} methods manage a
 * **process-singleton** default handle for the common "one VO session per
 * test file" case (Phase 7 Decision D-03).
 */
export interface VoiceOverFn {
  (opts?: VoiceOverOptions): ScreenReaderHandle;
  /**
   * Boot (or reuse) the process-singleton VoiceOver handle. Refcounted — two
   * `start()` calls return the same handle and require two `end()` calls to
   * tear down. Throws {@link VoiceOverUnsupportedPlatformError} on non-darwin.
   */
  start(opts?: VoiceOverOptions): Promise<ScreenReaderHandle>;
  /**
   * Decrement the singleton's refcount; on the last `end()`, calls
   * `handle.end()` followed by `handle.deinit()`. No-op (does not throw) when
   * no singleton is active — safe to call in `afterAll` even if `beforeAll`
   * never ran.
   */
  end(): Promise<void>;
}

/**
 * Construct a VoiceOver ScreenReaderHandle.
 *
 * Plan 03-05 wired the "voiceover" entry into the Zig registry and this factory
 * now resolves to the real driver on darwin. On non-darwin hosts we throw at
 * construction time rather than DriverNotFoundError at start() — earlier signal,
 * same outcome.
 *
 * Prefer {@link VoiceOverFn.start}/{@link VoiceOverFn.end} for test-file
 * lifecycle; the factory form is for callers that want explicit ownership
 * of the handle (multiple concurrent handles, non-test use).
 */
function voiceOverFactory(opts: VoiceOverOptions = {}): ScreenReaderHandle {
  if (process.platform !== 'darwin') {
    throw new VoiceOverUnsupportedPlatformError(process.platform);
  }
  return createDriverHandle({
    driverName: 'voiceover',
    logBufferSize: opts.logBufferSize,
  });
}

// ---------------------------------------------------------------------------
// Process-singleton for the convenience API (Phase 7 Decision D-03)
//
// Refcount model mirrors shoki/vitest's SessionStore (VITEST-05): the first
// start() boots the driver; subsequent starts return the same handle and
// bump a refcount. The last end() tears the handle down (stop + deinit).
// end() without a prior start() is a no-op — matches the "afterAll is safe
// to run even if beforeAll was skipped" contract.
//
// NOT safe for cross-process sharing — each Node process has its own module
// instance and therefore its own singleton.
// ---------------------------------------------------------------------------

let singletonHandle: ScreenReaderHandle | null = null;
let singletonRefcount = 0;

async function startSingleton(opts: VoiceOverOptions = {}): Promise<ScreenReaderHandle> {
  if (process.platform !== 'darwin') {
    throw new VoiceOverUnsupportedPlatformError(process.platform);
  }
  if (singletonHandle === null) {
    singletonHandle = createDriverHandle({
      driverName: 'voiceover',
      logBufferSize: opts.logBufferSize,
    });
    try {
      await singletonHandle.start();
    } catch (err) {
      // Failed to boot — drop the handle so the next start() retries from
      // scratch and the refcount stays at 0.
      singletonHandle = null;
      throw err;
    }
  }
  singletonRefcount += 1;
  return singletonHandle;
}

async function endSingleton(): Promise<void> {
  if (singletonHandle === null) return; // no-op when nothing to tear down
  singletonRefcount = Math.max(0, singletonRefcount - 1);
  if (singletonRefcount === 0) {
    const h = singletonHandle;
    singletonHandle = null;
    try {
      await h.end();
    } finally {
      await h.deinit();
    }
  }
}

/**
 * VoiceOver entry point. See {@link VoiceOverFn} for the full surface.
 */
export const voiceOver: VoiceOverFn = Object.assign(voiceOverFactory, {
  start: startSingleton,
  end: endSingleton,
});
