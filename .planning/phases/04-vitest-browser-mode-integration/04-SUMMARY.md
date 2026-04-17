---
phase: 04
phase_name: vitest-browser-mode-integration
status: complete
plans: 4
requirements_closed: ["VITEST-01", "VITEST-02", "VITEST-03", "VITEST-04", "VITEST-05", "VITEST-06", "VITEST-07", "VITEST-08"]
completed_at: "2026-04-17T17:15Z"
---

# Phase 4: Vitest Browser-Mode Integration — COMPLETE

All 4 plans executed in sequence (Waves 1→2→3). All 8 VITEST-XX requirements closed. All 5 Phase 4 ROADMAP success criteria met.

## Plans

| Plan | Title | Requirements | Commit |
|---|---|---|---|
| 04-01 | @shoki/matchers — 4 semantic matchers | VITEST-08 | `5ac0ea5` |
| 04-02 | @shoki/vitest plugin + browser proxy | VITEST-01, 02, 03, 04, 06 | `11cff77` |
| 04-03 | SessionStore + real command handlers | VITEST-05 | `3ac6ff8` |
| 04-04 | examples/vitest-browser-react | VITEST-07 | `95b3634` |

## Requirements Closure Map

- **VITEST-01** (plugin registers BrowserCommands) — Plan 04-02, verified by `singleton-detection.test.ts "registers all 10"`.
- **VITEST-02** (`@shoki/vitest/browser` typed entry) — Plan 04-02, verified by `browser.ts` existing + test importing `voiceOver` in Plan 04-04.
- **VITEST-03** (auto-singleThread on VO import detection) — Plan 04-02, verified by `singleton-detection.test.ts` (6 cases).
- **VITEST-04** (`ShokiConcurrentTestError` on test.concurrent) — Plan 04-02 (class defined + browser.ts detector), runtime-verified in Plan 04-04 integration test.
- **VITEST-05** (refcounted session coordination) — Plan 04-03, verified by `session-store.test.ts` (11 tests).
- **VITEST-06** (structured-clone-safe payloads) — Plan 04-02 + 04-03, verified by `structured-clone-safety.test.ts` + `commands.test.ts` (every command's live-path return passes round-trip).
- **VITEST-07** (canonical example repo) — Plan 04-04, `examples/vitest-browser-react/` exists, installs, typechecks, builds, and runs 1 pass + 1 gated skip.
- **VITEST-08** (4 matchers with diff-friendly messages) — Plan 04-01, verified by 19 tests across 4 files.

## ROADMAP Success Criteria Map

1. **SC-1** (user installs 3 packages + test passes) — ✅ Plan 04-04 example uses all 3 packages; render test passes offline.
2. **SC-2** (plugin auto-singles) — ✅ Plan 04-02 `detectVoiceOverImports`.
3. **SC-3** (refcount from multiple start() callers) — ✅ Plan 04-03 `SessionStore.start/stop` refcount.
4. **SC-4** (every payload clone-safe) — ✅ Plan 04-02 + 04-03 `WireShokiEvent` + Number conversions + null for lastPhrase.
5. **SC-5** (canonical example with real React) — ✅ Plan 04-04.

## Test Suite Totals

| Package | Tests | Status |
|---|---|---|
| `@shoki/matchers` | 19 | green |
| `@shoki/vitest` | 38 | green |
| `vitest-browser-react-example` | 2 (1 pass + 1 gated skip) | green |

## Cross-Cutting Fixes Auto-Applied During Plan 04-04

1. `packages/matchers/src/types.ts`: augment `Matchers<T=any>` alongside `Assertion<T=any>` so matcher methods are visible at the consumer test site. Rule 1 bug — augmentation was partial.
2. `packages/vitest/src/errors.ts`: define `ShokiError` locally (browser-safe) instead of importing from `@shoki/sdk`. The browser entry must not pull in Node-only `node:module.createRequire`. Rule 3 blocking issue — discovered when running the example test.

Both are surgical, committed with Plan 04-04 for atomicity.

## Deviations

See individual plan SUMMARYs. High-level: none of the plans needed a Rule 4 (architectural) escalation. Three Rule 1/2/3 auto-fixes, all within scope and tested.

## Forward Targets

- **Phase 5** picks up Phase 4's example and wires it into `.github/workflows/` on 4 runner types (self-hosted tart, Cirrus, GetMac, macos-latest). `SHOKI_INTEGRATION=1 pnpm --filter vitest-browser-react-example test` is the v1 correctness probe.
- **Phase 6** docs site points at Plan 04-04's README as the quickstart.

## Self-Check: PASSED

- 4 plan SUMMARYs + 1 phase SUMMARY exist.
- All 4 commits verified (`5ac0ea5`, `11cff77`, `3ac6ff8`, `95b3634`).
- Test suites green across all three targets.

**Phase 4: COMPLETE**
