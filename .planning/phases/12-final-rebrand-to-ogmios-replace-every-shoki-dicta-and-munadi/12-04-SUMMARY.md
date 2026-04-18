---
phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi
plan: 04
subsystem: zig-core
tags: [zig, rename, build, bindings, env-vars, plist, ogmios]
dependency_graph:
  requires: [12-03]
  provides:
    - "Zig package name .ogmios_core (was .munadi_core)"
    - "Build product name ogmios (emits libogmios.dylib / ogmios.node)"
    - "OGMIOS_* env var contract (AX_TARGET_PID, SNAPSHOT_PATH)"
    - "_ogmios_snapshot_* plist magic keys"
    - "~/.ogmios/vo-snapshot.plist default state dir"
    - "OgmiosDriver vtable type (was MunadiDriver, EXT-01 shape unchanged)"
    - "extern \"c\" fn ogmios_xpc_* matching Plan 12-03's dylib symbols"
    - "packages/binding-darwin-arm64/ogmios.node compiled addon artifact"
    - "Binding package main: ogmios.node (both darwin-arm64 and darwin-x64)"
  affects:
    - packages/sdk (binding-loader resolves ogmios.node via @ogmios/binding-darwin-arm64 main)
    - helper (extern symbols ogmios_xpc_* matched by libOgmiosXPCClient.dylib — Plan 12-03)
tech_stack:
  added: []
  patterns:
    - "Zig package fingerprint regenerated on package-name change (0xc8cfea3140d03281 -> 0xf9da50528d8c6779)"
    - "Build-product rename cascades libmunadi.dylib -> libogmios.dylib -> ogmios.node"
key_files:
  created:
    - packages/binding-darwin-arm64/ogmios.node (arm64 compiled addon; gitignored build artifact)
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
  - "build.zig.zon fingerprint regenerated automatically — Zig 0.16 validates fingerprint against package name and emitted the correct value on the first build attempt after .name change (0xf9da50528d8c6779)"
  - "x64 cross-compile remains deferred: helper/.build/libOgmiosXPCClient.dylib is arm64-only for v0.1.0 (per 99e5cd8 chore: arm64-only). packages/binding-darwin-x64/package.json main still flipped so Intel reintroduction in v0.2 needs zero binding-package edits."
  - "ogmios.node remains a gitignored build artifact (matching prior munadi.node / shoki.node convention); CI build-zig-binding action will need the rename when it is owned (Plan 12-07)."
metrics:
  duration: ~15m
  completed: 2026-04-18
  tasks_completed: 2
  files_modified: 22
---

# Phase 12 Plan 04: Zig core rename munadi -> ogmios Summary

## One-liner

Renamed the Zig compilation unit end-to-end — `.munadi_core` -> `.ogmios_core` package, `libmunadi.dylib` -> `libogmios.dylib`, `MUNADI_*` env vars -> `OGMIOS_*`, `_munadi_snapshot_*` plist magic keys -> `_ogmios_snapshot_*`, `~/.munadi/` -> `~/.ogmios/` state dir, `MunadiDriver` vtable -> `OgmiosDriver` (EXT-01 frozen), `munadi_xpc_*` extern decls -> `ogmios_xpc_*` (matches Plan 12-03's dylib), and flipped both binding packages' `main` field to `ogmios.node`.

## What landed

### Task 1 — Zig package + sources + tests + plist keys + env vars (commit e0db4c2)

- `zig/build.zig.zon`:
  - `.name = .ogmios_core` (was `.munadi_core`)
  - `.fingerprint = 0xf9da50528d8c6779` (regenerated — Zig 0.16 enforces fingerprint-matches-name)
- `zig/build.zig`:
  - Build product `.name = "ogmios"` — cascades to `libogmios.dylib` output
  - Linked lib flipped `MunadiXPCClient` -> `OgmiosXPCClient` (matches Plan 12-03's helper rename)
  - Comment refs `libMunadiXPCClient.dylib` -> `libOgmiosXPCClient.dylib`, `munadi_xpc_*` -> `ogmios_xpc_*`
- `zig/src/core/driver.zig`: `MunadiDriver` vtable struct renamed to `OgmiosDriver` (frozen EXT-01 field order + count unchanged)
- `zig/src/core/registry.zig`, `noop/driver.zig`, `voiceover/driver.zig`: vtable type references flipped to `OgmiosDriver`
- `zig/src/drivers/voiceover/driver.zig`:
  - `MUNADI_AX_TARGET_PID` env var + `c.getenv("MUNADI_AX_TARGET_PID")` -> `OGMIOS_AX_TARGET_PID`
  - Comment `munadi/vitest` -> `ogmios/vitest`
- `zig/src/drivers/voiceover/ax_notifications.zig`:
  - `extern "c" fn munadi_xpc_{connect,set_event_callback,start_ax_observer,stop_ax_observer,disconnect}` -> `ogmios_xpc_*`
  - `MUNADI_AX_TARGET_PID` comment -> `OGMIOS_AX_TARGET_PID`
  - `MunadiXPCClient` comment -> `OgmiosXPCClient`
- `zig/src/drivers/voiceover/lifecycle.zig`:
  - `~/.munadi/vo-snapshot.plist` default state path -> `~/.ogmios/vo-snapshot.plist`
  - `MUNADI_SNAPSHOT_PATH` env override -> `OGMIOS_SNAPSHOT_PATH`
  - Plist keys `_munadi_snapshot_{version,pid,ts_unix,domain}` -> `_ogmios_snapshot_*`
  - Sentinel `__MUNADI_MISSING__` -> `__OGMIOS_MISSING__`
  - All "munadi restore-vo-settings" / "munadi defaults" / "munadi metadata" prose -> "ogmios *"
- `zig/src/drivers/voiceover/applescript.zig`: osascript sentinel `__MUNADI_SEP__` -> `__OGMIOS_SEP__`
- `zig/src/drivers/voiceover/defaults.zig`: `PlistKey.munadi_default` field -> `ogmios_default` (1 declaration + 9 catalog entries + 1 usage site in configureSettings)
- `zig/src/root.zig`, `zig/src/core/napi.zig`: `MUNADI_VERSION` const -> `OGMIOS_VERSION`
- `zig/src/core/sync.zig`: comment "munadi's driver code" -> "ogmios's driver code"
- `zig/src/drivers/README.md`: full rewrite — `MunadiDriver` -> `OgmiosDriver`, `@munadi/binding-<os>-<arch>` -> `@ogmios/binding-<os>-<arch>`
- `zig/README.md`: full rewrite — title, references, layout
- Tests:
  - `zig/test/voiceover_lifecycle_test.zig`: assertions for `_ogmios_snapshot_*` keys, `/tmp/ogmios-test-*` paths, `.ogmios/vo-snapshot.plist` path ending, test name `"resolveSnapshotPath honors OGMIOS_SNAPSHOT_PATH env override"`
  - `zig/test/voiceover_driver_test.zig`: test name `"OGMIOS_AX_TARGET_PID env override..."`, `setenv/unsetenv("OGMIOS_AX_TARGET_PID", ...)`
  - `zig/test/voiceover_defaults_test.zig`: field access `.ogmios_default`

Verification: `zig build test` from `zig/` exits 0. `zig build` produces `zig-out/lib/libogmios.dylib` (arm64 Mach-O, 2,258,080 bytes).

### Task 2 — Compiled addon rename + binding package main flip (commit eaa08a8)

- Built `zig-out/lib/libogmios.dylib` (arm64, Mach-O 64-bit)
- Copied to `packages/binding-darwin-arm64/ogmios.node` (arm64 Mach-O dynamic library — verified via `file`)
- Removed `packages/binding-darwin-arm64/munadi.node` (was a gitignored build artifact — deleted from working tree)
- `.gitignore` updated in both binding packages: `munadi.node` -> `ogmios.node`
- `packages/binding-darwin-arm64/package.json`: `"main": "ogmios.node"`, `"files": ["ogmios.node", "README.md", "LICENSE"]`
- `packages/binding-darwin-x64/package.json`: same flip (no compiled artifact present — Intel deferred to v0.2 per prior release decision, but the `main` field is corrected now so Intel reintroduction is zero-edit)

Verification: `pnpm --filter ogmios test run test/ping.test.ts` passes 3/3 tests — the N-API binding-loader resolves `@ogmios/binding-darwin-arm64` main, requires `ogmios.node`, and round-trips `ping() -> "pong"` + `version()` + `wireVersion()`.

## Key decisions

1. **Zig fingerprint auto-regenerated.** `build.zig.zon`'s `.fingerprint` is keyed off `.name` — Zig 0.16 reported the expected new value on the first build attempt (`0xf9da50528d8c6779`) and I updated the manifest accordingly. This is a compile-time guard baked into the package system, not something to fight.
2. **x64 cross-compile remains deferred.** The helper subsystem (Plan 12-03) produced `libOgmiosXPCClient.dylib` as arm64-only, consistent with `99e5cd8 chore: arm64-only for v0.1.0`. I updated `packages/binding-darwin-x64/package.json`'s `main` so the Intel path is unblocked the moment the helper dylib adds x64 slices — no second rename needed.
3. **ogmios.node stays gitignored.** Matches the prior `munadi.node` / `shoki.node` convention — the compiled addon is a build artifact, regenerated by CI's `build-zig-binding` action on release. Local builds produce it via `zig build && cp zig-out/lib/libogmios.dylib packages/binding-darwin-arm64/ogmios.node`. No change to the tracked-vs-untracked boundary.
4. **CI action rename punted to a follow-up.** `.github/actions/build-zig-binding/action.yml` still greps for `libmunadi.dylib` / `munadi.node`. Updating the workflow file was NOT in this plan's scope (Plan 12-07 owns CI). Flagged in Deferred Issues for the next CI-owning plan to pick up before a release tag is cut.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Zig 0.16 fingerprint mismatch**
- **Found during:** Task 1 (first `zig build` run after changing `.name`)
- **Issue:** `zig/build.zig.zon:1:2: error: invalid fingerprint: 0xc8cfea3140d03281; if this is a new or forked package, use this value: 0xf9da50528d8c6779`
- **Fix:** Updated `.fingerprint` to the Zig-provided value. `.fingerprint` is auto-derived from `.name` in Zig's package system — stale fingerprint after a name change is an expected-and-gated-by-compiler state. This was anticipated in the plan (step 15 of Task 1 action).
- **Files modified:** `zig/build.zig.zon`
- **Commit:** e0db4c2

No other deviations. Plan executed exactly as specified otherwise.

## Deferred Issues

- **`.github/actions/build-zig-binding/action.yml` still references `libmunadi.dylib` / `munadi.node`.** The file is part of the CI workflow subsystem (Plan 12-07's scope per CONTEXT.md "GitHub Actions" section). Must flip to `libogmios.dylib` / `ogmios.node` before the next release; until then, local `zig build` works but CI binding release will build the wrong artifact name. **Tracked for Plan 12-07.**
- **`.github/workflows/release.yml` may reference the old artifact name** at similar sites (Phase 11 Plan 03 noted lines 48, 52, 74, 78). Same owner (Plan 12-07).
- **helper x64 dylib missing.** `helper/.build/libOgmiosXPCClient.dylib` is arm64-only. Intel binding package is deliberately shipped empty (consistent with `99e5cd8 chore: arm64-only for v0.1.0`). When Intel returns in v0.2, only the helper needs an x64 build — `packages/binding-darwin-x64/package.json` is already in the correct state.

## Auth Gates

None occurred.

## Verification Results

| Check                                                                                  | Result                |
| -------------------------------------------------------------------------------------- | --------------------- |
| `.name = .ogmios_core` in build.zig.zon                                                | PASS                  |
| `.name = "ogmios"` in build.zig                                                        | PASS                  |
| Zero `(munadi\|Munadi\|MUNADI_\|@munadi/\|_munadi_\|\.munadi/\|libmunadi)` in `zig/**` | PASS (0 matches)      |
| `_ogmios_snapshot_version` in `lifecycle.zig`                                          | PASS                  |
| `OGMIOS_AX_TARGET_PID` in `driver.zig`                                                 | PASS                  |
| `OGMIOS_SNAPSHOT_PATH` in `lifecycle.zig`                                              | PASS                  |
| `__OGMIOS_SEP__` in `applescript.zig`                                                  | PASS                  |
| `__OGMIOS_MISSING__` in `lifecycle.zig`                                                | PASS                  |
| `OgmiosDriver` vtable struct in `driver.zig`                                           | PASS                  |
| `ogmios_xpc_*` extern decls (5) in `ax_notifications.zig`                              | PASS                  |
| `zig build test` exit code                                                             | 0                     |
| `zig-out/lib/libogmios.dylib` exists (arm64 Mach-O)                                    | PASS (2,258,080 B)    |
| `packages/binding-darwin-arm64/ogmios.node` exists (arm64 Mach-O)                      | PASS                  |
| `packages/binding-darwin-arm64/munadi.node` absent                                     | PASS                  |
| `packages/binding-darwin-x64/munadi.node` absent                                       | PASS (never existed)  |
| Both binding `main: "ogmios.node"`                                                     | PASS                  |
| Both binding `files: ["ogmios.node", ...]`                                             | PASS                  |
| `pnpm --filter ogmios test run test/ping.test.ts` exit code                            | 0 (3/3 passing)       |

## Commits

- `e0db4c2` refactor(12-04): rename Zig core munadi -> ogmios (package, build, sources, tests)
- `eaa08a8` refactor(12-04): flip binding packages main to ogmios.node + rebuild addon

## Self-Check: PASSED

- Commit e0db4c2 found in git log
- Commit eaa08a8 found in git log
- packages/binding-darwin-arm64/ogmios.node exists (arm64 Mach-O)
- zig/build.zig.zon contains `.name = .ogmios_core`
- zig/build.zig contains `.name = "ogmios"`
- Zero `MUNADI_*` env-var refs in zig/
- Zero `_munadi_snapshot_` plist keys in zig/
- Zero `munadi`/`Munadi`/`@munadi/`/`.munadi/`/`libmunadi` tokens in zig/
- `zig build test` exit 0
- `pnpm --filter ogmios test run test/ping.test.ts` exit 0 (native addon loads as ogmios.node)
