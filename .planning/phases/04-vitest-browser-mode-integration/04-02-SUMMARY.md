---
phase: 04
plan: 02
subsystem: vitest
tags: [vitest, browsercommand, tinyRPC, plugin, singleton]
requires: ["@shoki/sdk (Phase 1/3)", "@vitest/browser ^3"]
provides:
  - "@shoki/vitest Vitest plugin (10 BrowserCommands)"
  - "@shoki/vitest/browser entry (voiceOver factory + ShokiBrowserSession)"
  - "WireShokiEvent command-types contract (VITEST-06)"
  - "ShokiConcurrentTestError / PlatformUnsupported / SessionNotFound / BindingNotAvailable"
affects: ["packages/vitest/*"]
tech_stack:
  added: ["@shoki/vitest (new package)"]
  patterns: ["Vitest Plugin API", "BrowserCommand registration at config hook", "tinyRPC structured-clone contract", "module augmentation, dual export map"]
key_files:
  created:
    - packages/vitest/package.json
    - packages/vitest/tsconfig.json
    - packages/vitest/vitest.config.ts
    - packages/vitest/src/index.ts
    - packages/vitest/src/plugin.ts
    - packages/vitest/src/browser.ts
    - packages/vitest/src/errors.ts
    - packages/vitest/src/command-types.ts
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
    - packages/vitest/test/plugin.test.ts
    - packages/vitest/test/singleton-detection.test.ts
    - packages/vitest/test/structured-clone-safety.test.ts
    - packages/vitest/test/fixtures/has-import/test.ts
    - packages/vitest/test/fixtures/no-import/test.ts
    - packages/vitest/test/fixtures/opt-out/test.ts
    - packages/vitest/test/fixtures/opt-out/vitest.config.ts
    - packages/vitest/README.md
  modified: []
decisions:
  - "Wire contract frozen in command-types.ts — WireShokiEvent has `tsMs: number` (ms floor of ns bigint), droppedCount is Number, lastPhrase is `string | null` (never undefined)."
  - "Singleton detection scans test files during the async config hook; skips node_modules/.git/dist/dotfiles; reads only JS/TS extensions; swallows read errors."
  - "Auto-set singleThread=true when VO imports detected; warn but don't overwrite when user set singleThread=false explicitly."
  - "Browser entry detects `vi.getTestMeta()?.concurrent` and throws ShokiConcurrentTestError at voiceOver.start() — runtime-only detection since Vitest doesn't expose concurrent config at plugin-config time."
metrics:
  duration: ~15m
  completed_at: "2026-04-17T17:15Z"
---

# Phase 04 Plan 02: @shoki/vitest Summary

Vitest plugin + browser-side proxy for driving `@shoki/sdk` from browser-mode tests. Registers 10 BrowserCommands, auto-configures singleton scheduling, and surfaces structured-clone-safe RPC payloads.

## Files Added

See `key_files.created` — 27 files under `packages/vitest/`.

## Plugin Shape

`shokiVitest(opts?): Plugin` returns a standard Vite/Vitest plugin with an async `config` hook that:

1. Ensures `cfg.test.browser.commands` exists and mixes in the 10 `createCommands()` handlers.
2. If `autoSingleThread` + `detectVoiceOverImports` are on (both default true), walks `cfg.root ?? process.cwd()` for any test file importing `from '@shoki/vitest/browser'`.
3. Sets `poolOptions.threads.singleThread = true` when found and not already explicitly set.
4. Warns (doesn't overwrite) when user explicitly set `singleThread = false`.

Plan 04-03 replaces Plan 04-02's module-local counter in `shoki-start.ts` with a proper SessionStore shared across all 10 handlers.

## BrowserCommand Surface (VITEST-01)

All 10 commands typed in `src/command-types.ts`, registered by `createCommands()`:

- `shokiStart(opts) → { sessionId }`
- `shokiStop({ sessionId }) → { stopped, remainingRefs }`
- `shokiListen({ sessionId, sinceMs? }) → WireShokiEvent[]`
- `shokiDrain({ sessionId }) → WireShokiEvent[]`
- `shokiPhraseLog({ sessionId }) → string[]`
- `shokiLastPhrase({ sessionId }) → string | null`
- `shokiClear({ sessionId }) → { ok: true }`
- `shokiReset({ sessionId }) → { ok: true }`
- `shokiAwaitStable({ sessionId, quietMs, timeoutMs? }) → WireShokiEvent[]`
- `shokiGetDroppedCount({ sessionId }) → { droppedCount: number }`

## Structured-Clone Contract (VITEST-06)

No bigint, no Date, no Function on the wire.

- `tsNanos: bigint` → `tsMs: number` (floor-ms via bigint division)
- `droppedCount: bigint` → `number` (Number cast; practical values fit safe-int)
- `lastPhrase: string | undefined` → `string | null` (structuredClone preserves null; undefined can be stripped)

Verified by `structuredClone(await handler(...))` round-trip in `structured-clone-safety.test.ts` (11 cases across all 10 commands).

## Browser-side API (VITEST-02)

`@shoki/vitest/browser` exports `voiceOver.start(opts) → ShokiBrowserSession` — an opaque proxy that owns a `sessionId` string and forwards method calls to the Node-side commands via `@vitest/browser/context`'s `commands` object.

`ShokiBrowserSession` methods: `stop`, `drain`, `listen`, `phraseLog`, `lastPhrase`, `clear`, `reset`, `awaitStable`, `droppedCount`.

## Singleton Enforcement (VITEST-03, 04)

- Plugin detects VO scope at config time via file-system walk (bounded by test-file count).
- `test.concurrent` detected at runtime in `voiceOver.start()` via `vi.getTestMeta()?.concurrent`; throws `ShokiConcurrentTestError` with message "VoiceOver is a system singleton; test.concurrent is not supported".

## Test Coverage

19 tests across 3 files (38 total after Plan 04-03 adds session-store + commands suites):
- `plugin.test.ts` — 1 test (plugin shape)
- `singleton-detection.test.ts` — 7 tests (detector true/false paths, auto-set, warn-on-opt-out, skip when disabled, registers all 10)
- `structured-clone-safety.test.ts` — 11 tests (one per command + ShokiConcurrentTestError metadata)

## Known Stubs (Replaced by Plan 04-03)

- Each `commands/shoki-*.ts` factory was a thin stub returning clone-safe but empty/default values (`[]`, `null`, `{ ok: true }`, `{ stopped: true, remainingRefs: 0 }`, `{ droppedCount: 0 }`). Plan 04-03 rewrites them to call a real `SessionStore`.
- `createCommands({})` took no deps; Plan 04-03 adds `{ sessionStore, driver }`.

## Deviations from Plan

- None (plan executed as written). Stubs are intentional scope boundary until Plan 04-03.

## Self-Check: PASSED

- All 27 declared files exist.
- Commit `11cff77` — `feat(04-02): @shoki/vitest plugin with 10 BrowserCommands + browser proxy (VITEST-01/02/03/04/06)`.
