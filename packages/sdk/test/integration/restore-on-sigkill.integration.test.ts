/**
 * SIGKILL crash-recovery integration test — Plan 07-05.
 *
 * Verifies the SIGKILL-robust settings-restore path: because SIGKILL is
 * unhandleable, Zig's signal handlers (lifecycle.installExitHooks) do NOT
 * run. The only recovery mechanism is the on-disk snapshot file that
 * lifecycle.writeSnapshotFile persists inside voiceOver.start(). The
 * `shoki restore-vo-settings` CLI reads that file and re-applies every key.
 *
 * Sequence:
 *   1. Snapshot all 9 VO plist keys (reference).
 *   2. Fork sigkill-child.ts with $SHOKI_SNAPSHOT_PATH pointing at a
 *      tempfile. Wait for "started" IPC — means voiceOver.start() finished
 *      AND the snapshot file was written.
 *   3. Assert the snapshot file exists and has _shoki_snapshot_version.
 *   4. SIGKILL the child; wait for exit.
 *   5. Assert at least one plist key currently differs from the pre-test
 *      snapshot (proves shoki actually altered settings before the kill).
 *   6. Run `shoki restore-vo-settings --path <tempfile>`.
 *   7. Re-read all 9 plist keys; assert equality with step 1.
 *   8. Assert pgrep VoiceOver is empty (no ghost VO).
 *
 * Gate: darwin + SHOKI_INTEGRATION=1 + SHOKI_NATIVE_BUILT=1.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { readSnapshot, waitForVOExit } from '../helpers/plist-verify.js';

const execFileP = promisify(execFile);

/** Run a command; return { stdout, stderr, exitCode } — never throws. */
async function runCmd(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileP(cmd, args);
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    return {
      stdout: typeof e.stdout === 'string' ? e.stdout : '',
      stderr: typeof e.stderr === 'string' ? e.stderr : '',
      exitCode: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

const skipReason = (() => {
  if (process.platform !== 'darwin') return `platform=${process.platform}, need darwin`;
  if (process.env.SHOKI_INTEGRATION !== '1') return 'SHOKI_INTEGRATION != 1';
  if (process.env.SHOKI_NATIVE_BUILT !== '1') return 'SHOKI_NATIVE_BUILT != 1';
  return null;
})();

if (skipReason) {
  // eslint-disable-next-line no-console
  console.log(`[restore-on-sigkill] skipping: ${skipReason}`);
}

const maybeDescribe = skipReason ? describe.skip : describe;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// packages/sdk/test/integration -> packages/doctor/dist/cli.js
const CLI_PATH = resolve(__dirname, '..', '..', '..', 'doctor', 'dist', 'cli.js');

maybeDescribe('restore-on-sigkill (Plan 07-05 CONTEXT.md § Settings restore)', () => {
  it(
    'SIGKILL crash → shoki restore-vo-settings restores all 9 plist keys',
    async () => {
      // 1. Reference snapshot of all 9 keys before we do anything.
      const before = await readSnapshot();
      expect(Object.keys(before)).toHaveLength(9);

      // Tempfile for the snapshot — keeps ~/.shoki/vo-snapshot.plist untouched.
      const tmpRoot = mkdtempSync(join(tmpdir(), 'shoki-sigkill-'));
      const snapshotPath = join(tmpRoot, 'vo-snapshot.plist');

      const childPath = fileURLToPath(
        new URL('../fixtures/sigkill-child.ts', import.meta.url),
      );
      const child = spawn(process.execPath, ['--import', 'tsx/esm', childPath], {
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        env: { ...process.env, SHOKI_SNAPSHOT_PATH: snapshotPath },
      });

      try {
        // 2. Wait for "started" IPC (voiceOver.start() completed + snapshot
        // file written by lifecycle.writeSnapshotFile).
        const started = await new Promise<boolean>((resolvePromise) => {
          const timer = setTimeout(() => resolvePromise(false), 30_000);
          child.on('message', (m) => {
            if (m === 'started') {
              clearTimeout(timer);
              resolvePromise(true);
            }
          });
          child.on('exit', () => {
            clearTimeout(timer);
            resolvePromise(false);
          });
        });
        if (!started) {
          child.kill('SIGKILL');
          throw new Error('sigkill-child never reported started');
        }

        // 3. Snapshot file must exist with the magic version key.
        expect(existsSync(snapshotPath)).toBe(true);
        const xml = readFileSync(snapshotPath, 'utf8');
        expect(xml).toContain('_shoki_snapshot_version');
        expect(xml).toContain('<key>SCREnableAppleScript</key>');

        // 4. SIGKILL. Unhandleable — Zig exit hooks do NOT run.
        child.kill('SIGKILL');
        await new Promise<void>((resolvePromise) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            return resolvePromise();
          }
          child.on('exit', () => resolvePromise());
        });

        // 5. At least one plist key currently differs from pre-test — proves
        // shoki actually wrote its defaults before the kill. (Some keys may
        // legitimately match if the user already had shoki's default value.)
        const mid = await readSnapshot();
        const anyChanged = Object.keys(before).some((k) => before[k] !== mid[k]);
        expect(
          anyChanged,
          'no plist key differed from pre-test — shoki never wrote its defaults?',
        ).toBe(true);

        // 6. Restore via the CLI, explicit --path to our tempfile.
        const restoreResult = await runCmd('node', [
          CLI_PATH,
          'restore-vo-settings',
          '--path',
          snapshotPath,
        ]);
        expect(restoreResult.exitCode).toBe(0);
        expect(restoreResult.stdout).toContain('Restored');

        // 7. Every key matches the pre-test snapshot again.
        const after = await readSnapshot();
        expect(
          after,
          'plist not restored to pre-test state after `shoki restore-vo-settings`',
        ).toEqual(before);

        // 8. pgrep -x VoiceOver must be empty. The SIGKILLed child left no
        // process running (shell was killed), but VoiceOver may still be
        // running — best-effort kill it and confirm.
        await runCmd('/usr/bin/pkill', ['-9', '-x', 'VoiceOver']);
        const voExited = await waitForVOExit(5_000);
        expect(voExited).toBe(true);
      } finally {
        if (!child.killed) child.kill('SIGKILL');
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
