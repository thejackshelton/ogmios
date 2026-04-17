---
phase: 01-foundations
plan: 03
status: completed
date: 2026-04-17
---

# Plan 01-03 Summary: TypeScript SDK

**Status:** completed
**Requirements satisfied:** FOUND-01, FOUND-02, EXT-01

## What Shipped

### Source files (`packages/sdk/src/`)
- `binding-loader.ts` — platform+arch detection, loads `@shoki/binding-<os>-<arch>` via `optionalDependencies`, throws `BindingMissingError` with doctor-CLI hint on missing binding
- `native-types.ts` — TS types mirroring the Zig N-API surface (ping, version, driver lifecycle)
- `wire.ts` — wire format v1 decoder (Buffer → `ShokiAnnouncement[]`), validates `WIRE_VERSION` byte
- `screen-reader.ts` — `ScreenReaderHandle` interface (start/stop/drain/reset/listen/phraseLog/lastPhrase/clear/awaitStableLog)
- `driver-handle.ts` — concrete handle, owns ring-buffer drain loop via `setTimeout`
- `voice-over.ts` — factory returning a ScreenReaderHandle; Phase 1 stubs to noop driver (Phase 3 switches to real VO)
- `errors.ts` — typed errors (BindingMissingError, DriverNotFoundError, etc.)
- `index.ts` — public entry; re-exports factory + interface + types

### Tests (`packages/sdk/test/`)
- `binding-loader.test.ts` — 4 tests, passing (mocked)
- `wire.test.ts` — 7 tests, passing (pure unit)
- `noop-roundtrip.test.ts` — 3 tests, skipped when `SHOKI_NATIVE_BUILT` env not set (requires Zig build)
- `ping.test.ts` — 3 tests, skipped when `SHOKI_NATIVE_BUILT` env not set

### Configuration
- `packages/sdk/vitest.config.ts` — node environment, includes `test/**/*.test.ts`
- `packages/sdk/package.json` — added `@types/node` dev dep, vitest + typescript already present
- `tsconfig.base.json` — added `"types": ["node"]` so Buffer/process/NodeJS resolve across all workspace packages
- `pnpm-lock.yaml` — committed (53 packages resolved)

## Must-Haves Verification

1. **Binding loader resolves platform-specific package**: `binding-loader.ts` uses `process.platform` + `process.arch` to construct `@shoki/binding-${platform}-${arch}` and `createRequire(import.meta.url)` to load the `.node`. Tests exercise the resolution logic with mocked `require`.
2. **ScreenReaderHandle interface matches driver vtable**: each method maps 1:1 to a Zig vtable function (start/stop/drain/reset). Async-over-sync where appropriate.
3. **Wire decoder round-trips Zig encoder byte-for-byte**: 7 tests cover single-entry, multi-entry, optional role/name fields, version byte validation, and malformed-buffer errors.
4. **voiceOver() factory works end-to-end through noop driver**: `noop-roundtrip.test.ts` exercises the full path start→drain→stop when Zig binding is available. Currently skipped pending local `zig build`; will run in CI (Plan 05).
5. **Typecheck + tests pass green**: `pnpm typecheck` clean; `pnpm test` = 11 passing, 6 skipped.

## Deviations

1. **Executor agent stream timed out mid-Task 4** — it had written all test files and updated package.json but never committed or ran `pnpm install`. Orchestrator (main Claude session) picked up and finished: added `@types/node`, added `types: ["node"]` to tsconfig.base, ran `pnpm install`, verified typecheck + tests, committed.
2. **`noop-roundtrip.test.ts` and `ping.test.ts` are skipped by default** — they require `SHOKI_NATIVE_BUILT=1` env var and a built `.node`. Local devs without Zig 0.16 can still run `pnpm test` without red output. CI (Plan 05) builds Zig and sets the env var.
3. **No custom `noUncheckedIndexedAccess` handling in wire decoder** — instead, we validated indexes inline. This is deliberate: the decoder is a hot path and bail-out paths should be explicit, not compiler-inferred.

## Commits

- `184bf2f` — feat(01-03): add SDK binding loader, native types, and error taxonomy
- `d848cd6` — feat(01-03): add ScreenReaderHandle, wire decoder, voiceOver stub, and SDK entry
- `2c63409` — feat(01-03): finish SDK — test harness, pnpm deps, @types/node

## Gaps / Notes for Downstream

- **napi-zig API name verification** — `native-types.ts` assumes the function names in Plan 02's `zig/src/core/napi.zig` (ping, version, driver lifecycle). If Plan 02's implementation uses different names, this file is the single-point-of-update.
- **Buffer → Uint8Array migration** — if we later target non-Node runtimes (Bun, Deno, workerd), Buffer needs to be swapped for Uint8Array. Defer until a concrete request surfaces.
- **No `@types/node` pin drift protection** — `^24.0.0` follows Node 24 LTS releases. If a future minor changes Buffer type signatures in a breaking way, wire.ts and the test buffers will need a touch. Low risk.
