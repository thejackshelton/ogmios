---
quick_id: 260418-f0a
type: execute
completed_at: 2026-04-18
duration_minutes: 10
commits:
  - adc5731  # Task 1: code rename
  - a229e8a  # Task 2: docs sweep
tags:
  - rename
  - npm
  - publishing
  - docs
files_touched:
  code: 20
  docs: 20
  total: 40
---

# Quick Task 260418-f0a: Rename npm package `shoki` -> `@shoki/core`

**One-liner:** Mechanical rename of the published npm package identifier from unscoped `shoki` to scoped `@shoki/core` to sidestep npm's E403 anti-typosquatting block (vs. `shiki`); CLI bin name `shoki`, project name "Shoki", and repo URL unchanged.

## Result

- `packages/sdk/package.json` `"name"` is `"@shoki/core"` (was `"shoki"`)
- Dry-run publish from `packages/sdk/` emits `name: @shoki/core` with no E403 (see below)
- `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` all exit 0
- Every TS import of the SDK uses `@shoki/core` / `@shoki/core/matchers` / `@shoki/core/cli` / `@shoki/core/vitest` / `@shoki/core/vitest/browser` / `@shoki/core/vitest/setup`
- Every user-facing doc tells users to run `npm install @shoki/core`
- The `shoki` CLI bin (`bin.shoki = ./dist/cli/main.js`) is unchanged — muscle memory (`shoki doctor`, `shoki setup`, `npx shoki setup`) preserved
- Plugin auto-detection needle updated to `@shoki/core/vitest/browser` so consumer imports still trigger `singleThread=true`

## Files touched

**Code (20 files, commit `adc5731`):**
- `packages/sdk/package.json` — `"name": "shoki"` -> `"name": "@shoki/core"`
- `packages/sdk/src/vitest/plugin.ts` — `IMPORT_NEEDLE = '@shoki/core/vitest/browser'`; plugin `name: '@shoki/core/vitest'`; warning prefix `[@shoki/core/vitest]`
- `packages/sdk/src/vitest/setup.ts` — doc comment import-string fix
- `packages/sdk/src/vitest/errors.ts` — error message references to the package token
- `packages/sdk/src/vitest/command-types.ts` — doc comment
- `packages/sdk/src/matchers/index.ts` — doc comment
- `packages/sdk/src/binding-loader.ts` — ABI-drift error message
- `packages/sdk/src/wire.ts` — wire-version mismatch error message
- `packages/sdk/src/voice-over.ts` — SessionStore refcount comment
- `packages/sdk/src/cli/errors.ts` — HelperNotFoundError message + header comment
- `packages/sdk/test/vitest/plugin.test.ts` — plugin-name assertion
- `packages/sdk/test/vitest/singleton-detection.test.ts` — needle + warning-prefix assertions
- `packages/sdk/test/vitest/fixtures/has-import/test.ts` + `opt-out/test.ts` — fixture imports use the new needle
- `examples/vitest-browser-qwik/package.json` — dep `"@shoki/core": "workspace:*"` (was `"shoki"`)
- `examples/vitest-browser-qwik/vitest.config.ts` + `src/vitest.setup.ts` — import paths
- `examples/vitest-browser-qwik/tests/app.test.tsx` + `tests/dom-vs-chrome-url.test.tsx` — import paths
- `pnpm-lock.yaml` — regenerated against the scoped name

**Docs (20 files, commit `a229e8a`):**
- `README.md` — install commands, badge URL, import examples, architecture diagram label, "3 npm packages" list
- `CHANGELOG.md` — v0.1.0 entry gains a lead-in note about the `@shoki/core` final name + E403 reason; install / import / migration snippets rewritten; historical entries describing prior renames (Phase 10 Plan 01 unscoped `shoki`, Phase 8 Plan 05 subpath consolidation) preserved as-is
- `CLAUDE.md` — "napm package name" -> "npm package name" with value `@shoki/core`; quickstart example `import { voiceOver } from "@shoki/core"`
- `docs/index.md` — hero quick-install
- `docs/getting-started/install.md` — install commands + import example + subpath table + "heads-up" migration box + "Why one package?" paragraph
- `docs/getting-started/vitest-quickstart.md` — install commands, config imports, setup file, needle reference
- `docs/api/sdk.md` — H1 + entry-points table + import examples + "see also" links
- `docs/api/cli.md` — bin description (the `shoki` bin stays; `@shoki/core` is the surrounding package)
- `docs/api/vitest.md` — H1 + all subpath references
- `docs/api/matchers.md` — setup-files path + matcher-package path + "see also" + "live-reference" callout
- `docs/guides/matchers.md` — setup snippet + code examples + "pure fns" paragraph + paired-test callout
- `docs/guides/migration-from-guidepup.md` — Shoki code example import
- `docs/guides/troubleshooting.md` — `ShokiConcurrentTestError` cause description
- `docs/background/architecture.md` — SDK-layer name + matcher subpath
- `docs/background/release-setup.md` — Section 2 bullet list; Section 3 `npm view`/`npm install` smoke checks; Section 5 unpublish commands
- `.planning/RELEASE-v0.1.0-RUNBOOK.md` — top-of-file callout explaining the scoped-name rationale; publish order; verify commands; smoke test
- `packages/sdk/README.md` — H1 + install/import snippets
- `packages/binding-darwin-arm64/README.md` + `packages/binding-darwin-x64/README.md` — "automatically installed by `@shoki/core`"
- `examples/vitest-browser-qwik/README.md` — setup-file import path

## Verification

### Automated checks (from plan)

```
$ jq -r '.name' packages/sdk/package.json
@shoki/core
$ jq -r '.bin.shoki' packages/sdk/package.json
./dist/cli/main.js
```

- `grep -rnE "from ['\"]shoki(/[^'\"]+)?['\"]" packages/ examples/ --include='*.ts' --include='*.tsx' --include='*.d.ts'` returns **ZERO matches**
- `grep -rnE "(npm|pnpm|yarn)\s+(install|add|view)\s+shoki([^-/@a-z]|$)"` across tracked user-facing docs returns **ZERO matches** (the only matches are in gitignored `docs/.vitepress/dist/` compiled HTML, which will be regenerated by the next VitePress build)

### Build / typecheck / test

```
$ pnpm install --no-frozen-lockfile
Done in 668ms

$ pnpm --filter @shoki/core build
Done

$ pnpm -r typecheck
packages/sdk typecheck: Done
examples/vitest-browser-qwik typecheck: Done

$ pnpm -r test
packages/sdk test:  Test Files  35 passed | 6 skipped (41)
packages/sdk test:       Tests  242 passed | 13 skipped (255)
examples/vitest-browser-qwik test:  Test Files  2 passed | 1 skipped (3)
examples/vitest-browser-qwik test:       Tests  3 passed | 3 skipped (6)

$ pnpm -r build
All green.
```

### Dry-run publish

```
$ cd packages/sdk && npm publish --dry-run --access public
npm notice name: @shoki/core
npm notice version: 0.1.0
npm notice filename: shoki-core-0.1.0.tgz
npm notice package size: 82.1 kB
npm notice total files: 177
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)
+ @shoki/core@0.1.0
```

No E403 anti-typosquatting block — the scoped `@shoki` org is exempt from npm's similarity check.

## Intentional residuals

These `shoki` tokens were deliberately left in place (per plan constraints):

- **CLI bin name** (`bin.shoki`, `shoki doctor`, `shoki setup`, `npx shoki setup`, `shoki info`, `shoki restore-vo-settings`) — independent of the npm package identifier; users keep their muscle memory
- **Project name prose** ("Shoki", "# Shoki", "Shoki lets you...", "Shoki.app", "Shoki Setup.app") — proper noun, not the npm token
- **Repo URL** (`github.com/shoki/shoki`) — separate concern; tracked in the RELEASE runbook for a later placeholder-URL pass
- **Namespaces inside the codebase** — `com.shoki.runner` bundle ID, `_shoki_snapshot_*` plist keys, `~/.shoki/` state dir, `SHOKI_*` env vars, `shoki-darwin-<arch>.zip` release artifact names — these are internal Shoki identifiers, independent of the npm package name
- **Historical CHANGELOG entries describing past renames** — Phase 10 Plan 01 (`@shoki/sdk` -> `shoki`), Phase 8 Plan 05 (package consolidation), etc. — accurate record of what happened at those points in time and must stay as-is
- **`compatibleAppVersion`** field in `packages/sdk/package.json` — app-version contract, orthogonal to the package name

## Unexpected discoveries

None. The rename went exactly as the plan described. Phase 10.1's subpath layout (`/matchers`, `/cli`, `/vitest`, `/vitest/setup`, `/vitest/browser`) was preserved intact — only the root name gained the `@shoki` scope.

## Constraints honored

- [x] CLAUDE.md directive: all work went through the GSD workflow (spawned from `/gsd-quick execute`)
- [x] `.planning/phases/**` untouched — `git diff .planning/phases/` is empty
- [x] `.planning/research/**` untouched
- [x] Bin name `shoki` unchanged — `jq -r '.bin.shoki'` still returns `./dist/cli/main.js`
- [x] Project name "Shoki" prose preserved in README, docs, CHANGELOG headings
- [x] `repository.url` `git+https://github.com/shoki/shoki.git` untouched (separate concern per plan)
- [x] `compatibleAppVersion` field preserved
- [x] `@shoki/binding-darwin-*` names unchanged (already scoped correctly)

## Self-Check: PASSED

**Files created/touched exist:**
- packages/sdk/package.json — FOUND (name=@shoki/core)
- examples/vitest-browser-qwik/package.json — FOUND (dep=@shoki/core workspace:*)
- packages/sdk/src/vitest/plugin.ts — FOUND (needle=@shoki/core/vitest/browser)
- README.md / CHANGELOG.md / docs/** / CLAUDE.md / RELEASE-v0.1.0-RUNBOOK.md — FOUND

**Commits exist:**
- adc5731 — FOUND (`refactor(260418-f0a): rename npm package shoki -> @shoki/core in code`)
- a229e8a — FOUND (`docs(260418-f0a): sweep user-facing docs for shoki -> @shoki/core`)
