# `ogmios/vitest`

Vitest browser-mode integration. Three pieces:

- **`ogmiosVitest()`** plugin factory — Vitest config plugin that registers BrowserCommands + auto-sets `singleThread`.
- **`ogmios/vitest/browser`** — browser-safe API (`voiceOver.start()`, `session.awaitStable()`).
- **`ogmios/vitest/setup`** — `expect.extend(...)` setup file wiring Ogmios's matchers (from `ogmios/matchers`) into Vitest's `expect`.

For a narrative introduction see [Vitest quickstart](/getting-started/vitest-quickstart). This page is the API reference.

## `ogmiosVitest(options?)`

Vitest plugin factory. Register in `plugins:`.

```ts
// vitest.config.ts
import { ogmiosVitest } from "ogmios/vitest";

export default defineConfig({
  plugins: [ogmiosVitest()],
});
```

### `OgmiosVitestOptions`

```ts
interface OgmiosVitestOptions {
  /**
   * Override the automatic singleThread detection. Default: auto —
   * enabled when any browser-side file imports `ogmios/vitest/browser`.
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
   - `ogmiosStart`
   - `ogmiosStop`
   - `ogmiosReset`
   - `ogmiosClear`
   - `ogmiosListen`
   - `ogmiosDrain`
   - `ogmiosPhraseLog`
   - `ogmiosLastPhrase`
   - `ogmiosAwaitStable`
   - `ogmiosDropped`
2. Scans test files for imports of `ogmios/vitest/browser`. If found, sets `poolOptions.threads.singleThread = true` — VoiceOver is a system singleton.
3. Throws `OgmiosConcurrentTestError` at the first `test.concurrent(...)` in any VO-scoped file. VO can't be parallelized safely.

## Browser-side API

```ts
import { voiceOver } from "ogmios/vitest/browser";
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
}): Promise<OgmiosSession>;
```

Boots VoiceOver via the Node-side `SessionStore`. Returns a browser-side [`OgmiosSession`](#ogmiossession) handle identified by a string session id.

### `OgmiosSession`

```ts
interface OgmiosSession {
  readonly id: string;
  readonly log: WireOgmiosEvent[];  // live reference; grows as events arrive

  stop(): Promise<void>;
  reset(): Promise<void>;
  clear(): Promise<void>;

  drain(): Promise<WireOgmiosEvent[]>;
  phraseLog(): Promise<string[]>;
  lastPhrase(): Promise<string | null>;

  awaitStable(opts: { quietMs: number; timeoutMs?: number }): Promise<WireOgmiosEvent[]>;

  readonly droppedCount: number;
}
```

Every method dispatches to a corresponding `BrowserCommand` on the Node side.

### `WireOgmiosEvent`

Structured-clone-safe variant of `OgmiosEvent`. Timestamps are milliseconds as `number`, not `bigint`.

```ts
interface WireOgmiosEvent {
  phrase: string;
  tsMs: number;
  source: "applescript" | "ax";
  interrupt?: boolean;
  role?: string;
  name?: string;
}
```

All four Ogmios matchers (at `ogmios/matchers`, wired through `ogmios/vitest/setup`) accept `WireOgmiosEvent[]` transparently, so test code stays uniform across browser and Node contexts.

## BrowserCommands

For direct use from advanced tests that bypass the `voiceOver.*` wrappers:

```ts
import { commands } from "@vitest/browser/context";

await commands.ogmiosStart({ mute: true });
await commands.ogmiosDrain(sessionId);
```

| Command | Node-side handler | Returns |
|---------|-------------------|---------|
| `ogmiosStart(options)` | Boot VO, register session | `{ sessionId: string }` |
| `ogmiosStop(sessionId)` | Decrement refcount, maybe kill | `void` |
| `ogmiosReset(sessionId)` | VO `.reset()` | `void` |
| `ogmiosClear(sessionId)` | Empty log | `void` |
| `ogmiosListen(sessionId)` | Iterator head (next event) | `WireOgmiosEvent \| null` |
| `ogmiosDrain(sessionId)` | Drain + clear | `WireOgmiosEvent[]` |
| `ogmiosPhraseLog(sessionId)` | Flat log | `string[]` |
| `ogmiosLastPhrase(sessionId)` | Most recent phrase | `string \| null` |
| `ogmiosAwaitStable(sessionId, opts)` | Poll until stable | `WireOgmiosEvent[]` |
| `ogmiosDropped(sessionId)` | Ring-buffer drop count | `number` |

All return payloads are structured-clone-safe: plain objects, `number` timestamps, `null` instead of `undefined`. The Vitest RPC layer structured-clones payloads, so `Date`, `bigint`, and `undefined` would error at the boundary — we convert at the Node side.

## SessionStore (Node side)

The plugin owns a single Node-side `SessionStore` that refcounts VO boots across test files. You don't interact with it directly, but it's good to know:

- First `ogmiosStart` boots VO via `ogmios`.
- Subsequent `ogmiosStart` calls (even from different test files) reuse the existing handle and increment the refcount.
- Last `ogmiosStop` decrements to zero, kills VO, and restores the 9-key plist snapshot.
- Between tests, `session.reset()` is cheap and keeps the boot alive.

This lets a full Vitest run share a single VO boot across dozens of test files — massive perf win.

## Errors

| Error | Thrown when |
|-------|-------------|
| `OgmiosConcurrentTestError` | `test.concurrent` used in a VO-scoped file. |
| `OgmiosPlatformUnsupportedError` | Non-darwin host. |
| `OgmiosSessionNotFoundError` | Session id unknown (already stopped, or never existed). |
| `OgmiosBindingNotAvailableError` | Native binding didn't load on the Node side. |

## Caveats

- **Single-threaded only** — `poolOptions.threads.singleThread = true` is required for VO. The plugin sets it automatically when it detects the import; you can opt out via `singleThread: false` if you know what you're doing (e.g. tests that only use ogmios on the Node side).
- **tinyRPC has finite throughput** — for tests that stream thousands of events, prefer `drain()` over `listen()`-style per-event dispatch.
- **`session.log` live reference** — mutated by the plugin as events arrive. Useful for `toHaveStableLog` but surprising if you expect a snapshot.

## See also

- [Vitest quickstart](/getting-started/vitest-quickstart)
- [`ogmios`](/api/sdk) — the Node-side API this wraps.
- [Matchers API](/api/matchers) — `ogmios/matchers` (pure fns) + `ogmios/vitest/setup` (wiring).
