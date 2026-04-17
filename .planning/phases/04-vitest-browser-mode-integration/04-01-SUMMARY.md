---
phase: 04
plan: 01
subsystem: matchers
tags: [vitest, matchers, expect, augmentation]
requires: ["@shoki/sdk ShokiEvent type (Phase 1)"]
provides:
  - "@shoki/matchers npm package"
  - "toHaveAnnounced, toHaveAnnouncedText, toHaveNoAnnouncement, toHaveStableLog"
  - "Vitest Matchers<T> + AsymmetricMatchersContaining module augmentation"
affects: ["packages/matchers/*"]
tech_stack:
  added: ["@shoki/matchers (new package)"]
  patterns: ["Vitest expect.extend", "TS module augmentation", "zero-runtime-deps via peerDependencies"]
key_files:
  created:
    - packages/matchers/package.json
    - packages/matchers/tsconfig.json
    - packages/matchers/vitest.config.ts
    - packages/matchers/src/index.ts
    - packages/matchers/src/types.ts
    - packages/matchers/src/matchers.ts
    - packages/matchers/src/setup.ts
    - packages/matchers/src/fixtures.ts
    - packages/matchers/README.md
    - packages/matchers/test/to-have-announced.test.ts
    - packages/matchers/test/to-have-announced-text.test.ts
    - packages/matchers/test/to-have-no-announcement.test.ts
    - packages/matchers/test/to-have-stable-log.test.ts
  modified: []
decisions:
  - "Augment Vitest's `Matchers<T=any>` alongside `Assertion<T=any>` so the augmentation propagates through the `vitest` re-export to consumer sites (needed after discovering during Plan 04-04 that augmenting only `Assertion` didn't flow through to `expect(log).toHaveAnnounced(...)`)."
  - "Matchers accept any MatchableEvent shape (role/name/source/phrase/flags subset) so they work with both ShokiEvent[] (Node) and WireShokiEvent[] (browser RPC)."
  - "Zero runtime deps per D-23 — vitest + @shoki/sdk live under peerDependencies; smaller npm tarball + no version-pin conflict with consumer."
metrics:
  duration: ~10m
  completed_at: "2026-04-17T17:15Z"
---

# Phase 04 Plan 01: @shoki/matchers Summary

Vitest `expect` matchers for Shoki `ShokiEvent[]` / `WireShokiEvent[]` screen-reader logs — four semantic matchers that form the assertion surface for every downstream test (VITEST-08 closed).

## Files Added

See `key_files.created` in frontmatter (14 files under `packages/matchers/`).

## Matcher Semantics

| Matcher | Arg | Rule |
|---|---|---|
| `toHaveAnnounced` | `{ role?, name?, source?, interrupt? }` | Iterate; event matches iff every present shape field is satisfied. `role`/`name` accept string (strict eq) or RegExp (`.test`). `interrupt` derives from `(flags & 1) === 1`. `source` is strict eq. Missing shape fields = unconstrained. |
| `toHaveAnnouncedText` | `string \| RegExp` | Any event whose `phrase` includes the string (case-sensitive) OR matches the RegExp. |
| `toHaveNoAnnouncement` | — | Passes iff `log.length === 0`. |
| `toHaveStableLog` | `{ quietMs }` | Async. Captures initial length, awaits `quietMs`, asserts same length. Reference stability check on the array itself — NOT a driver-side poll. |

Pure-data assertions — no side effects, no state. Matchers are re-runnable.

## Diff-Friendly Messages

Failure messages include:
- The serialized shape (literal or RegExp.toString())
- The first 10 entries of the actual log with `role`, `name`, `phrase`, `source`, computed `interrupt`
- `...and N more` suffix when truncated

`.not` inversion is supported because matcher return values always include both pass/fail message branches.

## Guardrails

- `isShokiEventArray` returns `pass: false` with a typed "Expected received to be a ShokiEvent[]" message instead of throwing on non-array input — satisfies T-04-01-01 (Tampering).
- Log serialization truncates at 10 entries — satisfies T-04-01-02 (DoS on huge logs).

## Test Coverage

19 tests across 4 files:
- `to-have-announced.test.ts` — 9 tests (literal match, RegExp, source filter, interrupt, diff message, guards, .not, empty log, truncation)
- `to-have-announced-text.test.ts` — 4 tests (substring, regex case-insensitive, phrase listing, guard)
- `to-have-no-announcement.test.ts` — 3 tests (empty pass, non-empty fail, guard)
- `to-have-stable-log.test.ts` — 3 tests (stable pass, unstable fail, guard)

All green: `pnpm --filter @shoki/matchers test`.

## Deviations from Plan

- **[Rule 3 - Type augmentation]** Initial plan augmented only Vitest's `Assertion<T>`. Plan 04-04 discovered that `expect(log).toHaveAnnounced(...)` at the consumer test site still saw `Assertion<WireShokiEvent[]>` without the methods. Fix: also augment `Matchers<T=any>` (per `@vitest/expect` source, `Assertion<T>` extends `Matchers<T>`, so augmenting `Matchers` propagates through the re-export). Single declare block, both interfaces.
- **[Rule 2 - Generality]** Matchers now accept `MatchableEvent` (subset of ShokiEvent) rather than strictly typed `ShokiEvent[]`. Necessary for downstream usage against `WireShokiEvent[]` (browser RPC payload) which has `tsMs: number` instead of `tsNanos: bigint` — but role/name/phrase/flags are identical across both shapes, which is all the matchers actually touch.
- Task 1's matchers.ts was implemented fully (not just stubbed) — combined with Task 2 to avoid a stub→real-impl swap.

## Self-Check: PASSED

- All 14 declared files exist.
- Commit `5ac0ea5` — `feat(04-01): @shoki/matchers package with 4 semantic matchers (VITEST-08)`.
