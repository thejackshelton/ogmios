# `@shoki/vitest`

Vitest browser-mode integration. Three pieces:

- **`shokiVitest()`** plugin factory — Vitest config plugin that registers BrowserCommands + auto-sets `singleThread`.
- **`@shoki/vitest/browser`** — browser-safe API (`voiceOver.start()`, `session.awaitStable()`).
- **`@shoki/vitest/setup`** — `expect.extend(...)` setup file wiring Shoki's matchers (from `@shoki/sdk/matchers`) into Vitest's `expect`.

For a narrative introduction see [Vitest quickstart](/getting-started/vitest-quickstart). This page is the API reference.

## `shokiVitest(options?)`

Vitest plugin factory. Register in `plugins:`.

```ts
// vitest.config.ts
import { shokiVitest } from "@shoki/vitest";

export default defineConfig({
  plugins: [shokiVitest()],
});
```

### `ShokiVitestOptions`

```ts
interface ShokiVitestOptions {
  /**
   * Override the automatic singleThread detection. Default: auto —
   * enabled when any browser-side file imports `@shoki/vitest/browser`.
   */
  singleThread?: boolean | "auto";

  /**
   * Maximum time to wait for a BrowserCommand to complete. Default: 30_000.
   */
  commandTimeoutMs?: number;
}
```

### What the plugin does at config time

1. Registers 10 `BrowserCommand`s on the Vitest server:
   - `shokiStart`
   - `shokiStop`
   - `shokiReset`
   - `shokiClear`
   - `shokiListen`
   - `shokiDrain`
   - `shokiPhraseLog`
   - `shokiLastPhrase`
   - `shokiAwaitStable`
   - `shokiDropped`
2. Scans test files for imports of `@shoki/vitest/browser`. If found, sets `poolOptions.threads.singleThread = true` — VoiceOver is a system singleton.
3. Throws `ShokiConcurrentTestError` at the first `test.concurrent(...)` in any VO-scoped file. VO can't be parallelized safely.

## Browser-side API

```ts
import { voiceOver } from "@shoki/vitest/browser";
```

This is a **browser-safe** module — never imports Node-only code. Every method dispatches over tinyRPC to a Node-side handler.

### `voiceOver.start(options?)`

```ts
voiceOver.start(options?: {
  mute?: boolean;
  speechRate?: number;
  takeOverExisting?: boolean;
  timeoutMs?: number;
  logBufferSize?: number;
}): Promise<ShokiSession>;
```

Boots VoiceOver via the Node-side `SessionStore`. Returns a browser-side [`ShokiSession`](#shokisession) handle identified by a string session id.

### `ShokiSession`

```ts
interface ShokiSession {
  readonly id: string;
  readonly log: WireShokiEvent[];  // live reference; grows as events arrive

  stop(): Promise<void>;
  reset(): Promise<void>;
  clear(): Promise<void>;

  drain(): Promise<WireShokiEvent[]>;
  phraseLog(): Promise<string[]>;
  lastPhrase(): Promise<string | null>;

  awaitStable(opts: { quietMs: number; timeoutMs?: number }): Promise<WireShokiEvent[]>;

  readonly droppedCount: number;
}
```

Every method dispatches to a corresponding `BrowserCommand` on the Node side.

### `WireShokiEvent`

Structured-clone-safe variant of `ShokiEvent`. Timestamps are milliseconds as `number`, not `bigint`.

```ts
interface WireShokiEvent {
  phrase: string;
  tsMs: number;
  source: "applescript" | "ax";
  interrupt?: boolean;
  role?: string;
  name?: string;
}
```

All four Shoki matchers (at `@shoki/sdk/matchers`, wired through `@shoki/vitest/setup`) accept `WireShokiEvent[]` transparently, so test code stays uniform across browser and Node contexts.

## BrowserCommands

For direct use from advanced tests that bypass the `voiceOver.*` wrappers:

```ts
import { commands } from "@vitest/browser/context";

await commands.shokiStart({ mute: true });
await commands.shokiDrain(sessionId);
```

| Command | Node-side handler | Returns |
|---------|-------------------|---------|
| `shokiStart(options)` | Boot VO, register session | `{ sessionId: string }` |
| `shokiStop(sessionId)` | Decrement refcount, maybe kill | `void` |
| `shokiReset(sessionId)` | VO `.reset()` | `void` |
| `shokiClear(sessionId)` | Empty log | `void` |
| `shokiListen(sessionId)` | Iterator head (next event) | `WireShokiEvent \| null` |
| `shokiDrain(sessionId)` | Drain + clear | `WireShokiEvent[]` |
| `shokiPhraseLog(sessionId)` | Flat log | `string[]` |
| `shokiLastPhrase(sessionId)` | Most recent phrase | `string \| null` |
| `shokiAwaitStable(sessionId, opts)` | Poll until stable | `WireShokiEvent[]` |
| `shokiDropped(sessionId)` | Ring-buffer drop count | `number` |

All return payloads are structured-clone-safe: plain objects, `number` timestamps, `null` instead of `undefined`. The Vitest RPC layer structured-clones payloads, so `Date`, `bigint`, and `undefined` would error at the boundary — we convert at the Node side.

## SessionStore (Node side)

The plugin owns a single Node-side `SessionStore` that refcounts VO boots across test files. You don't interact with it directly, but it's good to know:

- First `shokiStart` boots VO via `@shoki/sdk`.
- Subsequent `shokiStart` calls (even from different test files) reuse the existing handle and increment the refcount.
- Last `shokiStop` decrements to zero, kills VO, and restores the 9-key plist snapshot.
- Between tests, `session.reset()` is cheap and keeps the boot alive.

This lets a full Vitest run share a single VO boot across dozens of test files — massive perf win.

## Errors

| Error | Thrown when |
|-------|-------------|
| `ShokiConcurrentTestError` | `test.concurrent` used in a VO-scoped file. |
| `ShokiPlatformUnsupportedError` | Non-darwin host. |
| `ShokiSessionNotFoundError` | Session id unknown (already stopped, or never existed). |
| `ShokiBindingNotAvailableError` | Native binding didn't load on the Node side. |

## Caveats

- **Single-threaded only** — `poolOptions.threads.singleThread = true` is required for VO. The plugin sets it automatically when it detects the import; you can opt out via `singleThread: false` if you know what you're doing (e.g. tests that only use shoki on the Node side).
- **tinyRPC has finite throughput** — for tests that stream thousands of events, prefer `drain()` over `listen()`-style per-event dispatch.
- **`session.log` live reference** — mutated by the plugin as events arrive. Useful for `toHaveStableLog` but surprising if you expect a snapshot.

## See also

- [Vitest quickstart](/getting-started/vitest-quickstart)
- [`@shoki/sdk`](/api/sdk) — the Node-side API this wraps.
- [Matchers API](/api/matchers) — `@shoki/sdk/matchers` (pure fns) + `@shoki/vitest/setup` (wiring).
