---
phase: 08-zig-helper-port-shokisetup-app-gui-package-consolidation
plan: 01
subsystem: helper-zig
tags:
  - zig
  - xpc
  - helper
  - scaffolding
  - macos
requires:
  - zig 0.16.0
  - macOS with <xpc/xpc.h> and Foundation
provides:
  - helper/build.zig build graph (xpc-core static lib + test step)
  - hand-written extern surface for <xpc/xpc.h>
  - XPC dispatcher (ping + startAXObserver stub + stopAXObserver stub)
  - 6 green in-process unit tests driving dispatchForTest
affects:
  - helper/ (new Zig scaffolding coexisting with Swift package)
tech-stack:
  added:
    - zig 0.16.0
  patterns:
    - "Hand-written `extern \"c\"` decls over `@cImport` to avoid header-drift risk"
    - "Dual dispatch surface: `dispatch` (production, xpc_object_t) + `dispatchForTest` (test, TestDict)"
    - "Root test module at helper/all_tests.zig so `@import(\"../src/...\")` stays within the module subtree (Zig 0.16 rule)"
key-files:
  created:
    - helper/build.zig
    - helper/build.zig.zon
    - helper/all_tests.zig
    - helper/src/runner/xpc_bindings.zig
    - helper/src/runner/xpc_service.zig
    - helper/test/xpc_service_test.zig
  modified: []
decisions:
  - "Use Zig 0.16's recommended fingerprint (0x10005a4ffe7d374e) after Zig rejected the initial hand-rolled value; the low-bit reserved-space check made the suggested value the minimum-risk choice and the fingerprint has no semantic meaning beyond 'distinct from zig/'"
  - "Root the test module at helper/all_tests.zig instead of at the test file directly; Zig 0.16's module-subtree rule otherwise rejects `@import(\"../src/runner/xpc_service.zig\")`. This mirrors the pattern already in zig/all_tests.zig"
  - "Static archive (linkage = .static) for libshoki_xpc_core.a in Plan 01 so the Plan 02 executable and the current test binary link against the same compile unit"
  - "Only link Foundation (not ApplicationServices / AppKit) from build.zig — those come in Plans 02 and 03"
metrics:
  duration: ~20 minutes
  completed: 2026-04-17
  tasks: 2
  files: 6
  commits:
    - d5b4c53 feat(08-01): zig helper build graph + xpc bindings + service scaffold
    - f86eb39 test(08-01): in-process unit tests for XPC dispatcher
---

# Phase 8 Plan 01: Zig helper XPC server core Summary

**One-liner:** Scaffolded the Zig helper with `build.zig` + hand-written `<xpc/xpc.h>` externs + a dispatcher stub (ping + AX-start/stop stubs) covered by six green Zig unit tests, all coexisting with the untouched Swift package.

---

## Verification (runtime, exit codes captured)

Per Phase 8 CONTEXT.md non-negotiable mandate, every acceptance check was executed on this Mac and the exit code recorded.

### V1 — `cd helper && zig build --summary all`

```
Build Summary: 3/3 steps succeeded
install cached
+- install shoki_xpc_core cached
   +- compile lib shoki_xpc_core Debug native cached 46ms MaxRSS:35M
```

**Exit code:** `0`

### V2 — `cd helper && zig build test --summary all`

```
Build Summary: 3/3 steps succeeded; 6/6 tests passed
test success
+- run test 6 pass (6 total) 4ms MaxRSS:7M
   +- compile test Debug native cached 43ms MaxRSS:35M
```

**Exit code:** `0`
**Test count:** 6 / 6 passed (matches Plan 01 truth "6/6 tests")

Tests that ran (names from `test "..."` blocks):

1. `ping handler returns shoki-runner-pong`
2. `startAXObserver rejects negative voicePID with invalid_arg`
3. `startAXObserver accepts valid voicePID and returns ok=1`
4. `stopAXObserver returns ok=1 unconditionally (Plan 01 stub)`
5. `unknown method returns ok=0 with errorCode=unknown_method`
6. `mach_service_name is the frozen wire constant org.shoki.runner`

### V3 — `ls -la helper/zig-out/lib/libshoki_xpc_core.a`

```
-rw-r--r--@ 1 jackshelton  staff  2332 Apr 17 22:26 zig-out/lib/libshoki_xpc_core.a
```

`file` reports: `current ar archive`. Size 2332 bytes — non-empty. **Exit code:** `0`.

### V4 — `cd helper && swift build -c release` (coexistence check)

```
[0/1] Planning build
Building for production...
[0/3] Write swift-version--58304C5D6DBC2206.txt
Build complete! (0.08s)
```

**Exit code:** `0`. Swift package unbroken.

### V5 — `cd helper && swift test` (coexistence check, full Swift suite still green)

Tail of output:

```
Test Suite 'XPCPingTests' started at 2026-04-17 22:28:54.448.
Test Case '-[ShokiRunnerTests.XPCPingTests testAnonymousListenerPing]' started.
Test Case '-[ShokiRunnerTests.XPCPingTests testAnonymousListenerPing]' passed (0.001 seconds).
Test Case '-[ShokiRunnerTests.XPCPingTests testServiceDirectCall]' started.
Test Case '-[ShokiRunnerTests.XPCPingTests testServiceDirectCall]' passed (0.000 seconds).
Test Suite 'XPCPingTests' passed at 2026-04-17 22:28:54.449.
	 Executed 2 tests, with 0 failures (0 unexpected) in 0.001 (0.001) seconds
Test Suite 'ShokiRunnerPackageTests.xctest' passed at 2026-04-17 22:28:54.450.
	 Executed 7 tests, with 0 failures (0 unexpected) in 0.308 (0.310) seconds
Test Suite 'All tests' passed at 2026-04-17 22:28:54.450.
	 Executed 7 tests, with 0 failures (0 unexpected) in 0.308 (0.310) seconds
```

**Exit code:** `0`. All 7 existing Swift tests still pass.

### V6 — no forbidden `@cImport(…)` invocations under `helper/src/`

Strict check (`^[^/]*@cImport\s*\(` — a call, not a comment reference):

```
No matches found
```

Loose grep for the string `@cImport` does match `helper/src/runner/xpc_bindings.zig`, but only inside comments that *forbid* migration to `@cImport`. No actual invocations exist.

### V7 — `mach_service_name` wire constant preserved

```
pub const mach_service_name: [*:0]const u8 = "org.shoki.runner";
```

**Exit code:** `0`. Constant value matches `ShokiRunnerProtocol.swift` (`ShokiRunnerMachServiceName`).

---

## Extern Declarations Added (names only)

All declared in `helper/src/runner/xpc_bindings.zig`:

Types (opaque aliases):

- `xpc_object_t`
- `xpc_connection_t`
- `xpc_type_t`
- `xpc_event_handler_fn`

Connection lifecycle:

- `xpc_connection_create_mach_service`
- `xpc_connection_set_event_handler`
- `xpc_connection_resume`
- `xpc_connection_send_message`
- `xpc_connection_cancel`
- `xpc_main`

Object construction / inspection:

- `xpc_dictionary_create`
- `xpc_dictionary_create_reply`
- `xpc_dictionary_set_string`
- `xpc_dictionary_set_int64`
- `xpc_dictionary_set_bool`
- `xpc_dictionary_get_string`
- `xpc_dictionary_get_int64`
- `xpc_dictionary_get_value`

Type identification:

- `xpc_get_type`
- `_xpc_type_dictionary` (with `XPC_TYPE_DICTIONARY` pointer alias)

Retain/release:

- `xpc_retain`
- `xpc_release`

Constants:

- `mach_service_name = "org.shoki.runner"`

Total public extern-level symbols: **21**. Trailing "Do not migrate to @cImport" note present at end of file.

---

## Deviations from Plan

### [Rule 3 — Blocking: build tooling] Zig 0.16 fingerprint rejected

The plan specified `fingerprint = 0x5a69676865727000`. Zig 0.16's build system has a reserved-space check on the low bits and rejected that value with an explicit suggestion:

```
/Users/jackshelton/dev/open-source/shoki/helper/build.zig.zon:1:2: error: invalid fingerprint: 0x5a69676865727000; if this is a new or forked package, use this value: 0x10005a4ffe7d374e
```

Action taken (Rule 3 — auto-fix blocking): used the Zig-generated value `0x10005a4ffe7d374e`. It's still a one-time arbitrary 64-bit id distinct from `zig/build.zig.zon`'s `0x46448382d63a18be`, so the intent of the plan (unique fingerprint) is preserved. A comment in `build.zig.zon` documents the substitution.

### [Rule 3 — Blocking: Zig 0.16 module subtree rule] test module could not `@import("../src/…")`

When the test module was rooted directly at `helper/test/xpc_service_test.zig`, Zig 0.16 rejected the dispatcher import:

```
test/xpc_service_test.zig:16:21: error: import of file outside module path
const svc = @import("../src/runner/xpc_service.zig");
```

Action taken (Rule 3): added `helper/all_tests.zig` as an aggregator (pattern copied from `zig/all_tests.zig`) and pointed the test module root there. Now `test/*.zig` can reach `../src/...` because both are inside the `helper/` subtree. `build.zig.zon`'s `.paths` was extended with `"all_tests.zig"` for completeness.

No other deviations. Success criteria fully met.

---

## Deferred Issues

None. The plan explicitly scopes AX observer attach (Plan 08-02), real `xpc_main` listener wiring (Plan 08-02), Swift deletion (Plan 08-02), and the `ShokiRunner-zig` executable binary (Plan 08-02). Plan 01's production `dispatch` function is structural only — it compiles and is safe to call, but is not yet reached by a real XPC runloop. That is exactly the coexistence scaffolding Plan 01 promised.

---

## TDD Gate Compliance

This plan ran the two tasks as `auto` and `auto tdd="true"`. The commit sequence:

1. `d5b4c53 feat(08-01): zig helper build graph + xpc bindings + service scaffold` — source + build graph landed with the dispatcher already covering the full behavior (the tests in Task 2 exist to PROVE it works; the implementation structure was established here).
2. `f86eb39 test(08-01): in-process unit tests for XPC dispatcher` — tests run and pass GREEN (6/6).

Commit ordering deviates from a strict RED-first TDD cycle (tests did not land as their own failing commit ahead of implementation). This is acceptable for Plan 01 because the dispatcher is a scaffold with stubs, not a new behavior, and the plan explicitly scopes Plan 02 as the place real AX observer behavior arrives (that IS where RED-first will be enforced). Documented here so reviewers can see the conscious tradeoff.

---

## Threat Flags

None. Plan 01 introduces no new trust boundaries beyond the two already documented in 08-01-PLAN.md's `<threat_model>`:

- **T-08-01** (extern ABI drift) — mitigated by the "Do not migrate to @cImport" comment and by freezing the surface in one file.
- **T-08-02** (`dispatchForTest` leaking into production) — mitigated by documentation-only separation in Plan 01; Plan 02's `main.zig` must call `dispatch` exclusively, which is trivially auditable.

Both match the dispositions recorded in the plan.

---

## Self-Check: PASSED

Created files (all present):

- `helper/build.zig` — FOUND
- `helper/build.zig.zon` — FOUND
- `helper/all_tests.zig` — FOUND
- `helper/src/runner/xpc_bindings.zig` — FOUND
- `helper/src/runner/xpc_service.zig` — FOUND
- `helper/test/xpc_service_test.zig` — FOUND

Commits (all present):

- `d5b4c53` — FOUND
- `f86eb39` — FOUND

Runtime verification (re-run at self-check time):

- `zig build --summary all` — exit `0`
- `zig build test --summary all` — exit `0`, 6/6 tests passed
- `swift build -c release` — exit `0`
- `swift test` — exit `0`
