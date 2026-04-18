import { describe, expect, it } from 'vitest';
import { createDriverHandle } from '../src/index.js';

const isMac = process.platform === 'darwin';
// End-to-end roundtrip requires the compiled Zig .node — skipped until
// `zig build` has produced it and SHOKI_NATIVE_BUILT=1 is set.
const nativeReady = isMac && !!process.env.SHOKI_NATIVE_BUILT;

// Plan 07-02: previously this test called `voiceOver()` back when it resolved
// to a noop stub. Now that voiceOver() is wired to the real VO driver, we
// exercise the noop driver directly via createDriverHandle so the test
// verifies the native binding without booting a real VoiceOver session
// (which would require TCC permissions + VO-AppleScript-enabled plist).
describe.skipIf(!nativeReady)('noop driver end-to-end via native binding', () => {
  it('start/drain/stop/deinit round-trips through the native binding', async () => {
    const handle = createDriverHandle({ driverName: 'noop' });
    try {
      await handle.start();
      const events = await handle.drain();
      expect(events.length).toBeGreaterThanOrEqual(1);
      const first = events[0];
      expect(first).toBeDefined();
      expect(first?.phrase).toBe('noop-ping');
      expect(first?.source).toBe('noop');
      expect(typeof first?.tsNanos).toBe('bigint');
      await handle.stop();
    } finally {
      await handle.deinit();
    }
  });

  it('droppedCount returns 0n for an under-filled buffer', async () => {
    const handle = createDriverHandle({ driverName: 'noop' });
    try {
      await handle.start();
      await handle.drain();
      expect(await handle.droppedCount()).toBe(0n);
    } finally {
      await handle.deinit();
    }
  });

  it('reset clears the phraseLog', async () => {
    const handle = createDriverHandle({ driverName: 'noop' });
    try {
      await handle.start();
      await handle.drain();
      expect((await handle.phraseLog()).length).toBeGreaterThan(0);
      await handle.reset();
      // drain() inside phraseLog() produced one new entry after reset
      expect(await handle.phraseLog()).toHaveLength(1);
    } finally {
      await handle.deinit();
    }
  });
});
