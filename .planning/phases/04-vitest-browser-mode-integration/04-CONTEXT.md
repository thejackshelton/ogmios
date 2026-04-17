# Phase 4: Vitest Browser-Mode Integration - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship `@shoki/vitest` (Vitest plugin + BrowserCommands) and `@shoki/matchers` (semantic assertion matchers). Together with `@shoki/sdk` from Phase 3, a user can write a Vitest browser-mode test that drives a real web app, calls `voiceOver.listen()`, and asserts on structured VO events with `expect(log).toHaveAnnounced({ role, name })`. Ship the canonical example repo `examples/vitest-browser-react`.

Out of scope: CI tart image (Phase 5), docs site (Phase 6), Playwright-native fixture (post-v1).

</domain>

<decisions>
## Implementation Decisions

### Two new packages

1. **`@shoki/vitest`** (`packages/vitest/`) — Vitest plugin. Registers `BrowserCommands` that bridge browser-side tests → Node-side `@shoki/sdk` over Vitest's tinyRPC WebSocket.
2. **`@shoki/matchers`** (`packages/matchers/`) — `expect` extensions: `toHaveAnnounced({ role, name, interrupt? })`, `toHaveAnnouncedText(pattern)`, `toHaveNoAnnouncement()`, `toHaveStableLog()`. Works both in node and in the browser (via the `@vitest/browser/context` bridge).

Rationale for splitting: matchers are useful in non-browser tests too (integration tests, Playwright fixtures later). Keeping them independent of Vitest plugin concerns.

### BrowserCommand surface (VITEST-01)

Registered by the Vitest plugin at config-hook time:

- `shokiStart(opts)` — Node-side `voiceOver.start(opts)`, returns `{ sessionId: string }`
- `shokiListen({ sessionId, since })` — drains events since timestamp, returns `ShokiAnnouncement[]`
- `shokiDrain({ sessionId })` — explicit drain (same as listen but returns all current events and clears the buffer)
- `shokiPhraseLog({ sessionId })` — returns full log without clearing
- `shokiLastPhrase({ sessionId })` — returns most recent event or null
- `shokiClear({ sessionId })` — clears log, keeps session alive
- `shokiReset({ sessionId })` — calls voiceOver.reset() for between-test cleanup
- `shokiStop({ sessionId })` — stops the session; refcounted so last caller kills VO
- `shokiAwaitStable({ sessionId, quietMs })` — resolves when no new events for quietMs
- `shokiGetDroppedCount({ sessionId })` — backpressure visibility

Every return payload is structured-clone-safe (plain objects, numeric ts, no Dates/Functions). This is VITEST-06.

### Browser-side API (VITEST-02)

`@shoki/vitest/browser` exports typed wrappers around `commands.*` (from `@vitest/browser/context`):

```typescript
import { voiceOver } from '@shoki/vitest/browser';

const session = await voiceOver.start({ mute: true });
// drive the app with Playwright's built-in commands
await page.getByRole('button', { name: 'Submit' }).click();
const log = await session.awaitStable({ quietMs: 500 });
expect(log).toHaveAnnounced({ role: 'button', name: 'Submit' });
await session.stop();
```

The `session` object is a browser-side proxy that calls the BrowserCommands. It holds the `sessionId` returned from `shokiStart`.

### Singleton Enforcement (VITEST-03, VITEST-04)

- Plugin detects VO scope by scanning test files for `from '@shoki/vitest/browser'` imports during Vitest's `config` hook. If found in ANY test file, the plugin sets `poolOptions.threads.singleThread = true` automatically.
- Users can opt out by setting `poolOptions.threads.singleThread = false` explicitly — the plugin logs a warning.
- `test.concurrent` inside a VO-scoped test: we can't reliably detect this at config time. Instead, the VO session factory on the browser side checks for `vi.getTestMeta()?.concurrent` and throws a typed `ShokiConcurrentTestError` at `voiceOver.start()` time with a clear message: "VO is a system singleton; test.concurrent is not supported. Use test() or it() instead."

### Refcounting (VITEST-05)

- `shokiStart` is idempotent per Vitest test file. First caller boots VO; subsequent callers get a handle to the same session with incremented refcount.
- `shokiStop` decrements. Last caller restores plist + kills VO.
- `shokiReset` is per-test and cheap — fires `VO Utility reset` AppleScript, clears the ring buffer, doesn't restart VO.
- Phase 3's refcount implementation in the Zig lifecycle.zig does the heavy lifting; the plugin just calls start/stop and `shokiReset` between tests.

### `@shoki/matchers` (VITEST-08)

Four matchers, all extending Vitest's `expect`:

```typescript
// Match by semantic event shape
expect(log).toHaveAnnounced({
  role: 'button',
  name: /submit/i,
  source: 'ax', // optional, matches either if omitted
  interrupt: false, // optional
});

// Match by plain text in any event
expect(log).toHaveAnnouncedText(/form submitted/i);

// Assert silence
expect(log).toHaveNoAnnouncement();

// Assert log is stable (no new events in quietMs)
await expect(log).toHaveStableLog({ quietMs: 500 });
```

Matchers must work in both Node and browser contexts. Since they're pure-data assertions (log is a plain `ShokiAnnouncement[]`), this is straightforward.

### Example: `examples/vitest-browser-react` (VITEST-07)

Minimal React app:
- `src/App.tsx` — a form with a Submit button that shows a success toast and an ARIA live region
- `tests/app.test.tsx` — Vitest browser-mode test: render the app, click submit, assert the VO announcement

`vitest.config.ts` uses `@vitest/browser` with Playwright provider + `@shoki/vitest` plugin.

`package.json` scripts:
- `dev` — vite dev server
- `test` — `vitest run --browser.enabled`

README explains the setup and how to run locally + in CI.

### Configuration gating for environments without VO

If `process.platform !== 'darwin'` or if the native binding isn't built (no `.node` loadable), `shokiStart` throws a typed error pointing at `shoki doctor`. The plugin emits a warning at config time if the env won't support VO so users get fail-fast instead of mysterious BrowserCommand failures mid-test.

### Testing Strategy

- **Plugin unit tests (Node, mocked)**: BrowserCommand registration, singleton detection, config mutation
- **Matchers unit tests (Node)**: shape-matching against fixture ShokiAnnouncement[] arrays
- **Example repo E2E test (darwin-only, gated)**: actually boots Vitest browser mode, runs the canonical test, expects green. This is the v1 success target.

### Claude's Discretion

- Exact tinyRPC call shape (Vitest's `BrowserCommand` API is documented; follow it)
- Error taxonomy inside matchers package (just wrap Vitest's standard `AssertionError` is fine)
- Whether matchers package has zero runtime deps (prefer yes — smaller install)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@shoki/sdk` (Phase 1+3) — the actual voiceOver() factory and ScreenReaderHandle
- `ShokiAnnouncement` type from `packages/sdk/src/screen-reader.ts`
- Phase 3's refcount logic in Zig lifecycle.zig — plugin doesn't re-implement this
- `pnpm` workspace root — two new `packages/*` entries follow the existing pattern

### Established Patterns
- TS ES modules, tsc build, Vitest tests, Biome format (all packages)
- `optionalDependencies` for platform binaries (via @shoki/sdk transitively)

### Integration Points
- Plugin registers at Vitest's `config` hook — mutates `test.browser.commands`
- Browser context accessed via `@vitest/browser/context` — the plugin's types re-export from there
- @shoki/sdk is a direct dependency of @shoki/vitest; @shoki/matchers depends on @shoki/sdk only for ShokiAnnouncement type

</code_context>

<specifics>
## Specific Ideas

- Matchers should produce diff-friendly error messages showing the actual log vs the expected shape
- Plugin README should explicitly show how to use it with Playwright's `page.getByRole()` — the natural pairing
- Example repo has zero axe-core / static-a11y dependencies — the point is it uses real VO and that's enough
- `voiceOver.awaitStable` is the canonical "wait for announcements to settle" pattern — not `setTimeout`

</specifics>

<deferred>
## Deferred Ideas

- Playwright-native fixture (`@shoki/playwright`) — Phase 5 hardening work
- WebVTT caption track export synced to Playwright video — Phase 5 hardening
- Debug bundle on test failure (.shoki/<test>/events.json + screenshot) — Phase 5 hardening
- Storybook integration example — post-v1
- VITEST-09 style "runtime refusal of `test.concurrent`" at config time (not just runtime) — would require Vitest plugin API extension; deferred

</deferred>
