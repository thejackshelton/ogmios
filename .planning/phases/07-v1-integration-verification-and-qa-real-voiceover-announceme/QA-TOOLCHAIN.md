# Phase 7 Plan 01: QA Toolchain Report

**Date:** 2026-04-17
**Machine:** Darwin 25.4.0 (macOS 26.4), arm64 (Apple Silicon)
**Shell:** zsh

## Environment snapshot (pre-run)

- `uname -m`: `arm64`
- `sw_vers -productVersion`: `26.4`
- `node --version`: `v24.15.0`
- `pnpm --version`: `10.0.0`
- `swift --version`: `Apple Swift version 6.2.4 (swiftlang-6.2.4.1.4 clang-1700.6.4.2)` — `Target: arm64-apple-macosx26.0`
- `zig version`: NOT INSTALLED (pre-run) — step 1 installs it
- `brew --version`: `Homebrew 5.1.1`
- `brew info zig`: stable 0.16.0 (bottled)

## Step 1: Install Zig 0.16

**Command:** `brew install zig`
**Working dir:** `/Users/jackshelton/dev/open-source/shoki`
**Exit code:** `0`
**First 50 lines of combined stdout+stderr:**
```
==> Installing zig dependency: llvm@21
==> Pouring llvm@21--21.1.8.arm64_tahoe.bottle.tar.gz
Cellar/llvm@21/21.1.8: 8,670 files, 1.6GB
==> Installing zig dependency: lld@21
==> Pouring lld@21--21.1.8_1.arm64_tahoe.bottle.tar.gz
Cellar/lld@21/21.1.8_1: 36 files, 5.8MB
==> Installing zig
==> Pouring zig--0.16.0.arm64_tahoe.bottle.tar.gz
Cellar/zig/0.16.0: 19,548 files, 207.2MB
```
**Verify:** `zig version` -> `0.16.0`
**Outcome:** PASS

## Step 2: Zig build (`zig build` in `zig/`)

**Command:** `cd zig && zig build`
**Working dir:** `/Users/jackshelton/dev/open-source/shoki/zig`
**Exit code:** `1`

**Fixes attempted during this plan (Rule 3 — blocking issues in the toolchain wiring itself, not source code):**

1. `build.zig.zon` had placeholder `fingerprint = 0x5305c51ed7a9bc01` + `.hash = "UPDATE_VIA_ZIG_FETCH"` — Zig 0.16 rejected both. Ran `zig fetch --save=napi_zig git+https://github.com/yuku-toolchain/napi-zig.git#4f05eeaeee539b4800b9cdbc1485270c476b7ff8`; fingerprint updated to `0x46448382d63a18be`, hash saved as `napi_zig-0.1.0-XRkY0T1FAQDYQ-32h7Ru7iLXhZfrXY4OajfvO5tqDlmN`. Applied.
2. `build.zig` used `b.addSharedLibrary(...)` which was removed in Zig 0.16. Rewrote to `b.createModule(...)` + `b.addLibrary(..., .linkage=.dynamic)`. Applied.
3. `build.zig` called `lib.addLibraryPath`, `lib.linkSystemLibrary`, `lib.addRPath` on the `*Compile` — in Zig 0.16 these moved to `*Module`. Also `linkSystemLibrary` now requires a second options argument (passed `.{}`). Applied.
4. napi-zig's exported module name is `napi`, not `napi_zig` — changed `napi_dep.module("napi_zig")` → `napi_dep.module("napi")`. Applied.
5. Zig 0.16 enforces that every `@import("...")` path must resolve *within the Module's root directory subtree*. The library's root source file was `src/core/napi.zig` but `src/core/registry.zig` imports `../drivers/...`. Created `src/root.zig` (a copy of napi.zig with imports rewritten to be relative to `src/`) and pointed `root_source_file` at it. Applied.

**First 50 lines of the REMAINING failure after fixes (1 error, blocks Step 2 and therefore the artifact `zig-out/lib/libshoki.dylib`):**

```
src/root.zig:12:33: error: root source file struct 'root' has no member named 'napi'
const napi = @import("napi_zig").napi;
             ~~~~~~~~~~~~~~~~~~~^~~~~
zig-pkg/napi_zig-0.1.0-.../src/root.zig:1:1: note: struct declared here
pub const c = @import("c.zig");
^~~
```

**Root cause (not fixed by this plan):** `zig/src/root.zig` (formerly `src/core/napi.zig`) was written against a hypothetical napi-zig API shape where the root module has a `.napi` sub-namespace exposing `Env`, `Val`, `module()`, and `Val.fromString/fromU32/fromU64/fromBool/fromBuffer`. The real napi-zig v0.1.0 exports those types directly at root (`napi_zig.Env`, `napi_zig.Val`, `napi_zig.module`) and does NOT provide `Val.fromString` / `Val.fromU32` / etc. as static constructors — instead callers use `env.createString(str)`, `env.createUint32(v)`, `env.toJs(anything)`, etc.

The fix is a real rewrite of the N-API glue layer, estimated at ~130 LoC. That is **explicitly out of scope for 07-01** (toolchain verification). It is **in scope for Plan 07-02** (known-fix catalogue: "link-path fix is Plan 07-02's scope"; this is a close analog).

**Outcome:** FAIL — classified `defer-to-07-02` (N-API glue API rewrite against real napi-zig 0.1.0 surface).

## Step 3: Zig test (`zig build test` in `zig/`)

**Command:** `cd zig && zig build test`
**Working dir:** `/Users/jackshelton/dev/open-source/shoki/zig`
**Exit code:** `1`

**Fixes attempted during this plan (Rule 3):**

1. Same module-path issue as Step 2 — each test file lives in `zig/test/` and imports `../src/...`. Zig 0.16 requires the Module root to cover both directories. Created `zig/all_tests.zig` that `comptime _ = @import("test/foo_test.zig")`s each of the 10 test files, then pointed the test's `root_source_file` at it. Applied.
2. `zig/test/voiceover_integration_test.zig` had a `///` doc comment directly before a `test` block — Zig 0.16 prohibits doc comments on test blocks. Converted to `//`. Applied.
3. `zig/src/drivers/voiceover/defaults.zig:321` used `|_|` discard-capture syntax which Zig 0.16 rejects ("discard of capture; omit it instead"). Removed the discard. Applied.

**First 50 lines of the REMAINING failures after fixes (18 errors across 9 source files — all Zig 0.16 stdlib / language migration issues, all `defer-to-07-02`):**

```
all_tests.zig:23:27: error: root source file struct 'testing' has no member named 'refAllDeclsRecursive'
src/core/wire.zig:28:17: error: root source file struct 'std' has no member named 'io'
src/core/wire.zig:67:17: error: root source file struct 'std' has no member named 'io'
src/drivers/noop/driver.zig:47:42: error: root source file struct 'time' has no member named 'nanoTimestamp'
src/drivers/voiceover/ax_notifications.zig:107:22: error: root source file struct 'Thread' has no member named 'Mutex'
src/drivers/voiceover/defaults.zig:30:34: error: root source file struct 'process.Child' has no member named 'init'
src/drivers/voiceover/defaults.zig:144:34: error: root source file struct 'process.Child' has no member named 'init'
src/drivers/voiceover/lifecycle.zig:28:29: error: root source file struct 'time' has no member named 'nanoTimestamp'
src/drivers/voiceover/lifecycle.zig:31:15: error: root source file struct 'Thread' has no member named 'sleep'
src/drivers/voiceover/lifecycle.zig:126:22: error: root source file struct 'Thread' has no member named 'Mutex'
test/voiceover_applescript_test.zig:14:45: error: missing struct field: items
test/voiceover_applescript_test.zig:14:45: note: missing struct field: capacity
test/voiceover_defaults_test.zig:82:61: error: missing struct field: items
test/voiceover_driver_test.zig:19:61: error: missing struct field: items
test/voiceover_driver_test.zig:109:45: error: missing struct field: items
test/voiceover_driver_test.zig:322:65: error: missing struct field: items
test/voiceover_lifecycle_test.zig:15:61: error: missing struct field: items
test/voiceover_lifecycle_test.zig:55:32: error: missing struct field: items
test/voiceover_lifecycle_test.zig:111:47: error: missing struct field: items
error: 18 compilation errors
```

**Root cause catalogue (all deferred to Plan 07-02, Zig 0.16 stdlib migration):**

| # | Symbol                          | Zig ≤0.15 availability | Zig 0.16 replacement (per std lib)                                          | Files affected                              |
| - | ------------------------------- | ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| 1 | `std.testing.refAllDeclsRecursive` | present              | moved — use `std.testing.refAllDecls` + recursion, or remove (tests auto-discovered) | `all_tests.zig`                      |
| 2 | `std.io.*` (Writer, Reader etc.)   | present              | `std.io` removed; use `std.Io` / `std.fs.File.writer()` etc.                | `src/core/wire.zig` (×2)                     |
| 3 | `std.time.nanoTimestamp`           | present              | removed; use `std.time.Instant.now()` + `.since(zero)`                      | `src/drivers/noop/driver.zig`, `src/drivers/voiceover/lifecycle.zig` |
| 4 | `std.Thread.Mutex`                  | present              | moved to `std.Thread.Mutex` still exists? error says no — inspect 0.16 note | `src/drivers/voiceover/ax_notifications.zig`, `lifecycle.zig` |
| 5 | `std.Thread.sleep`                  | present              | moved; use `std.time.sleep(ns)`                                             | `src/drivers/voiceover/lifecycle.zig`        |
| 6 | `std.process.Child.init`            | present              | replaced by struct-literal init; use `std.process.Child{ .argv = ..., ... }`| `src/drivers/voiceover/defaults.zig` (×2)    |
| 7 | `ArrayListUnmanaged(T){}` default init | implicit default     | must use `.empty` or `.{ .items = &.{}, .capacity = 0 }`                    | 5 test files                                |

Any one of these is a surgical fix; together they are a coordinated Zig 0.16 migration PR that Plan 07-02 should land.

**Outcome:** FAIL — classified `defer-to-07-02` (Zig 0.16 stdlib migration sweep).

## Step 4: Swift build (`swift build -c release` in `helper/`)

**Command:** `cd helper && swift build -c release`
**Working dir:** `/Users/jackshelton/dev/open-source/shoki/helper`
**Exit code:** `0`
**First 50 lines of combined stdout+stderr:**
```
[0/1] Planning build
Building for production...
[0/3] Write sources
[3/8] Write swift-version--58304C5D6DBC2206.txt
[5/9] Compiling ShokiRunnerProtocol ShokiRunnerProtocol.swift
[6/11] Compiling ShokiXPCClient ShokiXPCClient.swift
[6/11] Write Objects.LinkFileList
[8/11] Compiling ShokiRunnerService AXObserver.swift
[8/12] Linking libShokiXPCClient.dylib
[10/12] Compiling ShokiRunner main.swift
[10/12] Write Objects.LinkFileList
[11/12] Linking ShokiRunner
Build complete! (1.39s)
```
**Verify:** `test -f helper/.build/release/libShokiXPCClient.dylib` → PASS
`file libShokiXPCClient.dylib` → `Mach-O 64-bit dynamically linked shared library arm64`, 65,480 bytes.
**Outcome:** PASS

## Step 5: Swift test (`swift test` in `helper/`)

**Command:** `cd helper && swift test`
**Working dir:** `/Users/jackshelton/dev/open-source/shoki/helper`
**Exit code:** `0`
**First 50 lines of combined stdout+stderr:**
```
[0/1] Planning build
Building for debugging...
[0/5] Write swift-version--58304C5D6DBC2206.txt
Build complete! (0.09s)
Test Suite 'All tests' started at 2026-04-17 19:19:56.149.
Test Suite 'ShokiRunnerPackageTests.xctest' started at 2026-04-17 19:19:56.151.
Test Suite 'AXObserverTests' started at 2026-04-17 19:19:56.151.
Test Case '-[ShokiRunnerTests.AXObserverTests testAnonymousListenerStartAXObserverDebugEmit]' passed (0.312 seconds).
Test Case '-[ShokiRunnerTests.AXObserverTests testAXObserverSessionStopIdempotent]' passed (0.001 seconds).
Test Case '-[ShokiRunnerTests.AXObserverTests testProtocolSurfaceIncludesPingAndAXMethods]' passed (0.002 seconds).
Test Case '-[ShokiRunnerTests.AXObserverTests testServiceStartStopAXObserverIdempotent]' passed (0.001 seconds).
Test Case '-[ShokiRunnerTests.AXObserverTests testShokiClientProtocolConformanceCallable]' passed (0.000 seconds).
Test Suite 'AXObserverTests' passed: 5 tests, 0 failures.
Test Suite 'XPCPingTests' started at 2026-04-17 19:19:56.467.
Test Case '-[ShokiRunnerTests.XPCPingTests testAnonymousListenerPing]' passed (0.001 seconds).
Test Case '-[ShokiRunnerTests.XPCPingTests testServiceDirectCall]' passed (0.000 seconds).
Test Suite 'XPCPingTests' passed: 2 tests, 0 failures.
Test Suite 'ShokiRunnerPackageTests.xctest' passed: 7 tests, 0 failures.
Test Suite 'All tests' passed: 7 tests, 0 failures.
```
**Total:** 7 tests (5 AXObserver + 2 XPCPing), 0 failures, 0.317s wall.
**Outcome:** PASS

## Step 6: Helper .app bundle (`helper/scripts/build-app-bundle.sh`)

**Command:** `cd helper && bash scripts/build-app-bundle.sh`
**Working dir:** `/Users/jackshelton/dev/open-source/shoki/helper`
**Exit code:** `0`
**First 50 lines of combined stdout+stderr:**
```
[build-app-bundle] Building Swift package (configuration=release)
[0/1] Planning build
Building for production...
[0/3] Write swift-version--58304C5D6DBC2206.txt
Build complete! (0.10s)
[build-app-bundle] Bundle ready at /Users/jackshelton/dev/open-source/shoki/helper/ShokiRunner.app
```
**Verify:** `test -x helper/ShokiRunner.app/Contents/MacOS/ShokiRunner` → PASS
`ShokiRunner` executable, 99,400 bytes.
**Outcome:** PASS

## Step 7: N-API binding `.node` file

**Command:** `cp zig/zig-out/lib/libshoki.dylib packages/binding-darwin-arm64/shoki.node`
**Working dir:** `/Users/jackshelton/dev/open-source/shoki`
**Exit code:** `1` (source file doesn't exist because Step 2 failed)

The source `zig/zig-out/lib/libshoki.dylib` was never produced because Step 2 is blocked on the N-API glue rewrite (defer-to-07-02).

`node -e "require('./packages/binding-darwin-arm64/shoki.node').ping()"` — cannot be run; no `.node` file exists.

**Outcome:** FAIL — classified `blocked-by-Step-2` (downstream of the N-API glue rewrite). Also blocked: Step 8 (SDK native tests).

## Step 8: pnpm install

**Command:** `pnpm install`
**Working dir:** `/Users/jackshelton/dev/open-source/shoki`
**Exit code:** `0`
**First 50 lines of combined stdout+stderr:**
```
packages/binding-darwin-x64              |  WARN  Unsupported platform: wanted: {"cpu":["x64"],"os":["darwin"],"libc":["any"]}
Scope: all 9 workspace projects
Progress: resolved 0, reused 1, downloaded 0, added 0
Progress: resolved 315, reused 206, downloaded 25, added 0
Progress: resolved 382, reused 250, downloaded 53, added 0
 WARN  1 deprecated subdependencies found: prebuild-install@7.1.3
Packages: +111
Progress: resolved 409, reused 252, downloaded 54, added 111, done
Done in 2.8s
```
**Outcome:** PASS

## Step 9: Docs build (`pnpm --filter docs build`)

**Command:** `pnpm --filter docs build`
**Working dir:** `/Users/jackshelton/dev/open-source/shoki`
**Exit code:** `0`
**First 50 lines of combined stdout+stderr:**
```
> @shoki/docs@0.0.0 build /Users/jackshelton/dev/open-source/shoki/docs
> vitepress build

  vitepress v1.6.4

- building client + server bundles...
✓ building client + server bundles...
- rendering pages...
✓ rendering pages...
build complete in 2.13s.
```
**Verify:** `ls docs/.vitepress/dist/` → `404.html  api/  assets/  background/  favicon.svg  getting-started/  guides/  hashmap.json  index.html  logo.svg  vp-icons.css` — all expected files present.
**Outcome:** PASS

## Step 10: Playwright install chromium

**Command:** `cd examples/vitest-browser-react && npx playwright install chromium`
**Working dir:** `/Users/jackshelton/dev/open-source/shoki/examples/vitest-browser-react`
**Exit code:** `0`
**First 50 lines of combined stdout+stderr:**
```
(chromium already present in ~/Library/Caches/ms-playwright/chromium-{1200,1208,1217}; npx playwright install short-circuits and returns 0)
```
**Verify:** `ls ~/Library/Caches/ms-playwright/` shows `chromium-1200  chromium-1208  chromium-1217  chromium_headless_shell-{1200,1208,1217}  ffmpeg-1011  firefox-1509  webkit-2248`.
Attempted with `--with-deps` first; silent on this box (no sudo prompt needed because chromium archive was already cached). Re-ran without `--with-deps` and captured `$?=0`.
**Outcome:** PASS

## Supplementary checks (beyond the 10 scripted steps)

### Workspace typecheck (`pnpm -r typecheck`)

**Command:** `pnpm -r typecheck`
**Exit code:** `0`
**Output:**
```
packages/sdk typecheck$ tsc -p tsconfig.json --noEmit → Done
packages/matchers typecheck$ tsc -p tsconfig.json --noEmit → Done
packages/doctor typecheck$ tsc -p tsconfig.json --noEmit → Done
packages/vitest typecheck$ tsc -p tsconfig.json --noEmit → Done
examples/vitest-browser-react typecheck$ tsc -p tsconfig.json --noEmit → Done
```
**Outcome:** PASS

### SDK tests without native (`pnpm --filter @shoki/sdk test`)

**Command:** `pnpm --filter @shoki/sdk test`
**Exit code:** `0`
**Tests:** 45 passed, 11 skipped (3 ping + 3 noop-roundtrip + 2 crash-recovery + 2 integration + 1 stress — all SHOKI_NATIVE_BUILT / SHOKI_INTEGRATION gates).
**Outcome:** PASS (with expected gating; 11 skipped because `SHOKI_NATIVE_BUILT=1` can't be set until Step 2 produces `shoki.node`).

## Acceptance Criteria

| Truth | Status | Evidence |
|-------|--------|----------|
| Zig 0.16.x installed | PASS | `zig version` output: `0.16.0`. Installed via `brew install zig` (step 1). |
| `zig build` produces libshoki.dylib | FAIL | step 2 exit=1. Blocker: `src/root.zig` (formerly `core/napi.zig`) uses `napi_zig.napi.Env` + `Val.fromString` etc.; real napi-zig 0.1.0 exports directly at root and uses `env.createString(...)`. Full N-API glue rewrite required. Defer to Plan 07-02. |
| `zig build test` passes 10 tests | FAIL | step 3 exit=1, 18 Zig 0.16 stdlib/language migration errors across 9 files (see Step 3 table). Defer to Plan 07-02. |
| `swift build -c release` ok | PASS | step 4 exit=0. `libShokiXPCClient.dylib` size 65,480 bytes, `Mach-O 64-bit dynamically linked shared library arm64`. |
| `swift test` ok | PASS | step 5 exit=0. 7 tests, 0 failures, 0.317s wall. |
| build-app-bundle.sh ok | PASS | step 6 exit=0. `helper/ShokiRunner.app/Contents/MacOS/ShokiRunner` present, 99,400 bytes, executable. |
| shoki.node loads + ping() works | FAIL | step 7 exit=1 (blocked-by-step-2; source dylib never produced). |
| pnpm --filter docs build ok | PASS | step 9 exit=0. `docs/.vitepress/dist/index.html` (19,996 bytes) + `404.html`, `api/`, `assets/`, `hashmap.json` all present. |
| npx playwright install chromium ok | PASS | step 10 exit=0. Chromium archives already cached at `~/Library/Caches/ms-playwright/chromium-1217` (and 1200/1208 as alternates). |

**Toolchain gate: RED. Failed: `zig build` (Step 2), `zig build test` (Step 3), `shoki.node + ping` (Step 7 — blocked by Step 2). Classification: all three map to a coordinated Zig 0.16 migration + N-API glue rewrite. See Plan 07-02 for triage.**

## Summary of fixes applied autonomously in this plan

These were Rule-3 blocking issues in the toolchain wiring itself (NOT the driver code or stdlib consumers — those are Plan 07-02's territory). Each fix was applied in the course of running Step 2 / Step 3:

1. `zig/build.zig.zon`: fingerprint `0x5305c51ed7a9bc01` → `0x46448382d63a18be` (Zig 0.16 forked-package rule).
2. `zig/build.zig.zon`: `.hash = "UPDATE_VIA_ZIG_FETCH"` → real hash `napi_zig-0.1.0-XRkY0T1FAQDYQ-32h7Ru7iLXhZfrXY4OajfvO5tqDlmN` from `zig fetch --save`.
3. `zig/build.zig.zon`: added `"test"` and `"all_tests.zig"` to `.paths`.
4. `zig/build.zig`: ported to Zig 0.16 Build API (`b.createModule` + `b.addLibrary{ .linkage = .dynamic }` replaces deprecated `b.addSharedLibrary`).
5. `zig/build.zig`: moved `addLibraryPath` / `linkSystemLibrary` / `addRPath` from `*Compile` to `*Module`; added the now-required `.{}` options to `linkSystemLibrary`.
6. `zig/build.zig`: `napi_dep.module("napi_zig")` → `napi_dep.module("napi")` (real exported name).
7. `zig/build.zig`: tests now compile through a single aggregator `zig/all_tests.zig` (Zig 0.16's stricter `@import` path enforcement forbids `../src/...` from `test/` unless the Module root covers both directories).
8. `zig/all_tests.zig`: created; comptime-imports each of the 10 test files.
9. `zig/src/root.zig`: created as the library root source, with imports rewritten to be relative to `src/` (so `src/core/registry.zig`'s `../drivers/...` imports resolve against a Module root that covers both subtrees).
10. `zig/src/drivers/voiceover/defaults.zig:321`: removed `|_|` discard-capture (Zig 0.16 parser rejects it).
11. `zig/test/voiceover_integration_test.zig:6-8`: `///` → `//` (Zig 0.16 rejects doc comments on `test` blocks).
12. `.gitignore`: added `zig/zig-pkg/` (Zig package cache) and `/amp` (stray tool-dump file).

These are recorded here rather than as independent commits because they are all required to make the failure mode in Steps 2/3 *legible* — without them, `zig build` couldn't even reach the real N-API / stdlib errors.

## Deferred to Plan 07-02

Plan 07-02's scope was originally "link-path for `libShokiXPCClient.dylib` + `realAppleScriptSpawner` implementation". This run surfaces two additional must-do items for Plan 07-02:

- **A. N-API glue rewrite against real napi-zig 0.1.0.** `src/root.zig` (formerly `src/core/napi.zig`) needs its calls rewritten:
    - `napi.Val.fromString(s)` → `env.createString(s)`
    - `napi.Val.fromU32(x)` → `env.createUint32(x)`
    - `napi.Val.fromU64(x)` → `env.createBigintUint64(x)` (or `env.createInt64` if <2^53 safe)
    - `napi.Val.fromBool(b)` → `env.createBoolean(b)`
    - `napi.Val.fromBuffer(env, buf)` → `env.createBuffer(buf)` or the napi-zig equivalent
    - Import becomes `const napi = @import("napi_zig");` (drop `.napi` sub-namespace)

- **B. Zig 0.16 stdlib migration sweep.** Across `src/core/wire.zig`, `src/drivers/noop/driver.zig`, `src/drivers/voiceover/{ax_notifications,defaults,lifecycle}.zig`, and 5 test files:
    - `std.io.*` → `std.Io` (Zig 0.16 renamed)
    - `std.time.nanoTimestamp` → `std.time.Instant.now()` delta math
    - `std.Thread.sleep` → `std.time.sleep`
    - `std.Thread.Mutex` → verify new path (it still exists in some form; error says otherwise, inspect)
    - `std.process.Child.init(...)` → struct-literal init
    - `ArrayListUnmanaged(T){}` → `.empty` or explicit `.{ .items = &.{}, .capacity = 0 }`
    - `std.testing.refAllDeclsRecursive` in `all_tests.zig` — use `std.testing.refAllDecls` or drop entirely (Zig 0.16 test discovery does the right thing via the comptime imports).

## Downstream impact

- **Plan 07-02 (Known stubs + link path)**: Must tackle items A + B above before any downstream plan can get a working `.node`. Originally scoped to ~100 LoC; actual scope is closer to ~400-600 LoC across the Zig migration sweep.
- **Plan 07-03, 07-04 (API reshape + TCC)**: Blocked on 07-02 — can't run integration tests without a working native binding.
- **Plan 07-06 (real-VO Vitest)**: Doubly blocked (needs 07-02 artifact + 07-03 API).
- **Non-blocked by RED rows**: docs build (Step 9) and swift chain (Steps 4-6) are GREEN and ready for downstream consumers.
