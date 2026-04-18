---
phase: 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from
plan: 01
subsystem: packaging
tags: [packaging, npm, renames, monorepo, vitest, pnpm]
dependency_graph:
  requires:
    - Phase 8 complete — `@shoki/sdk` and `@shoki/vitest` both shipping with dist-ready build
  provides:
    - Unscoped `shoki` package with vitest subpath exports
    - 3-package monorepo baseline for all downstream Phase 10 plans
    - Import sweep surface (shoki / shoki/vitest*) for docs + CLI install flow
  affects:
    - Every downstream Phase 10 plan (10-02..10-05): binding tarballs, CLI download
      flow, docs, GitHub Releases workflow all reference the new `shoki` name
tech-stack:
  added: []
  patterns:
    - Subpath exports with optional peer deps (msw/node-style) for optional integrations
    - Node-entry/browser-entry isolation kept intact — `shoki/vitest/browser` still
      ships browser-safe (no Node-only modules imported from that entry)
key-files:
  created:
    - packages/sdk/src/vitest/ (moved tree — 18 source files)
    - packages/sdk/test/vitest/ (moved tree — 5 test files + 3 fixture dirs)
  modified:
    - packages/sdk/package.json (name: shoki; +vitest subpath exports; +@vitest/browser peer)
    - packages/sdk/tsconfig.json (explicit src/vitest include)
    - packages/sdk/src/matchers/index.ts (doc comments updated)
    - packages/sdk/src/voice-over.ts (doc comment updated)
    - packages/sdk/src/wire.ts (error message updated)
    - packages/sdk/src/binding-loader.ts (error message updated)
    - packages/sdk/src/cli/errors.ts (doc comments + error message updated)
    - examples/vitest-browser-qwik/package.json (shoki:workspace:*; drop @shoki/vitest)
    - examples/vitest-browser-qwik/vitest.config.ts (shoki/vitest import)
    - examples/vitest-browser-qwik/src/vitest.setup.ts (shoki/vitest/setup import)
    - examples/vitest-browser-qwik/src/shoki-matchers.d.ts (doc comments updated)
    - examples/vitest-browser-qwik/tests/app.test.tsx (shoki/vitest/browser import)
    - examples/vitest-browser-qwik/tests/dom-vs-chrome-url.test.tsx (shoki/vitest/browser import)
    - examples/vitest-browser-qwik/README.md (prose link updated)
    - .github/workflows/ci.yml (pnpm --filter shoki)
    - .github/workflows/release.yml (OIDC publisher comment)
    - pnpm-lock.yaml (regenerated for new package shape)
  deleted:
    - packages/vitest/ (entire directory — README, package.json, tsconfig, vitest.config)
decisions:
  - Plugin detection needle updated from '@shoki/vitest/browser' to 'shoki/vitest/browser';
    plugin `name` updated from '@shoki/vitest' to 'shoki/vitest' for observability
    consistency (warning prefix + tests follow suit)
  - Test fixture imports updated to 'shoki/vitest/browser' so detectVoiceOverImports
    fixture-match behaviour remains valid under the new needle
  - Internal vitest-subtree imports rewritten to RELATIVE paths (../index.js,
    ../matchers/index.js) instead of self-referencing the `shoki` package name —
    keeps the code build-order-independent inside the monorepo
metrics:
  duration: "10m"
  completed_date: "2026-04-18"
---

# Phase 10 Plan 01: Rename `@shoki/sdk` → `shoki` and collapse `@shoki/vitest` into `shoki/vitest` subpath — Summary

**One-liner:** Collapsed the 4-package monorepo to 3 packages by renaming `@shoki/sdk` to unscoped `shoki` and merging the `@shoki/vitest` plugin source into `packages/sdk/src/vitest/` behind `shoki/vitest*` subpath exports with optional Vitest peer deps.

## Files moved / deleted

Two `git mv` operations preserved history for 18 source + 8 test/fixture files:

| Old path | New path |
|---|---|
| `packages/vitest/src/` (18 files across commands/, root) | `packages/sdk/src/vitest/` |
| `packages/vitest/test/` (test files + 3 fixture dirs) | `packages/sdk/test/vitest/` |

Deleted outright (top-level of the removed package):
- `packages/vitest/README.md`
- `packages/vitest/package.json`
- `packages/vitest/tsconfig.json`
- `packages/vitest/vitest.config.ts`
- `packages/vitest/` (directory removed entirely)

## Final `packages/sdk/package.json` (relevant frontmatter)

```json
{
  "name": "shoki",
  "bin": { "shoki": "./dist/cli/main.js" },
  "exports": {
    ".":               { "types": "./dist/index.d.ts",         "import": "./dist/index.js" },
    "./matchers":      { "types": "./dist/matchers/index.d.ts","import": "./dist/matchers/index.js" },
    "./cli":           { "types": "./dist/cli/index.d.ts",     "import": "./dist/cli/index.js" },
    "./vitest":        { "types": "./dist/vitest/index.d.ts",  "import": "./dist/vitest/index.js" },
    "./vitest/browser":{ "types": "./dist/vitest/browser.d.ts","import": "./dist/vitest/browser.js" },
    "./vitest/setup":  { "types": "./dist/vitest/setup.d.ts",  "import": "./dist/vitest/setup.js" }
  },
  "optionalDependencies": {
    "@shoki/binding-darwin-arm64": "workspace:*",
    "@shoki/binding-darwin-x64":   "workspace:*"
  },
  "peerDependencies": {
    "vitest":          "^3.0.0 || ^4.0.0",
    "@vitest/browser": "^3.0.0 || ^4.0.0"
  },
  "peerDependenciesMeta": {
    "vitest":          { "optional": true },
    "@vitest/browser": { "optional": true }
  }
}
```

## Runtime verification (exit codes)

| Command | Exit | Evidence |
|---|---|---|
| `pnpm install --no-frozen-lockfile` | 0 | lockfile regenerates cleanly against new package graph |
| `pnpm -r typecheck` | 0 | `packages/sdk` + `examples/vitest-browser-qwik` both Done |
| `pnpm -r build` | 0 | `packages/sdk` tsc emits `dist/vitest/*.{js,d.ts}`; qwik example vite build ✓ |
| `pnpm -r test` | 0 | see test deltas below |
| `ls packages/` | 0 | prints `binding-darwin-arm64 binding-darwin-x64 sdk` |
| `ls packages/vitest` | 1 | "No such file or directory" — directory is gone |
| `jq -r .name packages/sdk/package.json` | 0 | prints `shoki` |
| `jq -e .exports."./vitest" and .exports."./vitest/browser" and .exports."./vitest/setup"` | 0 | all three subpaths present |
| `jq -e '.peerDependenciesMeta.vitest.optional == true and .peerDependenciesMeta."@vitest/browser".optional == true'` | 0 | both optional |
| `grep -rE '@shoki/(sdk\|vitest)' packages/ examples/ --include='*.{ts,tsx,json,yaml,d.ts}'` | 1 | zero matches in code/config |
| `import.meta.resolve('shoki/vitest/browser')` (from example) | 0 | resolves to `packages/sdk/dist/vitest/browser.js` |
| `import.meta.resolve('shoki/vitest/setup')` (from example) | 0 | resolves to `packages/sdk/dist/vitest/setup.js` |
| `import('shoki')` / `import('shoki/vitest')` / `import('shoki/matchers')` from example | 0 | all three import successfully |
| `cd examples/vitest-browser-qwik && pnpm typecheck` | 0 | Done |
| `cd examples/vitest-browser-qwik && pnpm test` | 0 | 3 passed + 3 skipped |

## Test count delta

| Before | After | Delta |
|---|---|---|
| `@shoki/sdk`: 179 passed / 13 skipped (192 total, 27 test files) | `shoki`: 217 passed / 13 skipped (230 total, 32 test files) | +38 passing, +5 test files |
| `@shoki/vitest`: 38 passed (5 test files) | (absorbed into `shoki`) | — |
| Sum: 217 passing across two packages | 217 passing in one package | **conservation check ✓** |
| Qwik example: 3 passed / 3 skipped (2 files passed + 1 skipped) | 3 passed / 3 skipped (unchanged) | 0 |

## Total file count touched

- **48 files** changed across 2 commits (Task 1: 40 files; Task 2: 8 files)
- **27 files moved** via `git mv` (history preserved, rename similarity 63–100%)
- **13 source/config files edited** inside the moved tree + callers
- **4 top-level `packages/vitest/` files deleted**
- **1 new directory** effectively introduced: `packages/sdk/src/vitest/` + `packages/sdk/test/vitest/`

## Commits

- `2cc2ae5` — refactor(10-01): rename @shoki/sdk → shoki and merge @shoki/vitest into shoki/vitest subpath (Task 1 — source + workflows)
- `08c1fa6` — refactor(10-01): sweep vitest-browser-qwik example to shoki + shoki/vitest* subpaths (Task 2 — example + lockfile)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Task 1's `pnpm install` verification blocked on Task 2's example changes**
- **Found during:** Task 1 verify step (`pnpm install --frozen-lockfile=false`)
- **Issue:** After renaming `@shoki/vitest` out of existence in packages/, the example's `@shoki/vitest: workspace:*` devDep made `pnpm install` fail with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`.
- **Fix:** Applied Task 2's example-package.json edits BEFORE the first successful install, then split the two tasks into two commits (Task 1 = source+workflows, Task 2 = example+lockfile). Each commit is still logically cohesive; combined they produce the same tree the plan expected.
- **Files modified to unblock:** `examples/vitest-browser-qwik/package.json`
- **Commit separation:** 2cc2ae5 (Task 1) → 08c1fa6 (Task 2)

**2. [Rule 2 — Correctness] Plugin detection needle and plugin `name` updated alongside package rename**
- **Found during:** Task 1 Step C
- **Issue:** `packages/sdk/src/vitest/plugin.ts` hard-codes the string `'@shoki/vitest/browser'` as the detection needle for auto-singleThread scanning of consumer test files, AND uses `name: '@shoki/vitest'` as the Vitest Plugin name. Leaving these stale would break auto-singleThread detection for any consumer using the new `shoki/vitest/browser` import.
- **Fix:** Updated needle → `'shoki/vitest/browser'`; plugin name → `'shoki/vitest'`; warning prefix → `'[shoki/vitest]'`. Updated the matching test assertion (`plugin.test.ts` now asserts `p.name === 'shoki/vitest'`), singleton-detection test descriptions, and the two fixture files that the detector scans.
- **Files modified:** `packages/sdk/src/vitest/plugin.ts`, `packages/sdk/test/vitest/plugin.test.ts`, `packages/sdk/test/vitest/singleton-detection.test.ts`, `packages/sdk/test/vitest/fixtures/has-import/test.ts`, `packages/sdk/test/vitest/fixtures/opt-out/test.ts`
- **Commit:** 2cc2ae5

**3. [Rule 2 — Correctness] Built `shoki` once before typecheck so subpath types resolve**
- **Found during:** first `pnpm -r typecheck` attempt after the rename
- **Issue:** `examples/vitest-browser-qwik/vitest.config.ts` imports `from 'shoki/vitest'`; the subpath's `types` condition points at `./dist/vitest/index.d.ts`, which only exists after a build. Fresh clone / first-run typecheck fails TS2307 until a build has run.
- **Fix:** Ran `pnpm --filter shoki build` once to emit `dist/vitest/*.d.ts`; from then on `pnpm -r typecheck` passes cleanly.
- **Not a permanent issue:** this is the standard first-run hurdle for any TS project that exposes types from `dist/`. Phase 10 docs plan will document this in the contributor README.

## Deferred Issues (out-of-scope per plan boundary)

These have **not** been fixed because the plan explicitly says "DO NOT touch `docs/`, `README.md`, or `CHANGELOG.md` in this task". Logging them for a follow-up docs plan in Phase 10:

- `packages/sdk/README.md` — H1 still reads `# @shoki/sdk` (published as part of the npm tarball; prose only — does not affect runtime)
- `packages/binding-darwin-arm64/README.md` — prose reference to `@shoki/sdk`
- `packages/binding-darwin-x64/README.md` — prose reference to `@shoki/sdk`
- `.github/SECURITY.md`, `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/feature.yml` — label text
- `docs/**/*.md`, `CHANGELOG.md`, top-level `README.md` — every install example and import snippet (this is the docs sweep Phase 10 scoped explicitly, see CONTEXT.md)

None of these affect compile/runtime/test exit codes — verified by the zero-matches grep on code/config file types.

## Self-Check: PASSED

- `packages/sdk/package.json` exists with `"name": "shoki"` — FOUND
- `packages/sdk/src/vitest/index.ts` exists — FOUND
- `packages/sdk/src/vitest/browser.ts` exists — FOUND
- `packages/sdk/src/vitest/setup.ts` exists — FOUND
- `packages/sdk/test/vitest/` directory exists — FOUND
- `packages/vitest/` directory does NOT exist — confirmed via `ls` (exit 1, "No such file or directory")
- Commit `2cc2ae5` on main — FOUND
- Commit `08c1fa6` on main — FOUND
- `pnpm -r typecheck && pnpm -r build && pnpm -r test` all exit 0 — FOUND
