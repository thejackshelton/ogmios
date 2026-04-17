/**
 * Crash-recovery fixture — Plan 07's crash-recovery test forks this script,
 * waits for the "started" message, then SIGTERMs the child. The parent then
 * verifies VO was killed and the plist was restored.
 *
 * SIGKILL is documented as a known limitation (unhandleable — Zig exit hooks
 * cannot run). SIGTERM is the case we mitigate via lifecycle.installExitHooks.
 */
import { voiceOver } from '../../src/index.js';

const handle = voiceOver({ mute: true, speechRate: 90 });
await handle.start();
process.send?.('started');

// Spin — parent will SIGTERM.
await new Promise<void>(() => {});
