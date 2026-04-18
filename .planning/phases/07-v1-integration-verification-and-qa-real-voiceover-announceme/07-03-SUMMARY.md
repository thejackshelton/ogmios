---
phase: 07-v1-integration-verification-and-qa-real-voiceover-announceme
plan: 03
status: complete
gate_status: GREEN
completed_date: 2026-04-17
tags:
  - api-reshape
  - singleton
  - tdd
  - docs
requires:
  - 07-01 (toolchain)
  - 07-02 (real spawner unblocks the SDK test path)
provides:
  - packages/sdk/src/screen-reader.ts ScreenReaderHandle.end() alias
  - packages/sdk/src/voice-over.ts VoiceOverFn (callable factory + namespace)
  - Top-level voiceOver.start()/voiceOver.end() process-singleton with refcount
  - packages/vitest/src/browser.ts ShokiBrowserSession.end() alias
affects:
  - packages/sdk/src/driver-handle.ts (stop + end share one doStop impl)
  - packages/sdk/test/voice-over.test.ts (+195 LoC: 6 new API reshape tests)
  - packages/vitest/test/commands.test.ts (mock handle: add end: stop)
  - packages/vitest/test/session-store.test.ts (mock handle: add end: stop)
  - packages/vitest/test/structured-clone-safety.test.ts (mock handle: add end: stop)
  - docs/api/sdk.md (voiceOver namespace + top-level convenience section)
  - docs/getting-started/vitest-quickstart.md (beforeAll/afterAll/beforeEach pattern)
key-decisions:
  - "voiceOver stays callable as a factory AND becomes a namespace. Used Object.assign(voiceOverFactory, { start, end }) with an explicit VoiceOverFn interface (call signature + start + end). TypeScript's function-object merging supports this cleanly; it closes CONTEXT D-03 by matching the user's 'voiceOver.start()/voiceOver.end()' intuition without breaking the existing factory-form users."
  - "handle.end() and handle.stop() point at a shared doStop closure inside createDriverHandle, not this-delegation. Shared closure means mock-call counts are symmetric across the two method names (vi.fn().mock.calls.length agrees) and there is no footgun for `const { stop } = handle; stop()` style destructuring."
  - "singleton start() that fails clears singletonHandle before rethrowing. This keeps the refcount floor at 0 and lets a subsequent start() retry from scratch instead of leaving a poisoned half-initialized handle pinned in the module state."
  - "voiceOver.end() without a prior start() is a noop (does not throw, does not console.warn). A console.warn during teardown is noisy in skipped-test scenarios (SHOKI_INTEGRATION=0 on darwin) and provides no actionable signal — test frameworks already surface unmatched setup/teardown calls at the suite level."
  - "Reset cheapness was already implemented correctly before this plan (driver-handle.reset() calls only binding.driverReset + store.clear; zig/src/drivers/voiceover/driver.zig:resetImpl only touches the existing shell). We added two regression tests (no-respawn + <100ms wall time) to prevent future churn from silently making reset expensive."
metrics:
  duration_min: 6
  tasks_completed: 2
  tasks_planned: 2
  commits: 3
  files_created: 0
  files_modified: 9
  lines_added: ~285
  lines_removed: ~35
  new_sdk_tests: 6
  sdk_tests_passing: 51
  sdk_tests_skipped: 11
  vitest_tests_passing: 38
  matchers_tests_passing: 19
---

# Phase 7 Plan 03: API reshape (end() alias + voiceOver.start/end + cheap reset) — Summary

Closed CONTEXT D-03: v1 SDK surface now matches the user-stated intuition
`voiceOver.start({ mute: true })` in `beforeAll` + `voiceOver.end()` in
`afterAll` + cheap `handle.reset()` between tests. Pure TS changes — zero
native code touched. Typecheck + test clean across `@shoki/sdk`,
`@shoki/vitest`, `@shoki/matchers`, and the canonical `vitest-browser-react`
example.

## Gate status

**GREEN.** All verification commands exit 0:

| Gate | Command | Result |
|------|---------|--------|
| SDK typecheck | `pnpm --filter @shoki/sdk typecheck` | exit 0 |
| SDK tests | `pnpm --filter @shoki/sdk test` | 51 passed, 11 skipped (integration gates) |
| Vitest typecheck | `pnpm --filter @shoki/vitest typecheck` | exit 0 |
| Vitest tests | `pnpm --filter @shoki/vitest test` | 38 passed |
| Canonical example typecheck | `pnpm --filter vitest-browser-react-example typecheck` | exit 0 |
| Matchers regression | `pnpm --filter @shoki/matchers test` | 19 passed |
| Biome | `pnpm exec biome check <files>` | clean after auto-fix |

Verification patterns from the plan:

- `grep -n 'end():' packages/sdk/src/screen-reader.ts` → exactly 1 match
- `grep -q 'voiceOver.start' packages/sdk/src/voice-over.ts` → found
- `grep -q 'voiceOver.end' packages/sdk/src/voice-over.ts` → found (`endSingleton` + `Object.assign(..., { start, end })`)
- `grep -l 'voiceOver.end' docs/` → `docs/api/sdk.md` + (implicit in `session?.end()` on vitest-quickstart.md)
- "API reshape (Phase 7)" describe-block present in `packages/sdk/test/voice-over.test.ts` and green.

## Commits

| Commit  | Subject                                                                         |
| ------- | ------------------------------------------------------------------------------- |
| 42465b4 | test(07-03): add failing tests for end() alias + voiceOver.start/end + cheap reset (RED) |
| 2db3904 | feat(07-03): add handle.end() alias + top-level voiceOver.start/end singleton (GREEN)    |
| 341382f | feat(07-03): surface end() on @shoki/vitest browser session + docs for new API           |

## What closed

### A. ScreenReaderHandle.end() alias

`packages/sdk/src/screen-reader.ts` — added one method to the interface:

```ts
export interface ScreenReaderHandle {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  /**
   * Alias for stop(). Preferred in v1+ for symmetry with start(); both names
   * call the same underlying implementation and remain available indefinitely
   * for back-compat.
   */
  end(): Promise<void>;
  // ... unchanged
}
```

`packages/sdk/src/driver-handle.ts` — extracted the stop body to a `doStop`
closure, then pointed both `stop` and `end` at it:

```ts
async function doStop(): Promise<void> {
  stopDrainInterval();
  binding.driverStop(assertAlive());
}

return {
  // ...
  stop: doStop,
  end: doStop,
  // ...
};
```

Mock-count symmetry: a `vi.fn` mock of `driverStop` increments by 1 on either
`handle.end()` OR `handle.stop()` — identical wire behavior.

### B. Top-level `voiceOver.start()` / `voiceOver.end()` singleton

`packages/sdk/src/voice-over.ts` — introduced `VoiceOverFn` interface:

```ts
export interface VoiceOverFn {
  (opts?: VoiceOverOptions): ScreenReaderHandle;        // existing factory form
  start(opts?: VoiceOverOptions): Promise<ScreenReaderHandle>;  // new
  end(): Promise<void>;                                  // new
}

export const voiceOver: VoiceOverFn = Object.assign(voiceOverFactory, {
  start: startSingleton,
  end: endSingleton,
});
```

Singleton state is module-scoped:

```ts
let singletonHandle: ScreenReaderHandle | null = null;
let singletonRefcount = 0;
```

`startSingleton(opts)` — first call creates + starts the handle; subsequent
calls return the same reference and bump `singletonRefcount`. Failed start
drops the handle (prevents poisoned module state).

`endSingleton()` — decrements; on refcount === 0, calls `handle.end()` then
`handle.deinit()`. No-op when the singleton is already null.

### C. Cheap reset regression tests

Reset was already cheap pre-plan (confirmed via `driver-handle.reset()` +
`zig/src/drivers/voiceover/driver.zig:resetImpl`). Added two new tests that
pin the invariant:

1. **"handle.reset() does not re-create the native driver"** — 3 calls to
   `handle.reset()` produce exactly 1 `binding.createDriver` call + 3
   `binding.driverReset` calls (no respawn via the native side).
2. **"handle.reset() completes in <100ms on the mock path"** — wall-time
   assertion; protects against a future regression that tries to piggyback
   VO-restart logic into reset.

### D. @shoki/vitest browser-side surface

`packages/vitest/src/browser.ts` — `ShokiBrowserSession` gains `end()` as an
alias for `stop()`. Both point at the same `rpc.shokiStop` call — the
tinyRPC command surface is unchanged, so `SessionStore`'s refcount +
stop-order semantics (Phase 4 VITEST-05) are preserved:

```ts
const stop = () => rpc.shokiStop({ sessionId });
return {
  sessionId,
  stop,
  end: stop,   // NEW: symmetric alias
  // ...
};
```

### E. Test mock hygiene (Rule 2 auto-add)

Three vitest mocks now declare `end: stop` on their `ScreenReaderHandle`
literal. The mocks were typecheck-passing even without `end` because those
tests don't import types across project boundaries — but adding `end: stop`
keeps the mock accurate to the interface and unlocks future tests that
assert on `end()` calls without surface friction.

Files touched:
- `packages/vitest/test/commands.test.ts`
- `packages/vitest/test/session-store.test.ts`
- `packages/vitest/test/structured-clone-safety.test.ts`

### F. Docs updates

**`docs/api/sdk.md`**:

- New "Top-level convenience: start() / end()" subsection under `voiceOver()`
  with the canonical `beforeAll` / `afterAll` / `beforeEach` pattern.
- `ScreenReaderHandle` TypeScript reference now shows `end(): Promise<void>`
  immediately below `stop()`, with a comment marking it as the v1+ alias.
- New `### end()` section documenting it as the preferred name and stop() as
  the back-compat alias.
- `### reset()` gains a "Cheap." note: explicitly "Does NOT respawn osascript
  or restart VoiceOver — only clears the native event ring buffer and sends
  a single AppleScript command to move the VO cursor to the first item of
  window 1 down the existing shell process."

**`docs/getting-started/vitest-quickstart.md`**:

Rewrote the canonical test to the new pattern:

```tsx
beforeAll(async () => {
  session = await voiceOver.start({ mute: true });
}, 30_000);

afterAll(async () => {
  await session?.end();
});

beforeEach(async () => {
  await session.reset();  // Cheap: ring clear + VO cursor reset, no respawn
});

test("announces Submit on click", async () => {
  render(<SubmitButton />);
  await page.getByRole("button", { name: "Submit" }).click();
  const log = await session.awaitStable({ quietMs: 500 });
  expect(log).toHaveAnnounced({ role: "button", name: "Submit" });
});
```

The old per-test `voiceOver.start()` + `afterEach(() => session.stop())`
shape is still valid code — just no longer the preferred example for the
one-session-per-file case.

## Before / After ScreenReaderHandle interface

**Before:**

```ts
export interface ScreenReaderHandle {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  drain(): Promise<ShokiEvent[]>;
  reset(): Promise<void>;
  listen(): AsyncIterable<ShokiEvent>;
  phraseLog(): Promise<string[]>;
  lastPhrase(): Promise<string | undefined>;
  clear(): Promise<void>;
  droppedCount(): Promise<bigint>;
  awaitStableLog(opts: AwaitStableLogOptions): Promise<ShokiEvent[]>;
  deinit(): Promise<void>;
}
```

**After:**

```ts
export interface ScreenReaderHandle {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Alias for stop(). Preferred in v1+. */
  end(): Promise<void>;
  drain(): Promise<ShokiEvent[]>;
  reset(): Promise<void>;
  listen(): AsyncIterable<ShokiEvent>;
  phraseLog(): Promise<string[]>;
  lastPhrase(): Promise<string | undefined>;
  clear(): Promise<void>;
  droppedCount(): Promise<bigint>;
  awaitStableLog(opts: AwaitStableLogOptions): Promise<ShokiEvent[]>;
  deinit(): Promise<void>;
}
```

(Pure additive change. No breaking changes to any existing caller.)

## Deviations from Plan

### Rule 2 — Auto-add missing correctness

**1. [Rule 2 - Correctness] Mocks for ScreenReaderHandle missing the end property after interface change**
- **Found during:** post-GREEN verification sweep of `@shoki/vitest` tests.
- **Issue:** Three test files under `packages/vitest/test/` construct
  `ScreenReaderHandle` literals as mocks. After adding `end()` to the
  interface, those literals technically violate the type (missing required
  member), although vitest's test-time bundler tolerated it because the
  literal-assignment-narrowing path didn't flag it and no test called
  `.end()` on the mock. Tests would silently fail to verify end() behavior
  in the future.
- **Fix:** Each mock now declares `const stop = vi.fn(...)` and passes
  `{ stop, end: stop, ...}` so `end()` is wired to the same vi.fn instance.
  No call-site changes required.
- **Files modified:** `packages/vitest/test/commands.test.ts`,
  `packages/vitest/test/session-store.test.ts`,
  `packages/vitest/test/structured-clone-safety.test.ts`.
- **Commit:** 341382f.

### Non-deviation note — Task 1 RED expectation

Plan text said "all 6 new tests MUST fail" at RED. Only 4 failed because the
two reset-cheapness tests were already true of the current implementation
(Phase 3's reset was correctly cheap per CAP-12). This is the intended
behavior — those two tests are regression guards, not drivers of new
implementation. Noted up-front; RED+GREEN commits reflect the actual
sequence.

## Known Stubs

None from this plan.

## Threat Flags

None. The singleton adds refcount state but the threat model already covered
refcount underflow (T-07-20) and cross-file sharing is the intended semantic
(T-07-21 accepted under VITEST-03 singleThread enforcement).

## Downstream Impact

- **Plan 07-04 (TCC + real-VO boot):** Canonical VO boot path in the
  integration test can now use `voiceOver.start()` / `voiceOver.end()` —
  less ceremony for the real-run path when TCC grant is in place.
- **Plan 07-06 (real-VO Vitest):** The `docs/getting-started/vitest-quickstart.md`
  pattern is now the one the integration example should mirror.

## Self-Check: PASSED

**Artifact existence checks:**

- `packages/sdk/src/screen-reader.ts` contains `end(): Promise<void>` — FOUND (1 match)
- `packages/sdk/src/voice-over.ts` contains `voiceOver.start` + `voiceOver.end` — FOUND (via Object.assign)
- `packages/sdk/test/voice-over.test.ts` contains `API reshape (Phase 7)` describe — FOUND
- `packages/vitest/src/browser.ts` contains `end:` alias on ShokiBrowserSession — FOUND
- `docs/api/sdk.md` contains `voiceOver.start` + `voiceOver.end` — FOUND (6 mentions)
- `docs/getting-started/vitest-quickstart.md` contains `end()` — FOUND (2 mentions)

**Commit existence checks:**

- `42465b4` (RED tests) — FOUND in git log
- `2db3904` (GREEN implementation) — FOUND in git log
- `341382f` (vitest surface + docs + mock hygiene) — FOUND in git log

**Test gates:**

- `pnpm --filter @shoki/sdk typecheck` → exit 0
- `pnpm --filter @shoki/sdk test` → 51 passed, 11 skipped, 0 failed (includes 6 new API reshape tests)
- `pnpm --filter @shoki/vitest typecheck` → exit 0
- `pnpm --filter @shoki/vitest test` → 38 passed, 0 failed
- `pnpm --filter vitest-browser-react-example typecheck` → exit 0 (canonical example unchanged call site `session.stop()` still compiles)
- `pnpm --filter @shoki/matchers test` → 19 passed

**Biome:**

- `pnpm exec biome check <all 8 touched TS files>` → exit 0 after auto-fix

Self-check passed. Plan status is `complete` with gate=GREEN.

## TDD Gate Compliance

Plan frontmatter does not declare `type: tdd`, but Task 1 is `tdd="true"`
per the plan. Gate sequence:

1. RED: `42465b4` — `test(07-03)` commit adds 6 failing tests (4 actual failures + 2 regression guards that pre-pass — documented as expected above)
2. GREEN: `2db3904` — `feat(07-03)` commit makes the 4 failing tests pass; the 2 regression guards remain green
3. REFACTOR: none needed — implementation was clean on first GREEN pass

Task 2 is `type="auto"` (not TDD). Docs + vitest surface changes land in
commit `341382f` alongside the mock-hygiene Rule 2 auto-fix.
