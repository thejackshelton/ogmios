---
phase: 08-zig-helper-port-shokisetup-app-gui-package-consolidation
plan: 05
subsystem: package-consolidation
tags: [refactor, workspace, publish-shape, matchers, cli, sdk]
one_liner: "7 packages -> 4: @shoki/doctor + @shoki/matchers absorbed into @shoki/sdk as /cli and /matchers subpaths; @shoki/vitest owns expect.extend at /setup"
dependency_graph:
  requires:
    - "@shoki/sdk (pre-existing surface)"
    - "@shoki/doctor (merged, then deleted)"
    - "@shoki/matchers (merged, then deleted)"
    - "@shoki/vitest (updated for subpath imports + /setup shim)"
  provides:
    - "@shoki/sdk with bin=shoki + exports ['./cli', './matchers']"
    - "@shoki/vitest/setup subpath (framework-wiring shim)"
    - "Single-package publish surface: 4 npm packages instead of 7"
  affects:
    - "pnpm workspace topology"
    - "Example repo install story"
    - "Future docs sweep (Plan 06)"
tech-stack:
  added: []
  patterns:
    - "Subpath exports map in package.json for intra-package feature slicing"
    - "Separation of framework wiring (expect.extend) from pure assertion logic (matchers fns)"
    - "`import type {}` anchor to open `declare module` augmentation under TS NodeNext + composite"
    - "Split CLI bin-entry from library-entry file so importing `@shoki/sdk/cli` does not run parseAsync"
key-files:
  created:
    - "packages/vitest/src/setup.ts (moved from @shoki/matchers; now imports from @shoki/sdk/matchers)"
  modified:
    - "packages/sdk/package.json (bin + subpath exports + merged deps + optional-peer vitest)"
    - "packages/sdk/src/cli/* (all former packages/doctor/src/* files)"
    - "packages/sdk/src/matchers/* (all former packages/matchers/src/ minus setup.ts)"
    - "packages/sdk/test/cli/** (all former packages/doctor/test/** tests + fixtures + snapshots)"
    - "packages/sdk/test/matchers/** (all former packages/matchers/test/**)"
    - "packages/sdk/src/cli/main.ts (former cli.ts; runs the CLI program)"
    - "packages/sdk/src/cli/index.ts (former doctor's index.ts; library exports)"
    - "packages/sdk/src/cli/errors.ts (docstring updated)"
    - "packages/sdk/src/matchers/types.ts (anchor import type {} from 'vitest')"
    - "packages/sdk/src/matchers/{matchers,fixtures,index}.ts ('@shoki/sdk' imports -> '../index.js')"
    - "packages/vitest/package.json (./setup subpath)"
    - "examples/vitest-browser-react/package.json (removed @shoki/matchers devDep)"
    - "examples/vitest-browser-react/src/vitest.setup.ts (@shoki/vitest/setup)"
    - "examples/vitest-browser-react/tests/*.test.tsx (removed side-effect imports)"
  deleted:
    - "packages/doctor/ (entire directory)"
    - "packages/matchers/ (entire directory)"
decisions:
  - "Split CLI bin and library entry: @shoki/sdk/cli (./dist/cli/index.js) exposes library API; bin.shoki points at ./dist/cli/main.js. Prevents accidental parseAsync on library import."
  - "vitest declared as optionalDependency peer on @shoki/sdk since matchers need `declare module 'vitest'` type augmentation to resolve for consumers."
  - "Anchor `import type {} from 'vitest'` in matchers/types.ts: TS NodeNext + composite needs at least one concrete reference before `declare module 'vitest'` is valid — otherwise TS2664 fires."
  - "Matcher fixtures (`makeEvent`, `resetClock`, `nextTs`) added to public @shoki/sdk/matchers exports — previously they were only accessible via cross-package relative imports in tests."
metrics:
  duration: "~8m"
  completed: "2026-04-17"
  tasks: 2
  files_touched: 65
---

# Phase 08 Plan 05: Package consolidation — 7 -> 4 Summary

Collapsed seven workspace packages to four: `@shoki/doctor` and `@shoki/matchers` merged into `@shoki/sdk` as subpath exports. `@shoki/vitest` absorbs `expect.extend` wiring at a new `/setup` subpath. Zero net test loss; all gates green.

## Verification Gates (CONTEXT.md mandate)

All gates executed on this Mac. Exit codes in parentheses.

| # | Gate | Result |
|---|------|--------|
| 1 | `ls packages/` | `binding-darwin-arm64 binding-darwin-x64 sdk vitest` (exact 4) |
| 2 | `ls packages/doctor` | No such file or directory (expected) |
| 3 | `ls packages/matchers` | No such file or directory (expected) |
| 4 | `grep -r '@shoki/matchers\|@shoki/doctor' packages/ examples/ --include='*.{ts,tsx,json}'` | Zero matches |
| 5 | `pnpm install` | exit 0 |
| 6 | `pnpm -r typecheck` | exit 0 (sdk, vitest, example — 3 projects) |
| 7 | `pnpm -r build` | exit 0 (docs + sdk + vitest + example) |
| 8 | `pnpm --filter @shoki/sdk test` | exit 0 — 167 passed, 13 skipped (180 total) |
| 9 | `pnpm --filter @shoki/vitest test` | exit 0 — 38 passed |
| 10 | `pnpm -r test` | exit 0 (all three projects green) |
| 11 | `node packages/sdk/dist/cli/main.js --version` | exit 0, stdout=`0.0.0` |
| 12 | `node packages/sdk/dist/cli/main.js --help` | exit 0, lists doctor/setup/info/restore-vo-settings subcommands |
| 13 | `cd packages/vitest && node -e "import('@shoki/sdk/matchers').then(m => ...)"` | exit 0, `toHaveAnnounced type: function` |
| 14 | `cd packages/vitest && node -e "import('@shoki/sdk/cli').then(m => ...)"` | exit 0, exports: `DoctorError,EXIT_CODE_PRIORITY,ExitCode,HelperNotFoundError,NonDarwinHostError,UnsupportedMacOSError,applyFixActions,printHumanReport,printJsonReport,printQuietReport,resolveExitCode,runDoctor` |
| 15 | `cd examples/vitest-browser-react && pnpm test` | exit 0 — 1 passed, 3 skipped (matches pre-move) |
| 16 | `cd examples/vitest-browser-react && pnpm typecheck` | exit 0 |

## Test Counts (pre- vs. post-move)

Captured with `pnpm --filter <pkg> test 2>&1 | tail -3` immediately before and after the migration.

| Package | Pre-move passed | Pre-move skipped | Post-move passed | Post-move skipped |
|---------|----------------:|-----------------:|-----------------:|------------------:|
| @shoki/doctor   | 97 | 1  | (merged)          | — |
| @shoki/matchers | 19 | 0  | (merged)          | — |
| @shoki/sdk      | 51 | 12 | **167**           | 13 |
| @shoki/vitest   | 38 | 0  | 38                | 0  |
| example         | 1  | 3  | 1                 | 3  |

**Sum of pre-move (doctor + matchers + sdk) = 97 + 19 + 51 = 167.** Post-move `@shoki/sdk` reports exactly 167 passing — **zero silent test loss**. Skipped counts matched except for one extra skip in sdk (run-doctor.test.ts had 1 skip in doctor's pre-move run; moved over into sdk; original 12 sdk skips remained).

## What Moved

### `packages/doctor/src/*` -> `packages/sdk/src/cli/*`

```
doctor/src/cli.ts                   -> sdk/src/cli/main.ts        (renamed: bin entry)
doctor/src/index.ts                 -> sdk/src/cli/index.ts       (renamed: library surface)
doctor/src/errors.ts                -> sdk/src/cli/errors.ts
doctor/src/fix-executor.ts          -> sdk/src/cli/fix-executor.ts
doctor/src/report-types.ts          -> sdk/src/cli/report-types.ts
doctor/src/restore-vo-settings.ts   -> sdk/src/cli/restore-vo-settings.ts
doctor/src/run-doctor.ts            -> sdk/src/cli/run-doctor.ts
doctor/src/checks/*                 -> sdk/src/cli/checks/*       (9 files)
doctor/src/reporters/*              -> sdk/src/cli/reporters/*    (3 files)
```

### `packages/doctor/test/*` -> `packages/sdk/test/cli/*`

13 test files + fixtures + `__snapshots__` + `integration/cli-smoke.test.ts`. Import paths rewritten from `../src/X.js` to `../../src/cli/X.js` (or `../../../` for nested dirs).

### `packages/matchers/src/*` -> `packages/sdk/src/matchers/*` (except `setup.ts`)

```
matchers/src/index.ts      -> sdk/src/matchers/index.ts
matchers/src/matchers.ts   -> sdk/src/matchers/matchers.ts
matchers/src/types.ts      -> sdk/src/matchers/types.ts
matchers/src/fixtures.ts   -> sdk/src/matchers/fixtures.ts
matchers/src/setup.ts      -> packages/vitest/src/setup.ts        (framework wiring)
```

### `packages/matchers/test/*` -> `packages/sdk/test/matchers/*`

4 test files. Imports rewritten from `../src/X.js` to `../../src/matchers/X.js`.

## Import Rewrites

Inside the moved matchers tree: `from '@shoki/sdk'` became `from '../index.js'` (now same-package).

Inside the moved `setup.ts`: `from './matchers.js'` became `from '@shoki/sdk/matchers'` (now a different-package consumer).

Inside `examples/vitest-browser-react`:
- `import '@shoki/matchers/setup'` -> `import '@shoki/vitest/setup'`
- `import '@shoki/matchers'` side-effect lines in `*.test.tsx` removed (setup file handles augmentation).

Inside `packages/vitest/` source: no `@shoki/matchers` references existed to rewrite (it depended on matchers only for the setup module, which moved wholesale into `@shoki/vitest/setup`).

## package.json Edits

### `packages/sdk/package.json`

- `bin: { shoki: "./dist/cli/main.js" }` added
- `exports` grew from `{ "." }` to `{ ".", "./cli", "./matchers" }`
- `dependencies` merged from doctor: `better-sqlite3`, `commander`, `execa`, `picocolors`
- `devDependencies` added: `@types/better-sqlite3`, `tsx`
- `peerDependencies: { vitest: "^3.0.0" }` + `peerDependenciesMeta: { vitest: { optional: true } }` — matchers augments `declare module 'vitest'` when consumers use it
- `keywords` extended with `doctor`, `cli`, `tcc`

### `packages/vitest/package.json`

- `exports` gained `./setup` subpath
- `description` updated to mention `@shoki/sdk/matchers` bridge

### `examples/vitest-browser-react/package.json`

- Removed `@shoki/matchers: workspace:*` from devDependencies (now reached via `@shoki/sdk/matchers`)

## Deviations from Plan

### [Rule 1 - Bug] Split CLI bin from library entry

The PLAN had both the CLI (commander `parseAsync`) and the library re-exports target the same `packages/sdk/src/cli/index.ts` — with `bin.shoki` pointing to `./dist/cli/index.js` **and** `exports['./cli']` pointing to the same file. That's a correctness bug: any consumer who does `import '@shoki/sdk/cli'` would trigger `program.parseAsync(process.argv)` at import time, causing side-effects and likely crashes in library-consumer contexts.

Fix:
- CLI bin entry renamed to `packages/sdk/src/cli/main.ts` (built to `dist/cli/main.js`)
- Library entry `packages/sdk/src/cli/index.ts` (built to `dist/cli/index.js`) re-exports public doctor API with no side effects
- `bin.shoki` -> `./dist/cli/main.js`
- `exports['./cli']` -> `./dist/cli/index.js`
- `packages/sdk/test/cli/integration/cli-smoke.test.ts` CLI path updated to `main.js`
- `main.ts` `require('../../package.json')` kept (path resolves the same since the file stays two levels deep under `dist/`)

Commit: 9b3e344

### [Rule 3 - Blocking] `vitest` module augmentation failed to resolve

After moving `matchers/src/types.ts` into `@shoki/sdk`, TypeScript emitted `TS2664: Invalid module name in augmentation, module 'vitest' cannot be found.` Even though vitest was installed (traceResolution showed successful resolution), TS would not open the `declare module 'vitest'` target because NO file in sdk's compilation graph imported vitest concretely — TS requires at least one concrete reference to open a module-augmentation target under NodeNext + `verbatimModuleSyntax: true`.

Fix: Added `import type {} from 'vitest';` anchor at the top of `packages/sdk/src/matchers/types.ts`. Zero-runtime-cost (type-only); satisfies the TS resolver.

Also added `peerDependencies: { vitest: "^3.0.0" }` + `peerDependenciesMeta.vitest.optional = true` to `@shoki/sdk/package.json` so consumers installing `@shoki/sdk/matchers` will see the warning if they haven't also installed vitest.

Commit: 9b3e344

### [Rule 2 - Missing] Export matcher fixtures from public API

The `fixtures.ts` helpers (`makeEvent`, `resetClock`, `nextTs`) were used in matchers' own tests via relative imports, but NOT exported from `packages/matchers/src/index.ts`. Now that the matchers are a subpath of `@shoki/sdk`, external consumers can't reach them via the old cross-package-relative path. Exporting them from `@shoki/sdk/matchers` preserves the test-helper affordance and is a natural extension of the public matcher surface.

Added to `packages/sdk/src/matchers/index.ts`:
```ts
export { makeEvent, nextTs, resetClock } from './fixtures.js';
```

Commit: 9b3e344

### [Rule 2 - Missing] `@shoki/vitest/setup` must re-open the type augmentation

The original `@shoki/matchers/setup` (single package) naturally carried the `declare module 'vitest'` augmentation because it imported types.ts from the same package. The new `@shoki/vitest/setup` imports runtime matchers from `@shoki/sdk/matchers` — but TypeScript module augmentation needs to be reachable through the setup file's import graph for consumers who use `import '@shoki/vitest/setup'` as a setup file.

Fix: `packages/vitest/src/setup.ts` now has:
```ts
import '@shoki/sdk/matchers'; // re-exports the augmentation
```
alongside the expect.extend call. This surfaces the `toHaveAnnounced`/etc. types on Vitest's `expect` when consumers import setup.

Commit: 9b3e344

## Deferred Issues

### Documentation sweep (Plan 06 territory)

Remaining `@shoki/matchers` / `@shoki/doctor` references in non-source files are intentionally left for Plan 06 (docs sweep):

- `docs/**/*.md` — user-facing install/quickstart + API pages
- `docs/.vitepress/config.ts` — sidebar nav
- `packages/matchers/README.md` and `packages/doctor/README.md` — already deleted with the package dirs
- `packages/vitest/README.md` — references old install commands
- `examples/vitest-browser-react/README.md` — references old matchers import
- `CHANGELOG.md` — historical entries (do NOT rewrite history)
- `.planning/**/*.md` — retrospective project docs (do NOT rewrite)
- `.github/SECURITY.md` — lists old package names

None are imports or build-affecting; all are prose. Per CONTEXT.md: "Plan 06 handles docs. Plan 05 touches only source + config + examples."

### ESM-only `require.resolve` for subpath exports

`@shoki/sdk` is ESM-only (unchanged from pre-move state). `require.resolve('@shoki/sdk/matchers')` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` because the exports map has no `require` condition. Using dynamic `import('@shoki/sdk/matchers')` works and is documented in the sdk typings via `"import"` condition only. Plan's verification spec used `require('@shoki/sdk/matchers')` — replaced in practice with `import('@shoki/sdk/matchers')` since the project has been ESM-only since Phase 1. Not a regression.

## Auth Gates

None encountered. All commands ran locally without network auth or interactive prompts.

## Commits

| Hash      | Message |
|-----------|---------|
| `9b3e344` | `refactor(08-05): consolidate @shoki/doctor + @shoki/matchers into @shoki/sdk` |

The commit preserves git-history renames for all 34 moved files (git reports `rename packages/{doctor,matchers}/... (50-100%)` for each).

## Known Stubs

None. All moved code is fully wired; the CLI `bin` runs and the matcher subpath resolves.

## Threat Register Outcomes

| Threat ID | Mitigation outcome |
|-----------|--------------------|
| T-08-20 (silent test loss) | Caught zero — pre/post counts match sum exactly |
| T-08-21 (subpath typo) | `node -e import(...)` verification confirms paths |
| T-08-22 (devDep leak to runtime) | `tsx` kept in devDependencies; better-sqlite3/commander/execa/picocolors are runtime-required by the CLI (correctly listed in `dependencies`) |
| T-08-23 (orphan `@shoki/matchers` reference) | Two grep gates (packages/ + examples/, both .ts/.tsx/.json) report zero matches |
| T-08-24 (pnpm install DoS loop) | `pnpm install` exits 0 twice (pre-build + post-build) |

## Self-Check: PASSED

Verified:
- Created files exist:
  - `packages/sdk/src/cli/main.ts` — FOUND
  - `packages/sdk/src/cli/index.ts` — FOUND
  - `packages/sdk/src/matchers/index.ts` — FOUND
  - `packages/vitest/src/setup.ts` — FOUND
  - `packages/sdk/test/cli/integration/cli-smoke.test.ts` — FOUND
  - `packages/sdk/test/matchers/to-have-announced.test.ts` — FOUND
- Deleted directories absent:
  - `packages/doctor/` — MISSING (expected)
  - `packages/matchers/` — MISSING (expected)
- Commit present:
  - `9b3e344` — FOUND in `git log --all`
- Test suite: 167 passing in `@shoki/sdk` + 38 passing in `@shoki/vitest` + 1 passing in example, matching or exceeding pre-move baselines across the board.
