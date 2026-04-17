---
phase: 04
plan: 03
subsystem: vitest
tags: [vitest, refcount, sessionstore, sdk-wiring]
requires: ["@shoki/vitest Plan 04-02 contracts", "@shoki/sdk ScreenReaderHandle"]
provides:
  - "SessionStore class (refcounted, per-session cursor)"
  - "realShokiSdkDriver + ShokiSdkDriver injection point"
  - "toWireEvent converter (bigint→number)"
  - "Real (non-stub) 10 BrowserCommand handlers"
affects: ["packages/vitest/src/session-store.ts", "packages/vitest/src/commands/*.ts", "packages/vitest/src/plugin.ts", "packages/vitest/src/index.ts"]
tech_stack:
  patterns: ["dependency injection", "refcounting", "per-session cursor into shared log mirror", "AbortSignal.timeout for awaitStable"]
key_files:
  created:
    - packages/vitest/src/session-store.ts
    - packages/vitest/test/session-store.test.ts
    - packages/vitest/test/commands.test.ts
  modified:
    - packages/vitest/src/commands/index.ts
    - packages/vitest/src/commands/shoki-start.ts
    - packages/vitest/src/commands/shoki-stop.ts
    - packages/vitest/src/commands/shoki-listen.ts
    - packages/vitest/src/commands/shoki-drain.ts
    - packages/vitest/src/commands/shoki-phrase-log.ts
    - packages/vitest/src/commands/shoki-last-phrase.ts
    - packages/vitest/src/commands/shoki-clear.ts
    - packages/vitest/src/commands/shoki-reset.ts
    - packages/vitest/src/commands/shoki-await-stable.ts
    - packages/vitest/src/commands/shoki-get-dropped-count.ts
    - packages/vitest/src/plugin.ts
    - packages/vitest/src/index.ts
    - packages/vitest/test/structured-clone-safety.test.ts
decisions:
  - "SessionStore maintains its own `sharedEventLog` mirror (not just the SDK's LogStore) because per-session cursors need index-based deltas. Without the mirror, two sessions racing on drain() would clobber each other via the SDK's drain semantics."
  - "Refcount is only incremented after `handle.start()` succeeds — failing start leaves refs at 0 so the next successful start begins cleanly."
  - "AbortSignal timeouts are created per awaitStable call via `AbortSignal.timeout(ms)` — no shared AbortController, no leaks."
  - "droppedCount conversion to Number accepts safe-int truncation risk (T-04-03-03) — practical values fit; tests flag anything close to 2^53."
metrics:
  duration: ~10m
  completed_at: "2026-04-17T17:15Z"
---

# Phase 04 Plan 03: SessionStore + Real Command Handlers Summary

Replaces Plan 04-02's stub command bodies with a refcounted `SessionStore` that bridges all 10 BrowserCommands to a single shared `ScreenReaderHandle` from `@shoki/sdk`. Closes VITEST-05.

## Files

3 created + 14 modified — see frontmatter.

## SessionStore Shape

```
SessionStore
 ├─ handle: ScreenReaderHandle | null        (one underlying VO session)
 ├─ startRefs: number                         (how many active sessionIds)
 ├─ counter: number                           (monotonic id generator)
 ├─ sessions: Map<sessionId, SessionState>
 │   └─ SessionState { sessionId, active, cursor }
 └─ sharedEventLog: ShokiEvent[]              (index-addressable mirror)
```

## Invariants

- `startRefs === 0` ⇔ `handle === null`.
- First `start()` calls `driver.create(opts)` + `handle.start()`; subsequent starts mint a new sessionId and share the handle (Zig-side refcount handles redundant start calls).
- Each `start()` records the session's initial cursor at `sharedEventLog.length` — new sessions start observing only future events.
- Failed start does NOT increment `startRefs`; counter still advances so the next successful start's id is monotonic (`shoki-2` even if `shoki-1`'s `start()` threw).
- Last `stop()` runs `await handle.stop()` then `await handle.deinit()` in that order (verified via `invocationCallOrder` in tests); empties `sharedEventLog`.
- `reset(sessionId)` calls `handle.reset()` AND rewinds every session's cursor to 0 (shared log was cleared, so "new events since cursor" starts fresh for all sessions).
- `clear(sessionId)` mirrors `reset` for the cursor side but calls `handle.clear()` which is the TS-side-only clear per CAP-11.
- `getSession(unknownId)` throws `ShokiSessionNotFoundError`.

## Command Handler Adapter Pattern

Every handler is now ≤ 15 LoC — just forwards args to the matching `store.xxx(...)` method and returns the structured-clone-safe result. All 10 go through the same injected `sessionStore` (one per plugin instance), so `shokiStart` in test-file-A and `shokiDrain` in test-file-B share state correctly.

## Wire Boundary Conversions

| Node shape | Wire shape | Why |
|---|---|---|
| `tsNanos: bigint` | `tsMs: number` | bigint isn't structured-clone safe; floor ns/1e6 via bigint division preserves integer precision for practical test durations |
| `droppedCount: bigint` | `number` | same reason; values won't realistically hit 2^53 |
| `lastPhrase: string \| undefined` | `string \| null` | structuredClone handles both but null is the defensive choice (undefined can get lost in some paths) |

## sharedEventLog vs SDK's LogStore

Phase 3's `driver-handle.ts` already maintains a `LogStore` and drains the native ring buffer at 50ms. `SessionStore.drain()` calls `handle.drain()` and pushes the result into `sharedEventLog` (our mirror). Per-session cursor then slices from the mirror. This is necessary because two sessions calling `drain()` in rapid succession would each get a partial view of the SDK-side LogStore — the mirror + per-session cursor guarantees each session sees its own full delta.

## Test Coverage

19 new tests:
- `session-store.test.ts` — 11 tests (refcount, fail-then-reset-counter, stop-order, unknown-id throw, reset clears cursor, two sessions independent cursors, awaitStable forwarding, droppedCount→number, lastPhrase→null, toWireEvent floor, zero ns)
- `commands.test.ts` — 8 tests (start+drain round-trip, stop result shape, unknown id throws, awaitStable forwarding, droppedCount number, lastPhrase null, end-to-end structured-clone for all 10 commands)

`structured-clone-safety.test.ts` (Plan 04-02) was rewritten to use a real SessionStore + mock driver so it continues to pass. Total: 38 tests green.

## Deviations from Plan

- None (plan executed as written). The structured-clone test from Plan 04-02 was updated because stub commands no longer accept bare `sessionId: 'shoki-1'` without calling `shokiStart` first — this is the correct new behavior, not a deviation from intent.

## Self-Check: PASSED

- All declared files exist.
- Commit `3ac6ff8` — `feat(04-03): SessionStore wires 10 commands to @shoki/sdk with refcount (VITEST-05)`.
