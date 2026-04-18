import { describe, expect, it } from 'vitest';

/**
 * Stress test — CAP-07 droppedCount observability.
 *
 * Pushes 10,000+ events through the driver's ring buffer via a real
 * voiceOver() handle. Expects droppedCount > 0 (overflow observable),
 * no OOM, no crash.
 *
 * Gated by MUNADI_INTEGRATION=1 + darwin + MUNADI_NATIVE_BUILT=1 — the
 * stress run requires the real native binding. Without the env vars
 * this file runs zero assertions and prints a skip reason.
 */

const skipReason = (() => {
  if (process.platform !== 'darwin') return `platform=${process.platform}, need darwin`;
  if (process.env.MUNADI_INTEGRATION !== '1') return 'MUNADI_INTEGRATION != 1';
  if (process.env.MUNADI_NATIVE_BUILT !== '1') return 'MUNADI_NATIVE_BUILT != 1';
  return null;
})();

if (skipReason) {
  // eslint-disable-next-line no-console
  console.log(`[stress] skipping: ${skipReason}`);
}

const maybeDescribe = skipReason ? describe.skip : describe;

maybeDescribe('stress: 10k-event ring overflow (CAP-07)', () => {
  it(
    'drops old entries when more than capacity events arrive; droppedCount > 0; heap bounded',
    async () => {
      // Dynamic import so the factory load doesn't blow up on non-darwin hosts
      // during test collection.
      const { voiceOver } = await import('../src/index.js');
      const handle = voiceOver({
        mute: true,
        speechRate: 90,
        logBufferSize: 100, // small ring to guarantee overflow
      });

      const heapStart = process.memoryUsage().heapUsed;
      await handle.start();

      try {
        // Preferred path: a debug binding call that injects N synthetic events
        // without needing a live VoiceOver. If the binding doesn't expose it
        // (Plan 05 didn't ship the N-API surface for debugInjectEvents), fall
        // back to the slow `say` loop — which we bound to 2k iterations under
        // the 120s timeout rather than the full 10k so the test still completes.
        const mod = (await import('../src/index.js')) as unknown as {
          __debugInjectEvents?: (count: number) => number;
        };
        if (typeof mod.__debugInjectEvents === 'function') {
          const injected = mod.__debugInjectEvents(10_000);
          expect(injected).toBeGreaterThanOrEqual(10_000);
        } else {
          // eslint-disable-next-line no-console
          console.log('[stress] __debugInjectEvents not available — falling back to say loop');
          const { spawn } = await import('node:child_process');
          // 2000 iterations — enough to overflow a 100-cap ring many times.
          for (let i = 0; i < 2000; i++) {
            const child = spawn('/usr/bin/say', ['-o', '/dev/null', `x${i}`]);
            await new Promise<void>((resolve) => {
              child.on('exit', () => resolve());
              child.on('error', () => resolve());
            });
          }
        }

        await handle.awaitStableLog({ quietMs: 500 });
        const dropped = await handle.droppedCount();
        expect(Number(dropped)).toBeGreaterThan(0);

        // Heap guard — 500MB ceiling. Anything near this is an OOM risk.
        const heapUsed = process.memoryUsage().heapUsed;
        expect(heapUsed - heapStart).toBeLessThan(500 * 1024 * 1024);
      } finally {
        await handle.stop();
        await handle.deinit();
      }
    },
    120_000,
  );
});
