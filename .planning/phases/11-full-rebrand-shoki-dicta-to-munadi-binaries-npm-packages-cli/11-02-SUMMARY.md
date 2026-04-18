---
phase: 11-full-rebrand-shoki-dicta-to-munadi-binaries-npm-packages-cli
plan: 02
subsystem: packaging
tags: [npm, pnpm-workspace, monorepo, rebrand, napi, binding]

# Dependency graph
requires:
  - phase: 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from
    provides: Two platform binding packages (@shoki/binding-darwin-arm64, @shoki/binding-darwin-x64) with shoki.node addon + README + LICENSE + package.json
provides:
  - "@munadi/binding-darwin-arm64 scoped package (metadata-only rename; compiled shoki.node artifact unchanged)"
  - "@munadi/binding-darwin-x64 scoped package (metadata-only rename; compiled shoki.node artifact unchanged)"
  - "New repo URL anchor (github.com/thejackshelton/munadi) on both binding packages"
affects: [11-01-sdk-package, 11-03-zig-core, 11-06-docs-prose-sweep]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scoped-package rename inside pnpm workspace: flip name + repository.url + prose; rely on workspace:* linkage staying functional across scope changes"

key-files:
  created:
    - .planning/phases/11-full-rebrand-shoki-dicta-to-munadi-binaries-npm-packages-cli/11-02-SUMMARY.md
  modified:
    - packages/binding-darwin-arm64/package.json
    - packages/binding-darwin-arm64/README.md
    - packages/binding-darwin-x64/package.json
    - packages/binding-darwin-x64/README.md

key-decisions:
  - "Kept `main: shoki.node` in both binding package.jsons (compiled artifact filename, not a source string; Plan 03 owns that rename if it chooses)"
  - "Renamed ShokiRunner.app -> MunadiRunner.app in README prose because the verification grep matches the capitalized 'Shoki' token; Plan 04 (helper-app) owns the actual bundle rename — README prose now matches the end-state name so we don't have to re-sweep"

patterns-established:
  - "Binding package metadata rename is independent of SDK consumer rename: binding packages have no workspace deps, so pnpm install succeeds even while @munadi/binding-* is not yet referenced by the SDK (Plan 01 still in flight in parallel)"

requirements-completed: []

# Metrics
duration: ~3 min
completed: 2026-04-18
---

# Phase 11 Plan 02: Rename Binding Packages to @munadi Scope — Summary

**Flipped `@shoki/binding-darwin-{arm64,x64}` -> `@munadi/binding-darwin-{arm64,x64}` with repo URL, description, and README prose updated; compiled `shoki.node` artifact filename preserved (Plan 03 decision).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-18T20:08:00Z
- **Completed:** 2026-04-18T20:11:00Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- Both binding packages now live under the new `@munadi` npm scope with consistent metadata
- Repo URLs updated from the placeholder `github.com/shoki/shoki.git` to `github.com/thejackshelton/munadi.git` (the actual owning account for the rebrand)
- READMEs scrubbed of every legacy token: `@shoki/*`, bare `shoki` (non-`.node`), `Shoki`, and `dicta`
- `pnpm install --no-frozen-lockfile` verified the workspace still resolves cleanly (no lockfile churn needed — SDK's optionalDeps still point to `@shoki/binding-darwin-arm64` until Plan 01 lands in parallel)

## Task Commits

1. **Task 1: Rename both binding packages to @munadi scope + update metadata + READMEs** — `fbfd275` (refactor)

## Files Created/Modified

- `packages/binding-darwin-arm64/package.json` — name to `@munadi/binding-darwin-arm64`, description to `Munadi native addon`, repo URL to `thejackshelton/munadi`
- `packages/binding-darwin-arm64/README.md` — H1 flipped, SDK package reference `dicta` -> `munadi`, `ShokiRunner.app` -> `MunadiRunner.app`, all prose rebranded
- `packages/binding-darwin-x64/package.json` — same substitutions, `x64` variant
- `packages/binding-darwin-x64/README.md` — same substitutions, `x64` variant

## Decisions Made

- **`main: shoki.node` preserved intentionally.** The compiled N-API addon filename is a build artifact owned by Plan 03 (Zig core). If Plan 03 renames the output to `munadi.node`, a follow-up sweep in Plan 03 / Plan 06 must re-update both binding package.json `main` and `files[]` fields. For this plan: tracked as intentional residual.
- **`ShokiRunner.app` preemptively renamed to `MunadiRunner.app` in README prose.** The verify grep (`Shoki` with any non-`.` follower) would fail otherwise. The actual `.app` bundle rename lives in Plan 04 (helper-app). The README now matches the post-Plan-04 world, so there is no second sweep required here.
- **No changes to LICENSE files.** The boilerplate header `Copyright (c) 2026 Shoki contributors` was left untouched; LICENSE prose is explicitly owned by Plan 06 (docs/prose sweep). Out of scope per this plan's `files_modified` frontmatter.

## Deviations from Plan

None — plan executed exactly as written. The `ShokiRunner.app` -> `MunadiRunner.app` README substitution is covered by the plan's STEP C guidance ("Any 'Shoki' proper noun -> 'Munadi'"), so no deviation.

## Issues Encountered

None.

## Intentional Residuals (pending downstream plans)

| Residual | Location | Owner | Notes |
|----------|----------|-------|-------|
| `main: shoki.node` field | both binding package.jsons | Plan 03 (Zig core) | Plan 03 decides whether to rename the compiled addon; if yes, both `main` + `files[]` must flip accordingly |
| `LICENSE` boilerplate `Shoki contributors` line | both binding `LICENSE` files | Plan 06 (docs/prose sweep) | Not a verification target for this plan |
| SDK still declares `@shoki/binding-darwin-arm64` in `optionalDependencies` | `packages/sdk/package.json` | Plan 01 (SDK package rename, running in parallel) | `pnpm install` resolution remains valid during the window where only one of {Plan 01, Plan 02} has landed |

## Next Phase Readiness

- Plan 01 (SDK rename) can resolve `@munadi/binding-darwin-arm64` via workspace link as soon as it lands — the scoped name is in place
- Plan 03 (Zig core rename) has the option to also rename the compiled `shoki.node` artifact without blocking; if it does, a one-line follow-up in this plan's files re-flips `main`/`files[]`
- No blockers for downstream plans

## Self-Check: PASSED

- `packages/binding-darwin-arm64/package.json` FOUND — name is `@munadi/binding-darwin-arm64`
- `packages/binding-darwin-arm64/README.md` FOUND — zero legacy tokens
- `packages/binding-darwin-x64/package.json` FOUND — name is `@munadi/binding-darwin-x64`
- `packages/binding-darwin-x64/README.md` FOUND — zero legacy tokens
- Commit `fbfd275` FOUND in `git log`
- `pnpm install --no-frozen-lockfile` verified clean

---
*Phase: 11-full-rebrand-shoki-dicta-to-munadi-binaries-npm-packages-cli*
*Completed: 2026-04-18*
