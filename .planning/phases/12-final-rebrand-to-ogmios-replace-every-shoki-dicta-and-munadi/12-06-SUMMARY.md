---
phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi
plan: 06
subsystem: cli
tags: [cli, legacy-migration, state-dir, ogmios, rebrand, commander, stderr-contract]

# Dependency graph
requires:
  - phase: 12-01
    provides: CLI surface already flipped from Munadi → Ogmios tokens across packages/sdk/src/cli/**
  - phase: 12-03
    provides: OgmiosRunner.app / OgmiosSetup.app bundle names exist so CLI path/bundle-ID refs have targets
provides:
  - "warnOnLegacyStateDir() helper detecting ~/.shoki, ~/.dicta, ~/.munadi on disk"
  - "Legacy-state notice wired into `ogmios doctor` and `ogmios setup` (stderr, suppressed under --json)"
  - "7 unit tests covering single-dir / all-three / none / current-ogmios-only / encounter-order"
affects:
  - 12-07 (CI workflows reading CLI JSON output — notice is stderr, doesn't contaminate stdout)
  - 12-09 (docs plan — can reference this notice when explaining post-rebrand upgrade path)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injectable-seams for CLI filesystem/IO helpers (homedir/exists/stderr overrides)"
    - "stderr-only notices so --json/--quiet stdout contracts stay machine-readable"

key-files:
  created:
    - packages/sdk/src/cli/legacy-state.ts
    - packages/sdk/test/cli/legacy-state.test.ts
  modified:
    - packages/sdk/src/cli/main.ts

key-decisions:
  - "Suppress legacy notice under --json — stdout contract is machine-readable, notice goes to stderr regardless"
  - "Helper is pure + injectable (homedir/exists/stderr) so tests never touch the host filesystem"
  - "Single multi-line write, not one write per dir — matches the rm -rf command shape users copy-paste"
  - "Current ~/.ogmios state dir is explicitly NOT flagged (test enforces this)"

patterns-established:
  - "Legacy-detection helpers live as standalone modules (legacy-state.ts), not inlined into main.ts"
  - "CLI commands call detection helpers BEFORE their primary async work so the notice is not buried under later output"

requirements-completed: []

# Metrics
duration: 22min
completed: 2026-04-18
---

# Phase 12 Plan 06: CLI Legacy State-Dir Notice + Shoki/Dicta Residual Sweep Summary

**Injectable `warnOnLegacyStateDir` helper wired into `ogmios doctor`/`setup` that detects `~/.shoki/`, `~/.dicta/`, `~/.munadi/` on stderr — plan's planned shoki/Shoki/dicta/Dicta residual sweep turned up empty because Plan 12-01 had already cleared packages/sdk/src/cli/**.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-04-18T21:54:00Z
- **Completed:** 2026-04-18T22:16:49Z
- **Tasks:** 2
- **Files modified:** 3 (1 created helper, 1 created test file, 1 edited main.ts)

## Accomplishments
- Created pure `warnOnLegacyStateDir(options)` helper with injectable `homedir` / `exists` / `stderr` seams so it is trivially unit-testable without touching the host filesystem.
- Wired legacy notice into `ogmios doctor` and `ogmios setup` commander actions ahead of the primary work, suppressed under `--json` to keep that stdout contract pristine.
- Seven unit tests cover: single `.shoki`-only, single `.dicta`-only, single `.munadi`-only, all-three-present, none-present, current `.ogmios`-only (must stay silent), and the encounter-order contract the `rm -rf ~/.shoki ~/.dicta ~/.munadi` command depends on.
- Verified Plan 12-01 had already cleared every `shoki|Shoki|SHOKI_|dicta|Dicta|DICTA_|org.shoki.` token from `packages/sdk/src/cli/**` and `packages/sdk/test/cli/**` — the only surviving occurrences are inside the legacy-detection helper itself (the `.shoki` / `.dicta` / `.munadi` dir-name literals) and in its documentation comments, both intentional per CONTEXT.md D-05.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add legacy state-dir notice + verify zero Shoki/Dicta residuals in CLI source** — `b318809` (refactor)
2. **Task 2: Add CLI tests for the legacy state-dir notice** — `c5022bb` (test)

## Files Created/Modified
- `packages/sdk/src/cli/legacy-state.ts` — (new) `warnOnLegacyStateDir()` helper with injectable homedir/exists/stderr seams. Detects `~/.shoki`, `~/.dicta`, `~/.munadi`; emits a single multi-line stderr notice including the exact `rm -rf` command a user can copy-paste.
- `packages/sdk/src/cli/main.ts` — wired `warnOnLegacyStateDir()` into the `doctor` and `setup` command actions (guarded by `!opts.json` to keep stdout JSON clean).
- `packages/sdk/test/cli/legacy-state.test.ts` — (new) 7 unit tests covering the detection matrix; uses the helper's injectable seams so no host FS touches.

## Decisions Made
- **Don't call the helper under `--json`.** The `doctor --json` and `setup --json` stdout contracts are machine-readable. The notice is still allowed on stderr (stderr is conventionally free-form), but suppressing under `--json` matches the existing reporter pattern where JSON mode replaces human output entirely.
- **One stderr write, not N writes.** Users paste the `rm -rf` command verbatim, so all detected dirs must appear in a single combined command. The helper accumulates `found[]` first and writes once.
- **Current `~/.ogmios` state dir is explicitly excluded.** A dedicated test enforces this — if only `~/.ogmios` exists, the helper is silent. Future regressions that accidentally flag the current state dir would fail that test.
- **Helper lives in its own module, not inlined into main.ts.** main.ts is a commander wiring file; the helper has enough logic (list iteration, path join, message shape) that inlining it would block unit testing without mocking the entire main entrypoint.

## Deviations from Plan

### Observation 1 — Plan 12-01 already swept the Shoki/Dicta residuals

The plan's central pre-scan step anticipated non-zero residuals in packages/sdk/src/cli/** per Phase 11's explicit "hard-guarded" deferral. At execution time, `rg` returned zero hits for all Shoki/Dicta/SHOKI_/DICTA_/org.shoki./\.shoki/ patterns across both `packages/sdk/src/cli/` and `packages/sdk/test/cli/`. Test fixtures (`tcc-rows.ts`, `codesign-output.ts`) were already in their final Ogmios shape with `org.ogmios.runner` client values and `/path/to/OgmiosRunner.app/...` paths.

**Fix:** None required — the sweep portion of Task 1 collapsed to "verify zero residuals, which passed." The legacy-notice portion remained the real deliverable.

**Impact:** Commit message adjusted to reflect the actual scope (legacy notice addition), and this summary documents the observation so future phases don't expect to find residuals here.

### Observation 2 — Pre-existing CLI integration test failures are NOT caused by this plan

`test/cli/integration/cli-smoke.test.ts` has 5 failing tests: all fail because `packages/sdk/dist/cli/main.js` does not exist (SDK was never built in this worktree). Verified by stashing my changes and re-running the suite — same 5 failures appear. This is a pre-existing environmental gap (the cli-smoke suite requires `pnpm build` first), not something introduced by Plan 12-06.

**Fix:** None applied. Per scope guards, out-of-scope pre-existing failures are not fixed in this plan. The deferred item is tracked here for Phase 12 Plan 07 (release pipeline) or the next full CI run, whichever builds dist first.

**Impact:** Legacy-state unit tests all pass (7/7). Full suite exits non-zero due to the pre-existing issue only.

---

**Total deviations:** 0 rule-based auto-fixes (both observations are "scope smaller than anticipated" / "pre-existing unrelated failure", not deviation-rule triggers).
**Impact on plan:** Deliverable remains the legacy-state notice + tests. Scope guards (don't touch build artifacts, don't chase pre-existing failures) honored.

## Issues Encountered
- Invoking `pnpm --filter ogmios test -- --run <path>` did not pass the path-filter through to vitest; it ran the whole suite. Worked around by `cd packages/sdk && npx vitest run <path>` for the targeted run. Full suite also ran via `npx vitest run` for the baseline check.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- `ogmios doctor` and `ogmios setup` now surface legacy state dirs on first use. No user action required to "upgrade" from a prior Shoki/Dicta/Munadi install — just running the CLI once prints the `rm -rf` hint.
- Plan 12-07 (GitHub Actions) can reference `packages/sdk/src/cli/` as fully Ogmios-clean when scanning for residuals.
- Plan 12-09 (docs sweep) can quote the exact notice text from `packages/sdk/src/cli/legacy-state.ts` when documenting the upgrade path from prior names.

## Self-Check: PASSED

- `packages/sdk/src/cli/legacy-state.ts` — FOUND
- `packages/sdk/test/cli/legacy-state.test.ts` — FOUND
- `packages/sdk/src/cli/main.ts` import of `warnOnLegacyStateDir` — FOUND
- Commit `b318809` (Task 1 — refactor) — FOUND in git log
- Commit `c5022bb` (Task 2 — test) — FOUND in git log
- Grep `(shoki|Shoki|dicta|Dicta|SHOKI_|DICTA_|org\.shoki\.|\.shoki/)` against `packages/sdk/src/cli/` — only hits are the legacy-notice literal dir names and their explanatory comments (intentional per CONTEXT.md D-05)
- Grep same pattern against `packages/sdk/test/cli/` — zero hits outside the new legacy-state test file (where `~/.shoki`, `~/.dicta`, `~/.munadi` appear as expected fixture strings for the detection matrix; allowed per plan's scope_guards)
- `pnpm --filter ogmios typecheck` — exit 0
- `npx vitest run test/cli/legacy-state.test.ts` — 7/7 passed

---
*Phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi*
*Completed: 2026-04-18*
