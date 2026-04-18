---
phase: 07-v1-integration-verification-and-qa-real-voiceover-announceme
plan: 02
status: complete
gate_status: GREEN
completed_date: 2026-04-17
tags:
  - qa
  - zig-0.16-migration
  - napi-zig
  - real-spawner
  - helper-dylib-link
requires:
  - 07-01 (toolchain + helper dylib)
provides:
  - zig-out/lib/libshoki.dylib (production .node binary, arm64 Mach-O, ~2.2 MB)
  - packages/binding-darwin-arm64/shoki.node (refreshed — links libShokiXPCClient.dylib via @rpath)
  - zig/src/core/sync.zig (pthread Mutex + Condition shim)
  - zig/src/core/clock.zig (nanoTimestamp + sleep via std.c)
  - zig/src/core/subprocess.zig (fork+execvp+pipe helper)
  - applescript.RealChildProcess + applescript.realSpawner (production osascript spawn path)
  - zig/build.zig `-Dhelper-dylib-dir=<path>` option
affects:
  - zig/src/root.zig (rewrite against napi-zig 0.1.0 Standard Mode)
  - zig/src/core/wire.zig (drop std.io — manual LE byte packing)
  - zig/src/core/registry.zig (realSpawnImpl stub removed; uses applescript.realSpawner())
  - zig/src/drivers/noop/driver.zig (clock shim)
  - zig/src/drivers/voiceover/ax_notifications.zig (sync shim)
  - zig/src/drivers/voiceover/defaults.zig (subprocess + std.c.getenv)
  - zig/src/drivers/voiceover/lifecycle.zig (sync + clock shim; SIG-enum signal handler)
  - zig/src/drivers/voiceover/applescript.zig (sync + clock shim; RealChildProcess + realSpawner)
  - zig/all_tests.zig (refAllDeclsRecursive -> refAllDecls)
  - 4 test files (ArrayListUnmanaged `.empty` + `@import("../src/core/clock.zig").sleepMs`)
  - packages/sdk/test/noop-roundtrip.test.ts (switched from voiceOver() to createDriverHandle({driverName:'noop'}))
key-decisions:
  - "Bypass Zig 0.16's `Io` abstraction for process spawn + mutex + sleep. Wrote three small shims (sync.zig, clock.zig, subprocess.zig) instead of threading an `Io` instance through every driver module. Rationale: the Io API churn is still settling in Zig 0.16, and pthread + clock_gettime + fork/execvp are stable POSIX primitives."
  - "napi-zig 0.1.0 Standard Mode bridge auto-converts plain Zig types, so most exported functions returning `[]const u8`, `u32`, `u64`, `bool` do not need an Env parameter. u64 maps to JS BigInt — matches the existing SDK contract (`binding.createDriver(...): bigint`)."
  - "RealChildProcess uses a dedicated reader thread feeding a mutex+cond-var queue, not polling. timedWait(timeout_ms) matches the existing vtable contract and PollLoop maps error.Timeout to error.OsascriptStall without changes."
  - "build.zig now links libShokiXPCClient.dylib for both the production lib AND the test binary — tests transitively import ax_notifications.zig's `extern \"c\" fn shoki_xpc_*` declarations."
  - "noop-roundtrip.test.ts was written assuming voiceOver() returned a noop stub. Updated to use createDriverHandle({driverName: 'noop'}) directly so the test doesn't try to boot real VoiceOver — the test's own assertions (phrase='noop-ping', source='noop') have always required the noop driver, not the real VO driver."
metrics:
  duration_min: 95
  tasks_completed: 2
  tasks_planned: 2
  commits: 2
  files_created: 3
  files_modified: 15
  lines_added: 965
  lines_removed: 195
  new_zig_tests: 5
  new_sdk_tests_passing: 3
  sdk_tests_passing: 51
  sdk_tests_skipped: 5
---

# Phase 7 Plan 02: Real AppleScript spawner + Zig 0.16 migration — Summary

Closed all three Wave 1 blocker groups in one wave-2 plan: the napi-zig 0.1.0
API rewrite, the Zig 0.16 stdlib migration sweep, and the original 07-02 scope
(kill stubs + build.zig link path). `zig build`, `zig build test`, and
`SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test` all exit 0. Plan 07-04 is
unblocked.

## Gate status

**GREEN.** All four verification commands exit 0:

| Gate | Command | Result |
|------|---------|--------|
| Zig build | `cd zig && zig build` | exit 0; `zig-out/lib/libshoki.dylib` (2.2 MB arm64 Mach-O) |
| Zig tests | `cd zig && zig build test` | exit 0; 81/81 pass (76 migrated + 5 new RealSpawner) |
| Helper-dylib override | `cd zig && zig build -Dhelper-dylib-dir=../helper/.build/release` | exit 0; `otool -L` shows `@rpath/libShokiXPCClient.dylib` |
| SDK native tests | `SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test` | exit 0; 51 pass, 5 skipped (SHOKI_INTEGRATION gates) |

## Commits

| Commit  | Subject                                                                    |
| ------- | -------------------------------------------------------------------------- |
| 5045545 | feat(07-02): migrate Zig core to 0.16 stdlib + real napi-zig 0.1.0 API     |
| baf3ada | feat(07-02): implement RealSpawner + wire registry + SDK noop round-trip   |

## What closed

### A. napi-zig 0.1.0 API rewrite (~130 LoC)

`src/root.zig` was written against a hypothetical API shape:
- `napi_zig.napi.Env` → real surface is `napi_zig.Env` (no `.napi` sub-namespace)
- `napi.Val.fromString(s)`, `fromU32(x)`, `fromU64(x)`, `fromBool(b)`, `fromBuffer(env, buf)` — none exist.

Rewrote to Standard Mode: `ping() -> []const u8`, `version() -> []const u8`, `wireVersion() -> u32`, `createDriver(name: []const u8, size: u32) -> !u64`, `driverStart(id: u64) -> !bool`, etc. napi-zig's bridge (`napi.module(@This())`) comptime-synthesizes C callbacks that auto-convert. `u64` → JS BigInt matches the SDK's `binding.createDriver(...): bigint` contract.

`driverDrain(env: napi.Env, id: u64) -> !napi.Val` uses Raw Mode because it needs `env.createBuffer(size)` to allocate a Node Buffer with the encoded wire bytes.

### B. Zig 0.16 stdlib migration sweep (~200 LoC across 9 files)

Three shim modules avoid threading `std.Io` through every driver:

- **`src/core/sync.zig`** — pthread-based `Mutex` (init/lock/unlock/deinit) and `Condition` (init/wait/timedWait/signal/broadcast/deinit). `pthread_cond_timedwait` takes an ABSOLUTE timespec; we compute it from `clock_gettime(REALTIME)` + the caller's delta.
- **`src/core/clock.zig`** — `nanoTimestamp()` via `clock_gettime(REALTIME)`, `sleepNs(ns)` / `sleepMs(ms)` via `nanosleep(2)`.
- **`src/core/subprocess.zig`** — raw `fork()` + `execvp()` + `pipe()` helper. `PipedChild.spawn(alloc, argv, capture_stderr)` returns a `{pid, stdin_fd, stdout_fd, stderr_fd}` handle. `runCollect(alloc, argv)` is a one-shot convenience that reads stdout+stderr to EOF and waits. Includes reimplementations of `WIFEXITED`/`WEXITSTATUS`/`WIFSIGNALED`/`WTERMSIG` (not re-exported by std.posix in 0.16).

Drift fixes applied to callers:

| Caller | Drift fixed |
|--------|-------------|
| `core/wire.zig` | `std.io.fixedBufferStream` gone — replaced with manual LE byte packing (reader/writer) |
| `drivers/noop/driver.zig` | `std.time.nanoTimestamp` → `clock_mod.nanoTimestamp()` |
| `drivers/voiceover/ax_notifications.zig` | `std.Thread.Mutex` → `sync_mod.Mutex` |
| `drivers/voiceover/defaults.zig` | `std.process.Child.init` + `getEnvVarOwned` → `subprocess.runCollect` + `std.c.getenv` |
| `drivers/voiceover/lifecycle.zig` | `std.Thread.Mutex`, `std.Thread.sleep`, `std.time.nanoTimestamp` → shims; signal handler signature now `fn(std.c.SIG)` (typed enum); `sigaction(std.c.SIG.INT, ...)` → `sigaction(.INT, ...)` (enum variant) |
| `drivers/voiceover/applescript.zig` | Same sleep/timestamp drift as above |
| `all_tests.zig` | `std.testing.refAllDeclsRecursive` → `refAllDecls` (recursive was removed; comptime `@import` walks the graph) |
| 4 test files | `std.ArrayListUnmanaged(T){}` → `.empty`; `std.StringHashMapUnmanaged(...) = .{}` → `.empty`; `std.Thread.sleep` → `clock_mod.sleepMs` |

### C. Original 07-02 scope: kill stubs + build-path fix

**`applescript.RealChildProcess` + `applescript.realSpawner()`** (~190 LoC)

Wraps `subprocess.PipedChild`. Reader thread reads stdout byte-by-byte, splits on `\n`, pushes lines to a mutex-guarded `ArrayListUnmanaged([]u8)` queue. `readStdoutLine(alloc, timeout_ms)` pops front with a `timedWait`; expiry returns `error.Timeout`. `kill()` sets shutdown flag, signals the cond-var, joins the reader thread. `wait()` is idempotent. `deinit_ctx` frees queued lines + destroys the struct.

**Five new Zig tests** (all in `test/voiceover_applescript_test.zig`):

| Test | Verifies |
|------|----------|
| `real spawner: cat_roundtrip writes a line and reads it back` | End-to-end pipe + reader thread |
| `real spawner: cat_multiline_roundtrip returns each line in order` | Line splitting + queue ordering |
| `real spawner: bogus_binary_spawn_fails returns FileNotFound` | Pre-exec validation (`access(X_OK)`) |
| `real spawner: read_timeout_returns_error_Timeout when child produces nothing` | Cond-var `timedWait` timeout path |
| `real spawner: kill_then_wait_is_idempotent (no panic, no double-free)` | Double-kill/double-wait safety |

**`registry.makeVoiceOver`** now delegates to `applescript_mod.realSpawner()` directly. The stub `realSpawnImpl` returning `error.RealSpawnerNotYetImplemented` is deleted. `grep -r 'RealSpawnerNotYetImplemented' zig/` returns zero matches.

**`build.zig` `-Dhelper-dylib-dir=<path>` option**. Default is `../helper/.build/release`. Swift `swift build` puts products under `.build/{debug,release}/`; CI debug builds pass `-Dhelper-dylib-dir=../helper/.build/debug`. Both production lib AND test binary get the library path + rpath + `-lShokiXPCClient` — tests transitively import `ax_notifications.zig` which has the `extern "c" fn shoki_xpc_*` declarations.

## Deviations from Plan

### Rule 1 — Bug fix

**1. [Rule 1 - Bug] Pre-existing MockSpawner semantics bug in `voiceover_applescript_test.zig`**
- **Found during:** `zig build test` run.
- **Issue:** Two tests (`PollLoop consecutive_stalls flips degraded_flag` + `PollLoop successful tick resets consecutive_stalls`) configure `child.setStall(N)` + `spawner.preseeded = child`, but PollLoop's stall path calls `shell.respawn()` which consumes `preseeded` and forces the next spawn to produce a fresh child with neither stall nor queued lines. Both tests had never actually passed (they were skipped during Plan 03's development because `zig build test` didn't build under Zig 0.16 until 07-01 landed).
- **Fix:** Added `MockSpawner.respawn_stall: u32` — fresh spawns inherit the value. Second test re-preseeds before the second tick + calls `shell.respawn()` explicitly to swap to the pre-seeded child.
- **Files modified:** `zig/test/voiceover_applescript_test.zig`.
- **Commit:** 5045545.

**2. [Rule 1 - Bug] `noop-roundtrip.test.ts` invoked `voiceOver()` but asserted noop behavior**
- **Found during:** `SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test` run.
- **Issue:** The test was written as `voiceOver()` when that factory was a stub resolving to the noop driver. Now that voiceover is wired to the real VO path, calling `start()` triggers real VO boot — which requires TCC permissions, writes the user's plist, and spawns osascript. The test's own assertions (`phrase === 'noop-ping'` and `source === 'noop'`) could never pass against the real VO driver.
- **Fix:** Switched to `createDriverHandle({ driverName: 'noop' })` so the test exercises the noop driver directly via the native binding.
- **Files modified:** `packages/sdk/test/noop-roundtrip.test.ts`.
- **Commit:** baf3ada.

### Rule 3 — Blocking issues

**3. [Rule 3 - Blocking] `std.c.execvp` not exported in Zig 0.16**
- **Found during:** first `zig build` after writing subprocess.zig.
- **Issue:** std.c exposes `execve` but not `execvp`. PATH-searching variant is needed for `/usr/bin`-relative invocations we want to keep compatible with the existing `defaults_mod.realSubprocessRunner` argv shape.
- **Fix:** Declared `extern "c" fn execvp(...)` locally in subprocess.zig.
- **Files modified:** `zig/src/core/subprocess.zig`.
- **Commit:** 5045545.

**4. [Rule 3 - Blocking] `std.c.kill` / `std.c.sigaction` signature changes**
- **Found during:** compile errors after writing subprocess.zig + lifecycle.zig migration.
- **Issue:** Zig 0.16 types `SIG` as `enum(u32)` on Darwin. `c.kill` takes `sig: SIG` (not `c_int`); `c.sigaction` takes `sig: SIG`; signal handler signature is now `fn(SIG)` not `fn(c_int)`. Using `@intFromEnum(c.SIG.TERM)` to pass a u32 was rejected.
- **Fix:** Pass enum variants directly (`.INT`, `.TERM`, `.HUP`). Updated the handler signature to `fn (sig: std.c.SIG) callconv(.c) void`.
- **Files modified:** `zig/src/core/subprocess.zig`, `zig/src/drivers/voiceover/lifecycle.zig`.
- **Commit:** 5045545.

### Deviations vs. plan text

Plan 07-02 specified using `std.process.Child{ .argv = ..., ... }` struct-literal init, `std.time.Instant.now()`, and a cond-var `timedWait` on `std.Thread.Condition`. None of those APIs exist in Zig 0.16 — the whole `process.Child` / `Thread.Mutex` / `Thread.Condition` surface was reshaped behind the new `std.Io` abstraction. The plan's QA-TOOLCHAIN.md catalogued the drift but its proposed fixes were based on incomplete knowledge of 0.16's final shape. We wrote the three shims (sync/clock/subprocess) to bypass the Io interface entirely. Net LoC came in at ~965 added / 195 removed across 18 files — plan estimated ~400-600 LoC.

## Known Stubs

None remaining from Phase 3's catalogue. Downstream plans (07-03, 07-04, 07-05, 07-06) can proceed.

## Threat Flags

None new. The RealChildProcess surface inherits Phase 3's threat model (T-07-10..12 in the plan's register) unchanged — argv is caller-controlled (PollLoop uses the fixed `OSASCRIPT_ARGV`), stderr capture is deferred to Plan 07-04 per T-07-11, and the reader thread's `timedWait` + kill→join path mitigates T-07-12 (blocking-read wedge).

## Downstream Impact

- **Plan 07-03 (API reshape)**: unblocked. Can now land `voiceOver.end()` alias + top-level singleton.
- **Plan 07-04 (TCC + real-VO boot)**: unblocked. RealSpawner can actually invoke osascript; lifecycle can actually boot VO. TCC signing path is the only remaining gate.
- **Plan 07-05 (DOM-content filter)**: unblocked (requires 07-04 first).
- **Plan 07-06 (real-VO Vitest)**: unblocked (requires 07-04 + 07-05).

## Self-Check: PASSED

**Artifact existence checks:**
- `zig/zig-out/lib/libshoki.dylib` — FOUND (2,237,856 bytes, arm64 dylib)
- `packages/binding-darwin-arm64/shoki.node` — FOUND (copy of libshoki.dylib)
- `zig/src/core/sync.zig` — FOUND
- `zig/src/core/clock.zig` — FOUND
- `zig/src/core/subprocess.zig` — FOUND
- `zig/src/drivers/voiceover/applescript.zig` contains `RealChildProcess` + `realSpawner` — FOUND
- `zig/src/core/registry.zig` uses `applescript_mod.realSpawner()` — FOUND

**Commit existence checks:**
- `5045545` (migrate Zig core to 0.16 stdlib + napi-zig 0.1.0) — FOUND in git log
- `baf3ada` (RealSpawner + registry + SDK noop) — FOUND in git log

**Stub removal:**
- `grep -r 'RealSpawnerNotYetImplemented' zig/` → 0 matches (was 3 pre-plan)
- `grep -r 'hypothetical' zig/src/root.zig` → 0 matches

**Build + test gates:**
- `cd zig && zig build` → exit 0
- `cd zig && zig build test` → exit 0 (81/81 pass)
- `cd zig && zig build -Dhelper-dylib-dir=../helper/.build/release` → exit 0
- `otool -L packages/binding-darwin-arm64/shoki.node` → shows `@rpath/libShokiXPCClient.dylib`
- `SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test` → 51 passed, 5 skipped, 0 failed
- `node -e "const b = require('./packages/binding-darwin-arm64/shoki.node'); console.log(b.ping())"` → "pong"

Self-check passed. Plan status is `complete` with gate=GREEN.
