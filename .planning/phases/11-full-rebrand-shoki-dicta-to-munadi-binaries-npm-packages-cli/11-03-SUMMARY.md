---
phase: 11-full-rebrand-shoki-dicta-to-munadi-binaries-npm-packages-cli
plan: 03
subsystem: zig-core
tags: [zig, rename, build, bindings, env-vars, plist]
dependency_graph:
  requires: [11-02]
  provides:
    - "Zig package name .munadi_core (was .shoki_core)"
    - "Build product name munadi (emits libmunadi.dylib / munadi.node)"
    - "MUNADI_* env var contract (AX_TARGET_PID, SNAPSHOT_PATH)"
    - "_munadi_snapshot_* plist magic keys"
    - "~/.munadi/vo-snapshot.plist default state dir"
    - "MunadiDriver vtable type (was ShokiDriver, EXT-01 shape unchanged)"
    - "extern \"c\" fn munadi_xpc_* matching Plan 04's dylib symbols"
    - "packages/binding-darwin-arm64/munadi.node compiled addon artifact"
    - "Binding package main: munadi.node (both darwin-arm64 and darwin-x64)"
  affects:
    - packages/sdk (binding-loader resolves munadi.node via @munadi/binding-darwin-arm64 main)
    - helper (extern symbols munadi_xpc_* matched by libMunadiXPCClient.dylib — Plan 04)
tech_stack:
  added: []
  patterns:
    - "Zig package fingerprint regenerated on package-name change (0x46448382... -> 0xc8cfea31...)"
    - "Build-product rename cascades libshoki.dylib -> libmunadi.dylib -> munadi.node"
key_files:
  created:
    - packages/binding-darwin-arm64/munadi.node (arm64 compiled addon; gitignored build artifact)
  modified:
    - zig/build.zig
    - zig/build.zig.zon
    - zig/README.md
    - zig/src/root.zig
    - zig/src/core/driver.zig
    - zig/src/core/napi.zig
    - zig/src/core/registry.zig
    - zig/src/core/sync.zig
    - zig/src/drivers/README.md
    - zig/src/drivers/noop/driver.zig
    - zig/src/drivers/voiceover/applescript.zig
    - zig/src/drivers/voiceover/ax_notifications.zig
    - zig/src/drivers/voiceover/defaults.zig
    - zig/src/drivers/voiceover/driver.zig
    - zig/src/drivers/voiceover/lifecycle.zig
    - zig/test/voiceover_defaults_test.zig
    - zig/test/voiceover_driver_test.zig
    - zig/test/voiceover_lifecycle_test.zig
    - packages/binding-darwin-arm64/.gitignore
    - packages/binding-darwin-arm64/package.json
    - packages/binding-darwin-x64/.gitignore
    - packages/binding-darwin-x64/package.json
decisions:
  - "build.zig.zon fingerprint regenerated automatically — Zig 0.16 validates fingerprint against package name and emitted the correct value on first build attempt (0xc8cfea3140d03281)"
  - "x64 cross-compile deferred: helper/.build/libMunadiXPCClient.dylib is arm64-only for v0.1.0 (per 99e5cd8 chore: arm64-only); package.json main updated anyway so Intel reintroduction in v0.2 needs zero binding-package edits"
  - "munadi.node remains a gitignored build artifact (matching prior shoki.node convention); CI build-zig-binding action will rename libmunadi.dylib -> munadi.node on release (action.yml update deferred to Plan 05 which owns workflows)"
metrics:
  duration: ~7m
  completed: 2026-04-18
  tasks_completed: 2
  files_modified: 22
---

# Phase 11 Plan 03: Zig core rename shoki -> munadi Summary

## One-liner

Renamed the Zig compilation unit end-to-end — `.shoki_core` -> `.munadi_core` package, `libshoki.dylib` -> `libmunadi.dylib`, `SHOKI_*` env vars -> `MUNADI_*`, `_shoki_snapshot_*` plist magic keys -> `_munadi_snapshot_*`, `~/.shoki/` -> `~/.munadi/` state dir, and flipped both binding packages' `main` field to `munadi.node`.

## What landed

### Task 1 — Zig package + sources + tests + plist keys + env vars (commit 9c09a64)

- `zig/build.zig.zon`:
  - `.name = .munadi_core` (was `.shoki_core`)
  - `.fingerprint = 0xc8cfea3140d03281` (regenerated — Zig 0.16 enforces fingerprint-matches-name)
- `zig/build.zig`:
  - Build product `.name = "munadi"` — cascades to `libmunadi.dylib` output
  - Linked lib flipped `ShokiXPCClient` -> `MunadiXPCClient` (matches Plan 04's helper rename)
  - Comment refs `libShokiXPCClient.dylib` -> `libMunadiXPCClient.dylib`, `shoki_xpc_*` -> `munadi_xpc_*`
- `zig/src/core/driver.zig`: `ShokiDriver` vtable struct renamed to `MunadiDriver` (frozen EXT-01 field order + count unchanged)
- `zig/src/core/registry.zig`, `noop/driver.zig`, `voiceover/driver.zig`: vtable type references flipped to `MunadiDriver`
- `zig/src/drivers/voiceover/driver.zig`:
  - `SHOKI_AX_TARGET_PID` env var + `c.getenv("SHOKI_AX_TARGET_PID")` -> `MUNADI_AX_TARGET_PID`
  - Comment `@shoki/vitest` -> `munadi/vitest`
- `zig/src/drivers/voiceover/ax_notifications.zig`:
  - `extern "c" fn shoki_xpc_{connect,set_event_callback,start_ax_observer,stop_ax_observer,disconnect}` -> `munadi_xpc_*`
  - `SHOKI_AX_TARGET_PID` comment -> `MUNADI_AX_TARGET_PID`
- `zig/src/drivers/voiceover/lifecycle.zig`:
  - `~/.shoki/vo-snapshot.plist` default state path -> `~/.munadi/vo-snapshot.plist`
  - `SHOKI_SNAPSHOT_PATH` env override -> `MUNADI_SNAPSHOT_PATH`
  - Plist keys `_shoki_snapshot_{version,pid,ts_unix,domain}` -> `_munadi_snapshot_*`
  - Sentinel `__SHOKI_MISSING__` -> `__MUNADI_MISSING__`
- `zig/src/drivers/voiceover/applescript.zig`: osascript sentinel `__SHOKI_SEP__` -> `__MUNADI_SEP__`
- `zig/src/drivers/voiceover/defaults.zig`: `PlistKey.shoki_default` field -> `munadi_default` (1 declaration + 1 usage site)
- `zig/src/root.zig`, `zig/src/core/napi.zig`: `SHOKI_VERSION` const -> `MUNADI_VERSION`
- `zig/src/core/sync.zig`: comment "shoki's driver code" -> "munadi's driver code"
- `zig/src/drivers/README.md`: full rewrite — `ShokiDriver` -> `MunadiDriver`, `@shoki/binding-<os>-<arch>` -> `@munadi/binding-<os>-<arch>`
- `zig/README.md`: full rewrite — title, references, layout
- Tests:
  - `zig/test/voiceover_lifecycle_test.zig`: assertions for `_munadi_snapshot_*` keys, `/tmp/munadi-test-*` paths, `.munadi/vo-snapshot.plist` path ending, test name `"resolveSnapshotPath honors MUNADI_SNAPSHOT_PATH env override"`
  - `zig/test/voiceover_driver_test.zig`: test name `"MUNADI_AX_TARGET_PID env override..."`, `setenv/unsetenv("MUNADI_AX_TARGET_PID", ...)`
  - `zig/test/voiceover_defaults_test.zig`: field access `.munadi_default`

Verification: `zig build test` from `zig/` exits 0. `zig build` produces `zig-out/lib/libmunadi.dylib`.

### Task 2 — Compiled addon rename + binding package main flip (commit d1bad76)

- Built `zig-out/lib/libmunadi.dylib` (arm64, Mach-O 64-bit, 2,258,080 bytes)
- Copied to `packages/binding-darwin-arm64/munadi.node` (arm64 Mach-O dynamic library — verified via `file`)
- Removed `packages/binding-darwin-arm64/shoki.node` (was a gitignored build artifact — deleted from working tree)
- `.gitignore` updated in both binding packages: `shoki.node` -> `munadi.node`
- `packages/binding-darwin-arm64/package.json`: `"main": "munadi.node"`, `"files": ["munadi.node", "README.md", "LICENSE"]`
- `packages/binding-darwin-x64/package.json`: same flip (no compiled artifact present — Intel deferred to v0.2 per prior release decision, but the `main` field is corrected now so Intel reintroduction is zero-edit)

Verification: `pnpm --filter munadi test run test/ping.test.ts` passes 3/3 tests — the N-API binding-loader resolves `@munadi/binding-darwin-arm64` main, requires `munadi.node`, and round-trips `ping() -> "pong"`.

## Key decisions

1. **Zig fingerprint auto-regenerated.** `build.zig.zon`'s `.fingerprint` is keyed off `.name` — Zig 0.16 reported the expected new value on the first build attempt (`0xc8cfea3140d03281`) and I updated the manifest accordingly. This is a compile-time guard baked into the package system, not something to fight.
2. **x64 cross-compile deferred — not a regression.** The plan's Task 2 STEP B asked to cross-compile for `x86_64-macos`. This link-fails because `helper/.build/libMunadiXPCClient.dylib` is arm64-only (prior release decision: "arm64-only for v0.1.0 — defer Intel Mac support to v0.2", commit `99e5cd8`). I still updated `packages/binding-darwin-x64/package.json`'s `main` field so the Intel path is unblocked the moment the helper dylib adds x64 slices — no second rename needed.
3. **munadi.node stays gitignored.** Matches the prior `shoki.node` convention — the compiled addon is a build artifact, regenerated by CI's `build-zig-binding` action on release. Local builds produce it via `zig build && cp zig-out/lib/libmunadi.dylib packages/binding-darwin-arm64/munadi.node`. No change to the tracked-vs-untracked boundary.
4. **CI action rename punted to a follow-up.** `.github/actions/build-zig-binding/action.yml` still greps for `libshoki.dylib` / `shoki.node`. Updating the workflow file was NOT in this plan's scope (Plan 05 owns CI). Flagged in Deferred Issues for the next CI-owning plan to pick up before a release tag is cut.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Zig 0.16 fingerprint mismatch**
- **Found during:** Task 1 (first `zig build test` run after changing `.name`)
- **Issue:** `zig/build.zig.zon:1:2: error: invalid fingerprint: 0x46448382d63a18be; if this is a new or forked package, use this value: 0xc8cfea3140d03281`
- **Fix:** Updated `.fingerprint` to the Zig-provided value. `.fingerprint` is auto-derived from `.name` in Zig's package system — stale fingerprint after a name change is an expected-and-gated-by-compiler state.
- **Files modified:** `zig/build.zig.zon`
- **Commit:** 9c09a64

**2. [Rule 3 - Scope] x64 cross-compile deferred**
- **Found during:** Task 2 STEP B (`zig build -Dtarget=x86_64-macos -Doptimize=ReleaseSafe`)
- **Issue:** Link fails — `helper/.build/libMunadiXPCClient.dylib` is arm64-only; there is no x64 slice to link against.
- **Fix:** Updated `packages/binding-darwin-x64/package.json` `main` + `files` anyway (so the contract is correct when Intel support returns); left the package artifact-less (consistent with prior `99e5cd8` arm64-only release decision). Documented as Deferred below.
- **Files modified:** `packages/binding-darwin-x64/package.json`, `packages/binding-darwin-x64/.gitignore`
- **Commit:** d1bad76

## Deferred Issues

- **`.github/actions/build-zig-binding/action.yml` still references `libshoki.dylib` / `shoki.node`.** Six occurrences (lines 3, 62, 63, 64, 72, 73, 92). The file is part of the CI workflow subsystem (Plan 05's scope per CONTEXT.md "Infra" section). Must flip to `libmunadi.dylib` / `munadi.node` before the next release; until then, local `zig build` works but CI binding release will build the wrong artifact name. **Tracked for Plan 05.**
- **`.github/workflows/release.yml` references `packages/binding-darwin-arm64/shoki.node` at lines 48, 52, 74, 78.** Same owner (Plan 05). Flagged here for visibility.
- **helper x64 dylib missing.** `helper/.build/libMunadiXPCClient.dylib` is arm64-only. Intel binding package is deliberately shipped empty (consistent with `99e5cd8 chore: arm64-only for v0.1.0`). When Intel returns in v0.2, only the helper needs an x64 build — `packages/binding-darwin-x64/package.json` is already in the correct state.

## Auth Gates

None occurred.

## Verification Results

| Check                                                                               | Result            |
| ----------------------------------------------------------------------------------- | ----------------- |
| `.name = .munadi_core` in build.zig.zon                                             | PASS              |
| `.name = "munadi"` in build.zig                                                     | PASS              |
| Zero `SHOKI_(AX_TARGET_PID\|SNAPSHOT_PATH\|INTEGRATION\|NATIVE_BUILT)` in `zig/**`  | PASS (0 matches)  |
| Zero `_shoki_snapshot_` in `zig/**`                                                 | PASS (0 matches)  |
| Zero `.shoki/vo-snapshot` in `zig/**`                                               | PASS (0 matches)  |
| `_munadi_snapshot_version` in `lifecycle.zig`                                       | PASS              |
| `MUNADI_AX_TARGET_PID` in `driver.zig`                                              | PASS              |
| `zig build test` exit code                                                          | 0                 |
| `packages/binding-darwin-arm64/munadi.node` exists (arm64 Mach-O)                   | PASS              |
| `packages/binding-darwin-arm64/shoki.node` absent                                   | PASS              |
| `packages/binding-darwin-x64/shoki.node` absent                                     | PASS (never existed)|
| Both binding `main: "munadi.node"`                                                  | PASS              |
| Both binding `files: ["munadi.node", ...]`                                          | PASS              |
| `pnpm --filter munadi test run test/ping.test.ts` exit code                         | 0 (3/3 passing)   |

## Commits

- `9c09a64` refactor(11-03): rename Zig core shoki -> munadi (package, build, sources, tests)
- `d1bad76` refactor(11-03): flip binding packages main to munadi.node

## Self-Check: PASSED

- Commit 9c09a64 found in git log
- Commit d1bad76 found in git log
- packages/binding-darwin-arm64/munadi.node exists (2,258,080 bytes, arm64 Mach-O)
- zig/build.zig.zon contains `.name = .munadi_core`
- zig/build.zig contains `.name = "munadi"`
- Zero `SHOKI_*` env-var refs in zig/
- Zero `_shoki_snapshot_` plist keys in zig/
- `zig build test` exit 0
- `pnpm --filter munadi test run test/ping.test.ts` exit 0 (native addon loads as munadi.node)
