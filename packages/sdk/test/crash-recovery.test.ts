import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readSnapshot, waitForVOExit } from './helpers/plist-verify.js';

/**
 * Crash-recovery test — ROADMAP SC-2 + CAP-14.
 *
 * Forks a child process (packages/sdk/test/fixtures/crash-child.ts) that
 * starts VoiceOver and idles. Parent SIGTERMs the child; Zig's signal
 * handlers (lifecycle.installExitHooks) should call crashRestore, which
 * restores the plist and force-kills VO.
 *
 * Gate: darwin + OGMIOS_INTEGRATION=1 + OGMIOS_NATIVE_BUILT=1.
 *
 * A separate `it.skip` documents the SIGKILL limitation — SIGKILL is
 * unhandleable by any user process, so Zig exit hooks cannot run. The only
 * mitigation is out-of-band supervision (e.g. a watchdog daemon) — out of
 * scope for Phase 3.
 *
 * Plist verification uses `defaults read` via helpers/plist-verify.ts — the
 * helper snapshots each of the 9 plist keys before and after the test and
 * asserts byte-for-byte equality.
 */
const skipReason = (() => {
  if (process.platform !== 'darwin') return `platform=${process.platform}, need darwin`;
  if (process.env.OGMIOS_INTEGRATION !== '1') return 'OGMIOS_INTEGRATION != 1';
  if (process.env.OGMIOS_NATIVE_BUILT !== '1') return 'OGMIOS_NATIVE_BUILT != 1';
  return null;
})();

if (skipReason) {
  // eslint-disable-next-line no-console
  console.log(`[crash-recovery] skipping: ${skipReason}`);
}

const maybeDescribe = skipReason ? describe.skip : describe;

maybeDescribe('crash-recovery (CAP-14, ROADMAP SC-2)', () => {
  it(
    'SIGTERM mid-capture: VO force-killed + plist restored by Zig exit hooks',
    async () => {
      const before = await readSnapshot();
      expect(Object.keys(before)).toHaveLength(9);

      const childPath = fileURLToPath(new URL('./fixtures/crash-child.ts', import.meta.url));
      const child = spawn(process.execPath, ['--import', 'tsx/esm', childPath], {
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        env: { ...process.env },
      });

      // Wait for "started" IPC message.
      const started = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 30_000);
        child.on('message', (m) => {
          if (m === 'started') {
            clearTimeout(timer);
            resolve(true);
          }
        });
        child.on('exit', () => {
          clearTimeout(timer);
          resolve(false);
        });
      });

      if (!started) {
        child.kill('SIGKILL');
        throw new Error('crash-child never reported started');
      }

      // SIGTERM — triggers Zig's signal handler path (lifecycle.signalHandler →
      // crashRestore). SIGTERM is handleable, unlike SIGKILL.
      child.kill('SIGTERM');

      // Wait up to 10s for child to exit AND VO to be reaped.
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.on('exit', () => resolve());
      });

      const voExited = await waitForVOExit(10_000);
      expect(voExited, 'VO still running after child SIGTERM — exit hook did not run').toBe(true);

      const after = await readSnapshot();
      expect(after, 'plist not restored to pre-test state after child SIGTERM').toEqual(before);
    },
    60_000,
  );

  it.skip('SIGKILL leaves VO running — documented limitation (use SIGTERM or a watchdog)', () => {
    // SIGKILL is unhandleable by any user process. Zig's signal handlers
    // (lifecycle.installExitHooks) only trap SIGINT, SIGTERM, SIGHUP.
    // A production Ogmios deployment that needs SIGKILL resilience must run
    // a watchdog (e.g. launchd KeepAlive) that reaps orphaned VO + restores
    // plist state out-of-band. That's a Phase 5 (CI/tart) concern, not v1.
  });
});
