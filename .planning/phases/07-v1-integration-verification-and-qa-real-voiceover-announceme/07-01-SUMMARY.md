---
phase: 07-v1-integration-verification-and-qa-real-voiceover-announceme
plan: 01
status: partial
gate_status: RED
completed_date: 2026-04-17
tags:
  - qa
  - toolchain
  - zig-0.16-migration
  - napi-zig
requires: []
provides:
  - helper/.build/release/libShokiXPCClient.dylib (65,480 bytes, arm64 Mach-O dylib)
  - helper/ShokiRunner.app/Contents/MacOS/ShokiRunner (99,400 bytes, arm64 Mach-O exe)
  - docs/.vitepress/dist/ (VitePress built site, index.html + 404.html + api/ + assets/ + hashmap.json)
  - .planning/phases/07-v1-integration-verification-and-qa-real-voiceover-announceme/QA-TOOLCHAIN.md
affects:
  - zig/build.zig (Zig 0.16 Build API port)
  - zig/build.zig.zon (fingerprint + real napi-zig hash + paths)
  - zig/src/root.zig (new library root)
  - zig/all_tests.zig (new test aggregator)
  - zig/src/drivers/voiceover/defaults.zig (|_| discard-capture removed)
  - zig/test/voiceover_integration_test.zig (/// -> //)
  - .gitignore (zig/zig-pkg/, /amp)
blocked_artifacts:
  - zig-out/lib/libshoki.dylib (Step 2 FAIL)
  - packages/binding-darwin-arm64/shoki.node (Step 7, blocked by Step 2)
  - Zig unit tests green (Step 3 FAIL, 18 errors across 9 files)
---

# Phase 7 Plan 01: Toolchain + build verification — Summary

## Gate status

**RED.** See `QA-TOOLCHAIN.md` for the full report. 6 of 9 acceptance rows
PASS; 3 FAIL, all classified as `defer-to-07-02` under a single root
cause bucket: **Zig 0.16 stdlib + language migration + N-API glue rewrite
against real napi-zig 0.1.0**.

## Commits

| Commit  | Subject                                                                      |
| ------- | ---------------------------------------------------------------------------- |
| ec4bc69 | chore(07-01): Zig 0.16 toolchain wiring fixes for build to reach real errors |
| 7e6c03d | docs(07-01): QA-TOOLCHAIN report for Plan 07-01                              |

## What's green (artifacts ready for downstream plans)

1. **Zig 0.16.0 installed locally** (`brew install zig`, bottle).
2. **`libShokiXPCClient.dylib`** — `swift build -c release` in helper/ produces
   a 65,480-byte arm64 Mach-O dylib at `helper/.build/release/`, ready for
   Plan 07-02's link-path verification.
3. **Helper Swift tests** — 7/7 pass in 0.317s.
4. **`ShokiRunner.app` bundle** — 99,400-byte executable at
   `helper/ShokiRunner.app/Contents/MacOS/ShokiRunner`, ready for TCC
   signing experiments in Plan 07-04.
5. **VitePress docs site** — `pnpm --filter docs build` produces
   `docs/.vitepress/dist/` (first time ever per Phase 6 SUMMARY note),
   closes DOCS-01 build-time verification.
6. **Playwright chromium** — cached at `~/Library/Caches/ms-playwright/`,
   ready for Plans 07-04 / 07-06.
7. **TS workspace typecheck** — all 5 workspace projects green.
8. **TS SDK tests** — 45 pass; 11 skipped on `SHOKI_NATIVE_BUILT` /
   `SHOKI_INTEGRATION` gates (expected; gates flip once 07-02 lands).

## What's red (blocked on 07-02)

### FAIL: Step 2 — `zig build`

**Error:** `src/root.zig:12:33: error: root source file struct 'root' has no
member named 'napi'` at `const napi = @import("napi_zig").napi;`.

**Root cause:** The N-API glue in `zig/src/root.zig` (originally
`zig/src/core/napi.zig`) was written against a hypothetical napi-zig API:

- `napi_zig.napi.Env` — real surface is `napi_zig.Env` (no `.napi` sub-namespace)
- `Val.fromString(s)`, `Val.fromU32(x)`, `Val.fromU64(x)`, `Val.fromBool(b)`,
  `Val.fromBuffer(env, buf)` — none exist as static constructors; real API
  is `env.createString(s)` / `env.createUint32(x)` / `env.createBigintUint64(x)` /
  `env.createBoolean(b)` / `env.createBuffer(...)` as methods on `Env`.

**Fix scope for 07-02:** ~130 LoC rewrite of the N-API glue. All 10 exported
functions (`ping`, `version`, `wireVersion`, `createDriver`, `driverStart`,
`driverStop`, `driverReset`, `driverDrain`, `driverDeinit`, `droppedCount`)
need their `napi.Val.from*` calls replaced with `env.create*` calls, and
the top-level import changes from `@import("napi_zig").napi` to
`@import("napi_zig")`.

### FAIL: Step 3 — `zig build test`

**Errors:** 18 compilation errors across 9 files. All are Zig 0.16 stdlib
migration issues:

| # | Symbol                               | Files                                                                     |
| - | ------------------------------------ | ------------------------------------------------------------------------- |
| 1 | `std.testing.refAllDeclsRecursive`   | `all_tests.zig`                                                           |
| 2 | `std.io.*` (Writer/Reader)           | `src/core/wire.zig` (×2)                                                  |
| 3 | `std.time.nanoTimestamp`             | `src/drivers/noop/driver.zig`, `src/drivers/voiceover/lifecycle.zig`      |
| 4 | `std.Thread.Mutex`                   | `src/drivers/voiceover/{ax_notifications,lifecycle}.zig`                  |
| 5 | `std.Thread.sleep`                   | `src/drivers/voiceover/lifecycle.zig`                                     |
| 6 | `std.process.Child.init`             | `src/drivers/voiceover/defaults.zig` (×2)                                 |
| 7 | `ArrayListUnmanaged(T){}` init       | `test/voiceover_{applescript,defaults,driver,lifecycle}_test.zig` (9 sites) |

**Fix scope for 07-02:** ~80-120 LoC across 9 files, mechanical mapping per
the catalogue above. Approximate replacements:

- `std.io` → use `std.Io` / `std.fs.File.writer()` APIs
- `std.time.nanoTimestamp` → `std.time.Instant.now()` + `.since(zero)` or
  `std.time.nanosToMicros(std.time.Instant.now().since(zero))`
- `std.Thread.sleep(ns)` → `std.time.sleep(ns)`
- `std.Thread.Mutex` → inspect 0.16 note; may have moved to `std.Thread.Mutex`
  still but initialized differently; or use `std.Thread.Mutex.Recursive`
- `std.process.Child.init(argv, alloc)` → `std.process.Child{ .allocator = alloc, .argv = argv }` literal
- `ArrayListUnmanaged(T){}` → `ArrayListUnmanaged(T).empty` or
  `ArrayListUnmanaged(T){ .items = &.{}, .capacity = 0 }`
- `std.testing.refAllDeclsRecursive` → `std.testing.refAllDecls` (non-recursive
  is fine because we already `comptime _ = @import(...)` each test file)

### FAIL: Step 7 — `.node` binding + `ping()` round-trip

Blocked upstream by Step 2 (no `libshoki.dylib` means no `shoki.node` to
copy). Becomes GREEN automatically when 07-02 fixes the N-API glue + stdlib
drift and `zig build` exits 0.

## Fixes applied autonomously (Rule 3: blocking issues)

These were wiring-level fixes required to even reach the real errors. They
are bundled in commit `ec4bc69`:

1. `zig/build.zig.zon`: fingerprint `0x5305c51ed7a9bc01` → `0x46448382d63a18be`
   (Zig 0.16 forked-package rule).
2. `zig/build.zig.zon`: real napi-zig hash saved via `zig fetch --save=napi_zig`.
3. `zig/build.zig.zon`: added `"test"` + `"all_tests.zig"` to `.paths`.
4. `zig/build.zig`: Zig 0.16 Build API port —
   `addSharedLibrary` → `createModule` + `addLibrary{ .linkage = .dynamic }`;
   `addLibraryPath`/`linkSystemLibrary`/`addRPath` moved from `*Compile` to `*Module`;
   `linkSystemLibrary` now requires a 2nd options arg (`.{}`);
   `napi_dep.module("napi_zig")` → `napi_dep.module("napi")`;
   tests compiled through a single aggregator root.
5. `zig/all_tests.zig`: new aggregator; `comptime _ = @import(...)` each test file.
6. `zig/src/root.zig`: new library root with imports rewritten relative to `src/`
   so Zig 0.16's stricter `@import` path enforcement allows the
   `core/registry.zig` → `../drivers/...` chain.
7. `zig/src/drivers/voiceover/defaults.zig:321`: removed `|_|` discard-capture.
8. `zig/test/voiceover_integration_test.zig:6-8`: `///` → `//` before a `test` block.
9. `.gitignore`: added `zig/zig-pkg/` and `/amp`.

None of these touched driver semantics or test assertions — purely Zig
version compatibility plumbing.

## Deviations from Plan

### Rule 3 — Blocking issue auto-fix

**1. [Rule 3 - Blocking] Zig 0.16 Build API + module-path changes**
- **Found during:** Step 2 first run
- **Issue:** The plan assumed `zig build` would fail in one of the three
  known-fix catalogue patterns (translate-c, missing CF/AppKit linker
  flags, Xcode CLT, Playwright proxy). None of those matched. The real
  first-failure was the build system itself not compiling under Zig 0.16.
- **Fix:** Ported `build.zig` + `build.zig.zon` wholesale to Zig 0.16's
  Build API. Rationale: without this, every subsequent step fails for a
  reason that doesn't match the catalogue — so the plan's "run ALL steps,
  record outcome" directive is impossible. This fix is purely wiring and
  doesn't change what gets built.
- **Files modified:** `zig/build.zig`, `zig/build.zig.zon`, plus the two
  new files `zig/all_tests.zig` and `zig/src/root.zig`.
- **Commit:** ec4bc69

**2. [Rule 3 - Blocking] Two tiny language-level fixes**
- **Found during:** Step 2 / Step 3 runs after wiring fix
- **Issue:** `|_|` discard-capture in `defaults.zig:321` and `///` doc
  comment on a `test` block in `voiceover_integration_test.zig:6` both
  block parsing.
- **Fix:** One-character deletions, no semantic change.
- **Files modified:** `zig/src/drivers/voiceover/defaults.zig`,
  `zig/test/voiceover_integration_test.zig`.
- **Commit:** ec4bc69

### Deferred to Plan 07-02 (NOT fixed in this plan)

Per the plan's known-fix catalogue rule "do not attempt to autonomously
'fix' toolchain bugs that aren't listed in the known-fix catalogue", the
following were recorded as FAIL and left for 07-02:

- **N-API glue rewrite against real napi-zig 0.1.0** (~130 LoC — biggest deferred item)
- **Zig 0.16 stdlib migration sweep** (7 API drift points across 9 files)
- **`.node` binding copy + `ping()` round-trip** (blocked upstream)

## Downstream impact

- **Plan 07-02 scope expansion:** Originally "link-path fix +
  `realAppleScriptSpawner` + known stubs". Now ALSO owns:
  - N-API glue rewrite (item A above)
  - Zig 0.16 stdlib migration (item B above)
- **Plans 07-03, 07-04, 07-05, 07-06:** Blocked on 07-02 (need a working
  native binding before integration tests can run).
- **Not blocked:** Helper-side work (Swift test + .app bundle + XPC client)
  and docs build are all GREEN and can be used independently.

## Known Stubs

None new in this plan's output. Pre-existing stubs from Phase 3 / Phase 6
(`realAppleScriptSpawner`, `__debugInjectEvents`, helper link path) remain;
Plan 07-02 is their triage target.

## Metrics

| Metric                                           | Value                  |
| ------------------------------------------------ | ---------------------- |
| Plan duration (approx)                           | ~35 min wall           |
| Tasks completed                                  | 2 / 2                  |
| Steps run (per plan's 10-step protocol)          | 10 / 10 + 2 supplementary (typecheck, SDK tests) |
| Acceptance-criteria PASS                         | 6 / 9                  |
| Acceptance-criteria FAIL                         | 3 / 9 (all defer-to-07-02 under one root cause) |
| Files modified (Rule 3 wiring fixes)             | 7 (.gitignore, 4 in zig/, 2 new)              |
| Files created                                    | 3 (QA-TOOLCHAIN.md, all_tests.zig, root.zig)  |
| Commits landed                                   | 2 (ec4bc69, 7e6c03d)   |

## Self-Check: PASSED

**Artifact existence checks:**
- `helper/.build/release/libShokiXPCClient.dylib` — FOUND (65,480 bytes)
- `helper/ShokiRunner.app/Contents/MacOS/ShokiRunner` — FOUND (99,400 bytes, executable)
- `docs/.vitepress/dist/index.html` — FOUND (19,996 bytes)
- `docs/.vitepress/dist/hashmap.json` — FOUND
- `.planning/phases/07-v1-integration-verification-and-qa-real-voiceover-announceme/QA-TOOLCHAIN.md` — FOUND
- `zig-out/lib/libshoki.dylib` — MISSING (Step 2 FAIL, as recorded)
- `packages/binding-darwin-arm64/shoki.node` — MISSING (Step 7 FAIL, as recorded)

**Commit existence checks:**
- `ec4bc69` (Zig 0.16 toolchain wiring) — FOUND in git log
- `7e6c03d` (QA-TOOLCHAIN report) — FOUND in git log

**QA-TOOLCHAIN.md acceptance checks:**
- `grep -c "^## Step "` → `10` (expected 10)
- `grep -E "^\| Zig 0\.16\.x installed \| (PASS|FAIL)"` → matched
- `grep -E "^\*\*Toolchain gate: (GREEN|RED)"` → matched (RED)

Self-check passed. Plan status is `partial` with explicit gate=RED and a
documented handoff to Plan 07-02.
