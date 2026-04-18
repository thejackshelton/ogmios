import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);

/**
 * End-to-end integration test — ROADMAP SC-1.
 *
 * Boots real VoiceOver via `voiceOver({...})`, emits a `say` announcement,
 * and asserts events from BOTH the applescript and ax capture paths arrive
 * in the listen() stream.
 *
 * Gate: darwin + OGMIOS_INTEGRATION=1 + OGMIOS_NATIVE_BUILT=1.
 * TCC accessibility permission for Terminal/IDE required on first run.
 */
const skipReason = (() => {
  if (process.platform !== 'darwin') return `platform=${process.platform}, need darwin`;
  if (process.env.OGMIOS_INTEGRATION !== '1') return 'OGMIOS_INTEGRATION != 1';
  if (process.env.OGMIOS_NATIVE_BUILT !== '1') return 'OGMIOS_NATIVE_BUILT != 1';
  return null;
})();

if (skipReason) {
  // eslint-disable-next-line no-console
  console.log(`[integration] skipping: ${skipReason}`);
}

const maybeDescribe = skipReason ? describe.skip : describe;

maybeDescribe('VoiceOver integration — dual capture (ROADMAP SC-1)', () => {
  it(
    'say triggers events from BOTH applescript and ax sources within 10s',
    async () => {
      const { voiceOver } = await import('../../src/index.js');
      const handle = voiceOver({
        mute: true,
        speechRate: 90,
        takeOverExisting: true,
        logBufferSize: 1000,
      });
      await handle.start();

      try {
        const announcement = `ogmios integration ${Date.now()}`;
        // Kick off `say` — not awaited; we want to listen concurrently.
        void execFileP('/usr/bin/say', ['-v', 'Alex', announcement]).catch(() => undefined);

        const deadline = Date.now() + 10_000;
        let applescriptSeen = false;
        let axSeen = false;

        for await (const event of handle.listen()) {
          if (event.source === 'applescript') applescriptSeen = true;
          if (event.source === 'ax') axSeen = true;
          if (applescriptSeen && axSeen) break;
          if (Date.now() > deadline) break;
        }

        expect(applescriptSeen, 'did not capture from applescript path within 10s').toBe(true);
        expect(axSeen, 'did not capture from ax path within 10s').toBe(true);
      } finally {
        await handle.stop();
        await handle.deinit();
      }
    },
    30_000,
  );

  it(
    'listen() events have phrase, source, tsNanos (bigint), and flags',
    async () => {
      const { voiceOver } = await import('../../src/index.js');
      const handle = voiceOver({ mute: true, takeOverExisting: true });
      await handle.start();

      try {
        void execFileP('/usr/bin/say', ['-v', 'Alex', 'hello ogmios shape check']).catch(
          () => undefined,
        );
        const stable = await handle.awaitStableLog({ quietMs: 500 });
        expect(stable.length).toBeGreaterThan(0);

        const first = stable[0];
        expect(first).toBeDefined();
        expect(typeof first?.phrase).toBe('string');
        expect(typeof first?.tsNanos).toBe('bigint');
        expect(['applescript', 'ax', 'caption', 'commander', 'noop']).toContain(first?.source);
        expect(typeof first?.flags).toBe('number');
      } finally {
        await handle.stop();
        await handle.deinit();
      }
    },
    30_000,
  );
});
