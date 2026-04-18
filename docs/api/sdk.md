# `shoki`

Core TypeScript SDK. Public API surface for booting a screen reader, reading structured events, and running the `shoki` CLI. Ships three entry points:

| Entry | Import | Purpose |
|-------|--------|---------|
| **Root** | `shoki` | `voiceOver()` factory, `ScreenReaderHandle`, event types. |
| **Matchers** | `shoki/matchers` | Framework-agnostic matcher functions (pure assertion logic). See [Matchers API](/api/matchers). |
| **CLI library** | `shoki/cli` | Library exports for `shoki` CLI internals (`runDoctor`, `applyFixActions`, report types). See [CLI API](/api/cli). |
| **Binary** | `bin: shoki` | CLI entry (`./dist/cli/main.js`). Installed on PATH via `npx shoki …`. |

```ts
import { voiceOver } from "shoki";
```

The `voiceOver` factory returns a [`ScreenReaderHandle`](#screenreaderhandle) — the uniform interface implemented by every driver (VoiceOver in v1; NVDA, Orca planned). Because it's a driver factory pattern, swapping screen readers in the future is a one-line change at the import site.

## `voiceOver(options?)`

Creates a VoiceOver `ScreenReaderHandle`. Does **not** boot VoiceOver; call `.start()` for that.

```ts
function voiceOver(options?: ScreenReaderOptions): ScreenReaderHandle;
```

`voiceOver` is callable (factory) **and** a namespace — it also exposes the top-level [`voiceOver.start()` / `voiceOver.end()`](#top-level-convenience-start--end) convenience API that manages a process-singleton handle for the common one-session-per-test-file case.

### Top-level convenience: `start()` / `end()`

Use these when you want ONE VoiceOver session scoped to a test file (the most common shape). They manage a refcounted process-singleton internally — you don't thread a handle through `beforeAll`/`afterAll` yourself.

```ts
import { voiceOver } from "shoki";
import { beforeAll, afterAll, beforeEach } from "vitest";

beforeAll(async () => {
  await voiceOver.start({ mute: true });
}, 30_000);

afterAll(async () => {
  await voiceOver.end();
});

// Between tests — cheap ring-clear + VO-cursor reset, no respawn:
beforeEach(async () => {
  const handle = await voiceOver.start(); // reuses singleton
  await handle.reset();
});
```

- `voiceOver.start(opts?)` — boots VoiceOver on first call; subsequent calls return the same handle reference and bump a refcount. Throws `VoiceOverUnsupportedPlatformError` on non-darwin.
- `voiceOver.end()` — decrements the refcount; on the last `end()`, stops VoiceOver and deinits the handle. **No-op** (does not throw) if no singleton is active — safe to call in `afterAll` even when `beforeAll` was skipped.
- Need multiple concurrent handles? Call `voiceOver(opts)` as a factory — that form is always available and sidesteps the singleton entirely.

### `ScreenReaderOptions`

```ts
interface ScreenReaderOptions {
  /** Mute VO speaker output. Default: false. */
  mute?: boolean;

  /** Speech rate 0-100. Default: system default (~50). Set high for faster tests. */
  speechRate?: number;

  /**
   * If VO is already running when `.start()` is called, take over the existing
   * instance (reconfigure) rather than refusing. Default: true.
   */
  takeOverExisting?: boolean;

  /** Timeout in ms for .start(). Default: 10_000. */
  timeout?: number;

  /**
   * Ring buffer capacity for captured events. Overflow increments droppedCount;
   * it is never silent. Default: 10_000.
   */
  logBufferSize?: number;
}
```

## `ScreenReaderHandle`

Uniform lifecycle + capture interface. Implemented by the VoiceOver driver today; future drivers share this shape verbatim.

```ts
interface ScreenReaderHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  end(): Promise<void>; // v1+: alias for stop()
  reset(): Promise<void>;
  clear(): Promise<void>;

  listen(): AsyncIterator<ShokiEvent>;
  drain(): Promise<ShokiEvent[]>;
  phraseLog(): string[];
  lastPhrase(): string | null;
  awaitStableLog(options: { quietMs: number; timeoutMs?: number }): Promise<ShokiEvent[]>;

  readonly running: boolean;
  readonly droppedCount: number;
}
```

### `start()`

Boots the screen reader. Idempotent — calling `.start()` when already running refcount-increments rather than re-booting.

- Snapshots the 9 VoiceOver plist keys (speech rate, punctuation, hints, verbosity, voice, etc.).
- Configures per-options (mute, speechRate).
- Installs native exit hooks (`exit`, `uncaughtException`, `unhandledRejection`, `SIGINT`, `SIGTERM`) so the plist restores even on crash.
- Resolves when VO is confirmed alive via `pgrep -x VoiceOver`.

### `stop()`

Decrements the refcount. Last stop:

- Force-kills VoiceOver.
- Restores the snapshotted plist keys.
- Verifies `pgrep -x VoiceOver` is empty.
- Drops exit hooks.

### `end()`

**Preferred in v1+.** Identical to `stop()` — both names call the same underlying implementation. Use `end()` for symmetry with `start()`; `stop()` remains available indefinitely for back-compat.

### `reset()`

Returns VO to a clean state **without** restarting. Clears the ring buffer and the phrase log. Cheaper than stop + start between tests.

**Cheap.** Does NOT respawn `osascript` or restart VoiceOver — only clears the native event ring buffer and sends a single AppleScript command to move the VO cursor to the first item of window 1 down the **existing** shell process. Safe to call in `beforeEach` across a long test file.

### `clear()`

Empties the log without any other side effects.

### `listen()`

Returns an async iterator of structured [`ShokiEvent`](#shokievent) objects streamed from the ring buffer as they arrive.

```ts
for await (const event of handle.listen()) {
  console.log(event);
  if (event.phrase.includes("done")) break;
}
```

### `drain()`

Returns all currently-buffered events as `ShokiEvent[]` and clears the buffer. Useful when you want a snapshot rather than a stream.

### `phraseLog()`

Returns the full flat phrase history as `string[]`. Convenience mirror of what Guidepup exposes.

### `lastPhrase()`

Returns the most recent phrase, or `null` if the log is empty.

### `awaitStableLog({ quietMs, timeoutMs? })`

Resolves with the accumulated `ShokiEvent[]` when no new events have arrived for `quietMs` ms. Useful for waiting out a burst of VO activity before asserting.

- Throws if `timeoutMs` (default: 30_000) elapses before stability.

### `droppedCount`

Number of events the ring buffer dropped due to overflow. If this is non-zero, increase `logBufferSize` in `start()` options or drain more frequently.

## `ShokiEvent`

```ts
interface ShokiEvent {
  /** The announced phrase (UTF-8). */
  phrase: string;

  /** Capture timestamp in nanoseconds since Unix epoch. bigint. */
  tsNanos: bigint;

  /** Which capture path produced this event. */
  source: "applescript" | "ax";

  /** True if this announcement interrupted a prior one. Only set by AppleScript path. */
  interrupt?: boolean;

  /** Semantic role when the capture path exposes one. Usually empty for AppleScript; populated by AX. */
  role?: string;

  /** Accessible name when the capture path exposes one. */
  name?: string;
}
```

The browser-side variant (used by `shoki/vitest`'s RPC payloads) uses `tsMs: number` instead of `tsNanos: bigint` — all matchers work against both shapes.

## Keyboard command catalog

Shoki is observe-only by design, but exports a complete catalog of VoiceOver gestures so users can drive VO via their own framework's keyboard driver. 226 VO commands + 129 Commander commands, exported as typed constants.

```ts
import { VoiceOverCommands } from "shoki";

// Example — dispatching "next" via Playwright:
await page.keyboard.press(VoiceOverCommands.next.shortcut);
// VoiceOverCommands.next = { name: "next", shortcut: "Control+Option+ArrowRight", description: "..." }
```

Full catalog shape:

```ts
interface VoiceOverCommand {
  name: string;          // "next", "rotor", etc.
  shortcut: string;      // "Control+Option+ArrowRight"
  description: string;   // human-readable explanation
  category: string;      // "navigation", "interact", "rotor", etc.
}
```

## Errors

All shoki errors extend `ShokiError`.

| Error | Thrown when |
|-------|-------------|
| `ShokiPlatformUnsupportedError` | Called on non-darwin host in v1. |
| `ShokiBindingNotAvailableError` | Platform-specific native binding failed to load. |
| `ShokiVoiceOverUnavailableError` | VO binary not found (should never happen on stock macOS). |
| `ShokiTimeoutError` | `.start()`, `.awaitStableLog()` exceeded their timeout. |
| `ShokiCapturePathFailedError` | Both capture paths failed to initialize (check `shoki doctor`). |

## Caveats

- **VoiceOver is a system singleton.** Running multiple handles simultaneously is unsupported; refcount handles sharing across tests.
- **bigint timestamps** — `tsNanos` is a `bigint`, which does not structured-clone cleanly across all browser/RPC boundaries. `shoki/vitest` converts to `tsMs: number` at the boundary.
- **`role`/`name` may be empty** — the AppleScript capture path doesn't expose these; only the AX-notifications path does. If you're matching on them, prefer `source: "ax"` events.

## See also

- [Matchers API](/api/matchers) — `expect` matchers at `shoki/matchers` (pure fns) + `shoki/vitest/setup` (wiring).
- [`shoki/vitest`](/api/vitest) — Vitest browser-mode integration.
- [`shoki` CLI](/api/cli) — doctor / setup / info / restore-vo-settings subcommands.
- [Adding a screen reader driver](/background/adding-a-driver) — the same `ScreenReaderHandle` interface is reused.
