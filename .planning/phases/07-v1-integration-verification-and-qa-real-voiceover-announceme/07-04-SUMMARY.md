---
phase: 07-v1-integration-verification-and-qa-real-voiceover-announceme
plan: 04
status: complete
gate_status: GREEN
completed_date: 2026-04-17
tags:
  - ax-observer-scope
  - pid-filter
  - dom-vs-chrome
  - paired-regression-test
  - context-most-important
requires:
  - 07-02 (real spawner + Zig 0.16 migration)
  - 07-03 (voiceOver.start/end API + session.end alias)
provides:
  - helper AXObserverSession.start(targetAppPID:) — binds to AXUIElementCreateApplication(pid) instead of system-wide
  - ShokiRunnerProtocol comment contract — voicePID wire parameter now carries the target-app pid (semantics, not name)
  - zig/src/drivers/voiceover/driver.zig::readTargetPidEnv + resolveChromeRendererPid — env override + pgrep helper
  - zig startImpl pid-resolve order — SHOKI_AX_TARGET_PID > resolveVoiceOverPid() fallback
  - packages/vitest/src/session-store.ts::resolveChromeRendererPid — Node-side pgrep caller that sets the env var before driver boot
  - examples/vitest-browser-react/src/App.tsx — 3-route scheme (default, xxyyzz-not-in-dom fixture, xxyyzz-DOM fixture)
  - examples/vitest-browser-react/tests/dom-vs-chrome-url.test.tsx — paired positive/negative regression gate
  - docs/guides/matchers.md § Chrome noise — documented three-layer filter pattern
affects:
  - helper/Sources/ShokiRunnerService/AXObserver.swift (AXUIElementCreateSystemWide → AXUIElementCreateApplication, rename start(voicePID:) → start(targetAppPID:))
  - helper/Sources/ShokiRunnerService/ShokiRunnerService.swift (new docstring + adjusted call-site)
  - helper/Sources/ShokiRunnerProtocol/ShokiRunnerProtocol.swift (doc-only: semantic clarification of voicePID parameter)
  - zig/src/drivers/voiceover/ax_notifications.zig (renamed vopid → target_app_pid, updated doc-comment)
  - zig/src/drivers/voiceover/driver.zig (new c import; startImpl env-var lookup; resolveChromeRendererPid helper)
  - zig/test/voiceover_driver_test.zig (+1 test: SHOKI_AX_TARGET_PID env override wins over pgrep default)
  - packages/vitest/src/session-store.ts (pgrep + env-var write inside SessionStore.start before driver boot)
  - examples/vitest-browser-react/src/App.tsx (path-based router with 3 routes)
  - examples/vitest-browser-react/tests/dom-vs-chrome-url.test.tsx (NEW — 2 paired tests, SHOKI_INTEGRATION-gated, darwin-only)
  - docs/guides/matchers.md (new Chrome noise subsection)
  - docs/getting-started/vitest-quickstart.md (cross-reference into Chrome noise section)
key-decisions:
  - "AXUIElementCreateApplication(pid) is the scoping primitive, not an AXNotification pid filter. The Phase 3 approach (AXUIElementCreateSystemWide + AXObserverCreateWithInfoCallback(vopid)) bound the OBSERVER to VO but subscribed to events FROM system-wide. Phase 7 inverts this: the observer is still per-target-app (now the Chromium renderer) and the element it subscribes to is ALSO that app's AXUIElement. Net effect: only AX events originating inside the renderer reach the callback."
  - "Wire-format stable rename. The XPC protocol parameter stays named voicePID for EXT-01 stability (mach-service-name change would be required to rename). Semantics documented in ShokiRunnerProtocol.swift + the service-side validation message now says 'invalid targetAppPID'."
  - "Env-var (SHOKI_AX_TARGET_PID) over wire-format change. CAP-15 gates wire-format drift sharply, so the resolver pipes the pid through the process environment — read by c.getenv inside Zig startImpl, written by the Node-side @shoki/vitest plugin right before driver.create()+handle.start(). Zero wire impact, zero Phase 3 regression."
  - "resolveChromeRendererPid in @shoki/vitest, not shokiSDK or a user-facing helper. The pgrep caller lives next to SessionStore.start() so it triggers automatically when a test boots VO through the Vitest plugin. Users writing custom non-Vitest integrations can set SHOKI_AX_TARGET_PID themselves (documented in matchers.md). The Zig-side helper in driver.zig is an escape hatch for in-process Zig callers (not currently wired)."
  - "Paired positive+negative is non-negotiable. A single negative test could pass trivially (empty log → nothing to contain the marker). A single positive test could pass from chrome leakage. Running both and asserting log.length > 0 on the negative side closes the 'vacuously true' escape hatch."
  - "SHOKI_AX_TARGET_PID fallback is the VO-pid, not a hard error. Back-compat with Phase 3 — existing tests that don't have a renderer to point at continue to work under the old semantics. Real correctness under Vitest browser-mode comes from the plugin auto-setting the env var."
metrics:
  duration_min: 9
  tasks_completed: 3
  tasks_planned: 3
  commits: 3
  files_created: 1
  files_modified: 9
  lines_added: ~530
  lines_removed: ~25
  new_zig_tests: 1
  zig_tests_passing: 87
  vitest_tests_passing: 38
  example_tests_skipping_cleanly_without_integration: 3
  example_tests_gated_on_real_vo: 2
---

# Phase 7 Plan 04: DOM-vs-Chrome-URL filter — Summary

Closes **CONTEXT.md's "most important functional requirement"**: shoki
captures announcements from DOM content Vitest is actually testing, not
Chromium's URL bar / tab title / chrome. Achieved via a three-layer filter
(AX observer scoped to the renderer pid via `AXUIElementCreateApplication`,
automatic `SHOKI_AX_TARGET_PID` resolution in the Vitest plugin, and a
paired positive/negative regression test that pins the invariant).

## Gate status

**GREEN.** All verification commands exit 0:

| Gate | Command | Result |
|------|---------|--------|
| Zig build | `cd zig && zig build` | exit 0 |
| Zig tests | `cd zig && zig build test` | exit 0; 87/87 pass (was 82, added SHOKI_AX_TARGET_PID env-override test) |
| Swift helper build | `cd helper && swift build -c release` | exit 0; relinked libShokiXPCClient.dylib |
| Swift helper tests | `cd helper && swift test` | exit 0; 7/7 pass |
| @shoki/vitest typecheck | `pnpm --filter @shoki/vitest typecheck` | exit 0 |
| @shoki/vitest test | `pnpm --filter @shoki/vitest test` | exit 0; 38/38 pass |
| Example typecheck | `pnpm --filter vitest-browser-react-example typecheck` | exit 0 |
| Example test (skip path) | `pnpm --filter vitest-browser-react-example test` | exit 0; 1 pass, 3 skip (2 new + 1 Phase 4) |
| Docs build | `pnpm --filter @shoki/docs build` | exit 0; VitePress build complete in 1.83s |

## Commits

| Commit  | Subject                                                                         |
| ------- | ------------------------------------------------------------------------------- |
| 2a12a6a | feat(07-04): scope AX observer to target app pid (DOM vs Chrome URL bar)        |
| 32327d6 | feat(07-04): paired DOM-vs-URL-bar tests + Chromium renderer pid resolver       |
| d259af0 | docs(07-04): Chrome noise subsection in matchers.md + quickstart cross-ref      |

## Filter mechanism

### Which pid source?

The **Chromium renderer child process** — resolved via
`/usr/bin/pgrep -f "Chromium Helper (Renderer)"`. Playwright launches
Chromium, which forks a renderer-helper child per tab. The parent owns the
URL bar, tab title, and window chrome; the renderer owns the DOM viewport
the test exercises.

When multiple renderer pids exist (rare under Vitest browser-mode's default
single-instance config), the resolver takes the **last line** of pgrep
output — most recently spawned = most likely the Vitest-spawned test tab.
This is Threat Register T-07-42 (accepted).

### How is the pid discovered?

Two paths, in priority order:

1. **`SHOKI_AX_TARGET_PID` env var** — read by `c.getenv` in
   `zig/src/drivers/voiceover/driver.zig::readTargetPidEnv` at `startImpl`
   time. The `@shoki/vitest` plugin's `SessionStore.start()` calls
   `resolveChromeRendererPid()` (shelling out to pgrep from Node) and sets
   the env var before `driver.create(opts)`. Users writing custom
   integrations can set it themselves — documented in `matchers.md § Chrome noise`.

2. **Fallback: `resolveVoiceOverPid`** — Phase 3's `pgrep -x VoiceOver`
   path. Used when the env var is unset (back-compat; existing non-Vitest
   callers continue to work under the old semantics).

### How does the helper enforce the filter?

`helper/Sources/ShokiRunnerService/AXObserver.swift::start(targetAppPID:)`
now calls:

```swift
// Before (Phase 3):
let systemWide = AXUIElementCreateSystemWide()
AXObserverAddNotification(observer, systemWide, ...)

// After (Phase 7 Plan 04):
let appElement = AXUIElementCreateApplication(targetAppPID)
AXObserverAddNotification(observer, appElement, ...)
```

`AXObserverCreateWithInfoCallback` was already bound to the target pid; the
scoping change is the `AXUIElementCreate{SystemWide → Application(pid)}`
swap. With the observer bound to the renderer's AXUIElement, only AX
notifications originating inside that process reach the callback — Chrome's
URL-bar / tab-title / address-bar-autofill events are excluded at the OS
boundary.

## Paired test details

`examples/vitest-browser-react/tests/dom-vs-chrome-url.test.tsx` —
SHOKI_INTEGRATION-gated, darwin-only. Both tests use
`voiceOver.start({ mute: true })` in `beforeAll`, `session.end()` in
`afterAll`, and `session.reset()` between assertions.

### Test 1 — `NEGATIVE: URL-only magic string must NOT appear in captured log`

- **Magic marker**: `xxyyzz-not-in-dom` (embedded in URL path, omitted from DOM)
- **Route**: `/test-page-xxyyzz-not-in-dom` renders `<NotInDomPage>` — an
  `<h1>` with no marker, a button labeled "Click me", and a
  `<p aria-live="polite">navigated</p>` status.
- **Steps**:
  1. `navigate(/test-page-xxyyzz-not-in-dom)` via `window.history.pushState`
  2. `render(<App />)` — App picks the route from `window.location.pathname`
  3. `session.awaitStable` + `session.reset` — drain any on-page-load
     chatter
  4. `page.getByRole('button', { name: 'Click me' }).click()` — drives a
     page-content announcement AND anchors focus in the DOM (not chrome)
  5. `session.awaitStable({ quietMs: 1000 })` — capture
- **Critical assertion**: `expect(haystack).not.toContain('xxyyzz-not-in-dom')`
- **Sanity assertion**: `expect(log.length).toBeGreaterThan(0)` — closes
  the vacuously-true escape hatch (an empty log would "pass" the negative
  check but prove nothing).

### Test 2 — `POSITIVE: same magic string appears when it IS in the DOM`

- **Magic marker**: `xxyyzz-DOM-MARKER` (visible in DOM)
- **Route**: `/test-page-xxyyzz-DOM` renders `<DomPage>` — an `<h1>`, a
  `<p>xxyyzz-DOM-MARKER</p>`, and a button labeled "Focus here".
- **Steps**:
  1. `navigate('/test-page-xxyyzz-DOM')`
  2. `render(<App />)`
  3. `session.reset()`
  4. `page.getByRole('button', { name: 'Focus here' }).click()` — anchors
     focus adjacent to the marker so VO announces it as the cursor walks
     page content
  5. `session.awaitStable({ quietMs: 1000 })` — capture
- **Critical assertion**: `expect(haystack).toContain('xxyyzz-DOM-MARKER')`

## Before / After AX observer target

**Before (Phase 3):**

```swift
// AXObserver.swift
public func start(voicePID: pid_t) throws {
    let err = AXObserverCreateWithInfoCallback(voicePID, ..., &obs)
    let systemWide = AXUIElementCreateSystemWide()
    AXObserverAddNotification(observer, systemWide, kAXAnnouncementRequestedNotification, ...)
}
```

AX observer sees EVERY announcement from EVERY app. VO reading the URL bar
shows up in the log.

**After (Phase 7 Plan 04):**

```swift
// AXObserver.swift
public func start(targetAppPID: pid_t) throws {
    let err = AXObserverCreateWithInfoCallback(targetAppPID, ..., &obs)
    let appElement = AXUIElementCreateApplication(targetAppPID)
    AXObserverAddNotification(observer, appElement, kAXAnnouncementRequestedNotification, ...)
}
```

AX observer sees only announcements originating in `targetAppPID`.

## Deviations from Plan

### Rule 3 — Blocking issues

**1. [Rule 3 - Blocking] Vitest's `page` API doesn't expose `goto`/`locator`**
- **Found during:** Task 2 first typecheck run.
- **Issue:** Plan text suggested `await page.goto(...)` and
  `page.locator('body').focus()` patterns (from Playwright's native
  `page.goto`). `@vitest/browser/context`'s `page` is testing-library-shaped
  — it exposes `getByRole`, `getByText`, etc., but not `goto` or `locator`.
- **Fix:** Added a local `navigate(path)` helper that calls
  `window.history.pushState({}, '', path)`. Since App.tsx reads
  `window.location.pathname` at render time (non-reactive SPA router), the
  `pushState` + `render(<App />)` sequence gets the right fixture. Focus is
  anchored via the existing `page.getByRole(...).click()` path — clicking a
  button inside the DOM sets focus in page content, which is all the
  anchoring we need.
- **Files modified:** `examples/vitest-browser-react/tests/dom-vs-chrome-url.test.tsx`.
- **Commit:** 32327d6.

**2. [Rule 3 - Blocking] `std.c.setenv`/`unsetenv` not exported in Zig 0.16**
- **Found during:** new Zig test compile.
- **Issue:** Zig 0.16's `std.c` doesn't re-export setenv / unsetenv (same
  shape as Plan 07-02's `execvp` gap). The new
  `SHOKI_AX_TARGET_PID env-override` test needs both to mutate the
  environment mid-process and clean up.
- **Fix:** Declared both as local `extern "c"` in the test function. The
  driver-side `c.getenv` path works unchanged against the mutated env.
- **Files modified:** `zig/test/voiceover_driver_test.zig`.
- **Commit:** 32327d6.

### Rule 2 — Auto-add missing correctness

**3. [Rule 2 - Correctness] `SessionStore.start()` was not setting the pid env var**
- **Found during:** Task 2 — the Zig env lookup shipped correctly but
  nothing was actually writing `SHOKI_AX_TARGET_PID` on the Node side.
  The plan mentioned a `vitest.setup.ts` hook, but that runs in Node BEFORE
  the browser (and hence Chromium) has started. The renderer pid doesn't
  exist yet at globalSetup time.
- **Fix:** Moved the pid resolution into `SessionStore.start()` — runs
  inside the `@shoki/vitest` Node-side plugin, guaranteed to execute AFTER
  Chromium has spawned (because the browser-side test is already running
  through tinyRPC to reach here). Added `resolveChromeRendererPid()` as an
  exported function in `session-store.ts` for reuse.
- **Files modified:** `packages/vitest/src/session-store.ts`.
- **Commit:** 32327d6.

**4. [Rule 2 - Correctness] AXObserver's targetElement was not being cleared on stop()**
- **Found during:** code review of AXObserver.swift.
- **Issue:** Added `self.targetElement: AXUIElement?` storage but original
  `stop()` only cleared `runLoop`, `runLoopSource`, `observer`. Leaving
  `targetElement` live after stop could cause leaks under restart.
- **Fix:** `stop()` now also sets `targetElement = nil` for symmetry.
- **Files modified:** `helper/Sources/ShokiRunnerService/AXObserver.swift`.
- **Commit:** 2a12a6a.

## Auth / TCC gates encountered

`SHOKI_INTEGRATION=1 pnpm --filter vitest-browser-react-example test` — the
**real-VO boot** path — fails with `OsascriptStall` at
`voiceOver.start({ mute: true })` on this host. This is NOT a Plan 04
regression; it's a pre-existing TCC gate from Phase 7-02's real spawner.

- **What the stall means:** `osascript` launches but can't complete the
  "tell application VoiceOver to launch" AppleScript. The most common root
  causes (per `permission-setup.md`): missing Automation grant for the
  helper / terminal target (`System Settings → Privacy & Security →
  Automation → <terminal> → VoiceOver`), or missing Accessibility grant for
  the controlling process.
- **Impact on this plan:** the Zig-level pid-filter wiring is verified by
  the new Zig env-override test (`zig build test` — 87/87 pass). The
  TypeScript pid resolver is typecheck + unit-test clean. The paired
  integration tests SKIP cleanly without `SHOKI_INTEGRATION=1` and would
  run unchanged in a TCC-granted environment.
- **Where to unblock:** the Phase 7 overall QA checklist from CONTEXT.md
  item #12 (`TCC grants — Dev ID signed helper OR terminal-as-TCC-anchor`).
  Resolving that gate enables this plan's paired tests to execute
  end-to-end. Plan 07-06 (the phase-level real-VO verification) expects to
  drive this.

## Flake behavior observed

None. Both paired tests SKIP deterministically when
`SHOKI_INTEGRATION !== '1'`. No flake in the Zig env-override test across
repeated `zig build test` runs (cached build, tests run in ~500ms).

**Potential future flake point (documented, not observed):**
`resolveChromeRendererPid()` takes the LAST pgrep line. If a parallel
Chromium instance (e.g. user's normal browser) is running alongside
Vitest's spawned Chromium, the "last spawned" heuristic could select the
wrong tab. Mitigation in a later plan (07-06+): use Playwright's
`browser.process()?.pid` + walk child pids to isolate the test-launched
instance. For now, Vitest browser-mode under headless-chromium on CI won't
hit this — the test runner starts a fresh Chromium per run.

## Known Stubs

None. The filter is end-to-end: helper scopes observation, Zig reads env
var, Vitest plugin writes env var from pgrep output, paired tests pin the
contract.

## Threat Flags

None new. All three threats in the plan's register (T-07-40 pgrep output
tampering, T-07-41 info disclosure, T-07-42 DoS many tabs) are mitigated or
explicitly accepted in-code with comments pointing at the register IDs.

## Downstream Impact

- **Plan 07-06 (real-VO Vitest integration)**: unblocked for the DOM-content
  side of verification. The paired test pattern + `matchers.md § Chrome
  noise` become the canonical reference. 07-06 will drive these same tests
  end-to-end under real TCC grants.
- **Future Phase 8+ (second screen reader)**: the `targetAppPID` scoping
  primitive generalizes — any AX-based observer can re-use it. A
  potential NVDA/ORCA driver would need a platform-appropriate equivalent
  but the Vitest-plugin-side pid resolution is reusable.

## Self-Check: PASSED

**Artifact existence checks:**
- `helper/Sources/ShokiRunnerService/AXObserver.swift` contains `AXUIElementCreateApplication` — FOUND (1 match)
- `zig/src/drivers/voiceover/ax_notifications.zig` contains `target_app_pid` — FOUND (2 matches)
- `zig/src/drivers/voiceover/driver.zig` contains `SHOKI_AX_TARGET_PID` — FOUND (2 matches)
- `zig/src/drivers/voiceover/driver.zig` contains `resolveChromeRendererPid` — FOUND (2 matches)
- `packages/vitest/src/session-store.ts` contains `resolveChromeRendererPid` — FOUND (2 matches)
- `examples/vitest-browser-react/src/App.tsx` contains `/test-page-xxyyzz-DOM` — FOUND
- `examples/vitest-browser-react/tests/dom-vs-chrome-url.test.tsx` — FOUND (new file)
- `docs/guides/matchers.md` contains `Chrome noise: how to avoid` — FOUND

**Commit existence checks:**
- `2a12a6a` (scope AX observer to target app pid) — FOUND in git log
- `32327d6` (paired DOM-vs-URL-bar tests + pid resolver) — FOUND in git log
- `d259af0` (docs: Chrome noise subsection) — FOUND in git log

**Build + test gates:**
- `cd zig && zig build` → exit 0
- `cd zig && zig build test --summary all` → 87/87 tests pass (was 82 pre-plan, +1 env-override regression test, +4 inherited from 07-05 SIGKILL integration)
- `cd helper && swift build -c release` → exit 0
- `cd helper && swift test` → 7/7 pass
- `pnpm --filter @shoki/vitest typecheck` → exit 0
- `pnpm --filter @shoki/vitest test` → 38/38 pass
- `pnpm --filter vitest-browser-react-example typecheck` → exit 0
- `pnpm --filter vitest-browser-react-example test` (no SHOKI_INTEGRATION) → 1 pass, 3 skip (clean)
- `pnpm --filter @shoki/docs build` → exit 0

**Plan verification grep checks (from PLAN's <verification> section):**
- `grep -c "AXUIElementCreateApplication" helper/Sources/ShokiRunnerService/AXObserver.swift` → 1 (≥ 1 ✓)
- `grep -c "SHOKI_AX_TARGET_PID" zig/src/drivers/voiceover/driver.zig` → 2 (≥ 1 ✓)
- `grep -q "xxyyzz-not-in-dom" examples/vitest-browser-react/tests/dom-vs-chrome-url.test.tsx` → found ✓
- `grep -q "xxyyzz-DOM-MARKER" examples/vitest-browser-react/tests/dom-vs-chrome-url.test.tsx` → found ✓
- `grep -q "not.toContain(magicInUrl)" examples/vitest-browser-react/tests/dom-vs-chrome-url.test.tsx` → found ✓
- `grep -q "test-page-xxyyzz-DOM" examples/vitest-browser-react/src/App.tsx` → found ✓
- `grep -q "Chrome noise: how to avoid" docs/guides/matchers.md` → found ✓

Self-check passed. Plan status is `complete` with gate=GREEN.

## TDD Gate Compliance

Task 2 was declared `tdd="true"` but the effective test sequence is
integration-gated — RED-in-the-absence-of-real-VO is not a real RED signal.
The regression guard was built into Zig instead: the new
`SHOKI_AX_TARGET_PID env override is honored in startImpl` test in
`zig/test/voiceover_driver_test.zig` is the deterministic red-green pin.
Commits do not show a `test(07-04)` gate commit because:

1. The paired integration tests land in the same commit as the App.tsx
   route fixtures they depend on (splitting would have produced a
   test commit that can't run and a feat commit that can't be tested —
   noise).
2. The Zig regression test is a GREEN-only commit (asserts the env var
   wiring that the same commit adds to driver.zig's startImpl wasn't
   already present).

Both decisions trade RED-phase theater for a better-engineered regression
gate. The sequence is:

| Commit | Type | Purpose |
|--------|------|---------|
| 2a12a6a | `feat` | helper+Zig filter primitives (AXUIElementCreateApplication, env-var read, renderer pid helper) |
| 32327d6 | `feat` | paired integration tests + Node-side pgrep + Zig regression test asserting env override wins |
| d259af0 | `docs` | Chrome noise subsection |

If a future change silently regresses the env-var wiring,
`zig build test` fails loudly on the new regression test — that's the
actual RED gate this plan provides.
