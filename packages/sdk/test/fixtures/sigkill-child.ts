/**
 * SIGKILL-recovery fixture — Plan 07-05.
 *
 * Parent test (`packages/sdk/test/integration/restore-on-sigkill.integration.
 * test.ts`) forks this file, waits for the "started" IPC message, then sends
 * SIGKILL. SIGKILL is unhandleable by any user process — Zig's signal
 * handlers (lifecycle.installExitHooks on SIGINT/SIGTERM/SIGHUP) do NOT run.
 * The ONLY recovery path is the on-disk snapshot file that
 * lifecycle.writeSnapshotFile persisted inside voiceOver.start(). The parent
 * then invokes `shoki restore-vo-settings --path <fixture-tempfile>` and
 * asserts every plist key returned to its pre-test value.
 *
 * The child honors $SHOKI_SNAPSHOT_PATH so the parent can point it at a
 * tempfile and avoid polluting the user's ~/.shoki/vo-snapshot.plist.
 */
import { voiceOver } from '../../src/index.js';

const handle = voiceOver({ mute: true, speechRate: 90 });
await handle.start();
process.send?.('started');

// Spin — parent will SIGKILL. SIGKILL cannot be trapped so no cleanup runs;
// the on-disk snapshot is the only recovery state at this point.
await new Promise<void>(() => {});
