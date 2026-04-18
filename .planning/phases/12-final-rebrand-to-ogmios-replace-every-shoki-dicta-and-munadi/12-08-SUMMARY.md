---
phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi
plan: 08
subsystem: examples
tags: [rebrand, ogmios, vitest-browser-qwik, example, workspace-dep]
requires:
  - SDK package published at workspace name `ogmios` (phase 12 plan 01)
  - SDK subpath exports `ogmios/vitest`, `ogmios/vitest/browser`, `ogmios/vitest/setup`, `ogmios/matchers`
provides:
  - Canonical Vitest-browser-mode + Qwik example rebranded end-to-end to Ogmios
  - Ambient matcher types file renamed history-preserved (shoki-matchers.d.ts -> ogmios-matchers.d.ts)
  - Reference `ogmiosVitest()` plugin wiring + `OgmiosBrowserSession` type-import pattern for downstream docs
affects:
  - Phase 12 Wave 2 (examples sweep) progress; unblocks docs/README references to example
tech-stack:
  added: []
  patterns:
    - "Workspace dep `ogmios: workspace:*` (monorepo consumer pattern)"
    - "Ambient `.d.ts` augmentation file imported via `/// <reference>` then `import 'ogmios/vitest/setup'`"
    - "Env-var gate `OGMIOS_INTEGRATION=1` + `import.meta.env.OGMIOS_PLATFORM` for darwin-only CSR test branch"
key-files:
  created: []
  modified:
    - examples/vitest-browser-qwik/package.json
    - examples/vitest-browser-qwik/README.md
    - examples/vitest-browser-qwik/src/app.tsx
    - examples/vitest-browser-qwik/src/env.d.ts
    - examples/vitest-browser-qwik/src/ogmios-matchers.d.ts
    - examples/vitest-browser-qwik/src/root.tsx
    - examples/vitest-browser-qwik/src/vitest.setup.ts
    - examples/vitest-browser-qwik/tests/app-ssr.test.tsx
    - examples/vitest-browser-qwik/tests/app.test.tsx
    - examples/vitest-browser-qwik/tests/dom-vs-chrome-url.test.tsx
    - examples/vitest-browser-qwik/vitest.config.ts
decisions:
  - "File rename (`shoki-matchers.d.ts` -> `ogmios-matchers.d.ts`) was already baked into HEAD by prior wave commits landed between plan-start and plan-run. Worktree rebase pulled in `b318809`/`c5022bb`/`18c53fd` which together had flipped the filename. No additional `git mv` commit needed; we finished the content sweep the rename was waiting on."
  - "Env vars renamed to OGMIOS_INTEGRATION / OGMIOS_PLATFORM everywhere (test files, vite define, env.d.ts ImportMetaEnv). Consumer-visible break — documented in README Run-the-tests section so downstream docs can link."
  - "Ambient interface names Shoki* -> Ogmios* and T-marker properties `_shokiMatchersT`/`_shokiAssertionT` -> `_ogmiosMatchersT`/`_ogmiosAssertionT`. These are internal Vitest matcher-extension plumbing; the rename is cosmetic but the grep guard requires zero Shoki tokens."
metrics:
  duration_minutes: 3
  completed_date: 2026-04-18
  tasks_total: 1
  tasks_complete: 1
  files_modified: 11
  files_created: 0
  commits: 1
---

# Phase 12 Plan 08: vitest-browser-qwik Example Rebrand Summary

End-to-end Munadi/Shoki -> Ogmios rebrand of the canonical `examples/vitest-browser-qwik/` project: workspace dep, ambient `.d.ts` matcher types, vitest plugin factory, env-var gates, prose. `pnpm typecheck` exits 0; zero Shoki/Munadi/Dicta tokens remain in the example.

## What Changed

### Package dependency + description
- `examples/vitest-browser-qwik/package.json` `.description`: `Canonical Shoki example: ...` -> `Canonical Ogmios example: ...`.
- `.dependencies.ogmios` already at `"workspace:*"` from phase 12-01; no dep-field change needed.

### Ambient matcher types
- `src/ogmios-matchers.d.ts` (filename already flipped upstream): `Shoki*Matchers` / `Shoki*AnnouncementShape` / `ShokiToHaveStableLogOptions` interfaces -> `Ogmios*` equivalents. T-marker properties `_shokiMatchersT` / `_shokiAssertionT` -> `_ogmiosMatchersT` / `_ogmiosAssertionT`. Header-comment `shoki/matchers` / `shoki` package name -> `ogmios/matchers` / `ogmios`.
- `src/vitest.setup.ts` `/// <reference>` path flipped to `./ogmios-matchers.d.ts`; side-effect import from `'dicta/vitest/setup'` -> `'ogmios/vitest/setup'`.

### Config + SDK surface
- `vitest.config.ts`: `import { shokiVitest } from 'dicta/vitest'` -> `import { ogmiosVitest } from 'ogmios/vitest'`; `shokiVitest()` factory call -> `ogmiosVitest()`; comments (including the `// shoki's peer range` blurb) -> `ogmios`. Env-var plumbing renamed `SHOKI_INTEGRATION` / `SHOKI_PLATFORM` -> `OGMIOS_*` in host const, `define` keys, and pass-through values.
- `src/env.d.ts` `ImportMetaEnv`: `SHOKI_INTEGRATION`/`SHOKI_PLATFORM` -> `OGMIOS_INTEGRATION`/`OGMIOS_PLATFORM`.

### Tests
- `tests/app.test.tsx` and `tests/dom-vs-chrome-url.test.tsx`: `import { type ShokiBrowserSession, voiceOver } from 'dicta/vitest/browser'` -> `import { type OgmiosBrowserSession, voiceOver } from 'ogmios/vitest/browser'`; `import.meta.env.SHOKI_INTEGRATION`/`SHOKI_PLATFORM` -> `OGMIOS_*`; describe-block labels `(SHOKI_INTEGRATION=1 on darwin)` -> `(OGMIOS_INTEGRATION=1 on darwin)`; prose comments (`// shoki captures` / `CONTEXT.md "most important functional requirement": shoki`) -> `ogmios`.
- `tests/app-ssr.test.tsx`: prose `Unique Shoki + Qwik capability` -> `Unique Ogmios + Qwik capability`; `getByRole('heading', { name: /Shoki Vitest Browser Example/ })` -> `/Ogmios Vitest Browser Example/` (matches the updated `<h1>` text in the app).

### Components + root shell
- `src/app.tsx`: three `<h1>` texts (default page, not-in-DOM fixture, DOM fixture) rebranded `Shoki ...` -> `Ogmios ...`; comment `If shoki captures the marker` -> `If ogmios captures the marker`.
- `src/root.tsx`: `<title>Shoki · Vitest Browser Qwik Example</title>` -> `<title>Ogmios · Vitest Browser Qwik Example</title>`.

### README
- H1 lede, Qwik/Shoki capability paragraph, `vitest.config.ts wires ... shokiVitest()` description, `src/vitest.setup.ts imports dicta/vitest/setup to register the four Dicta matchers` all rebranded.
- `npx dicta doctor` (two occurrences) -> `npx ogmios doctor`.
- `SHOKI_INTEGRATION=1` run command + gate paragraphs -> `OGMIOS_INTEGRATION=1`.
- Footer monorepo link `[Shoki](https://github.com/shoki/shoki)` -> `[Ogmios](https://github.com/thejackshelton/ogmios)`.

## Verification Results

```
test -f examples/vitest-browser-qwik/src/ogmios-matchers.d.ts   # OK
test ! -f examples/vitest-browser-qwik/src/shoki-matchers.d.ts  # OK
jq -r '.dependencies.ogmios' examples/vitest-browser-qwik/package.json   # workspace:*
jq -r '.dependencies.munadi // "null"' examples/vitest-browser-qwik/package.json  # null
jq -r '.description' examples/vitest-browser-qwik/package.json   # "Canonical Ogmios example: ..."
rg -n "(shoki|Shoki|SHOKI_|munadi|Munadi|MUNADI_|dicta|Dicta|DICTA_)" examples/vitest-browser-qwik/
   # (no matches)
pnpm install --no-frozen-lockfile                               # OK (workspace resolves)
cd examples/vitest-browser-qwik && pnpm typecheck               # exits 0
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SDK `dist/` missing blocked typecheck**
- **Found during:** Task 1 verification step (`pnpm typecheck`)
- **Issue:** The example's subpath imports resolve via `packages/sdk/package.json` `exports` map, which points at `./dist/**.d.ts` files. In this worktree the SDK `dist/` tree had not been built yet, so `tsc --noEmit` failed with TS2307 / TS2882 for every `ogmios/vitest*` and `ogmios/matchers` specifier.
- **Fix:** Ran `pnpm --filter ogmios build` (equivalently `cd packages/sdk && pnpm build`) once to materialize `packages/sdk/dist/`. Typecheck then exited 0.
- **Files modified:** None (build artifact only, not tracked).
- **Commit:** N/A (no source change).

### Environment Observations (non-deviations)

- `pnpm install` emitted a `WARN Unsupported platform` for `packages/binding-darwin-x64` (current host is arm64). Not this plan's concern — arm64-only shipping is locked in phase 12 already; warning is cosmetic.
- `pnpm install` logged two `WARN Failed to create bin at .../.bin/ogmios` entries because `packages/sdk/dist/cli/main.js` didn't exist at install time. Resolved by the SDK build above; subsequent installs will succeed.
- Between plan start and commit, HEAD advanced with three upstream commits from wave-2 sibling worktrees (`b318809`, `c5022bb`, `18c53fd`, all phase 12-06 CLI legacy-state-dir plan). The `ogmios-matchers.d.ts` rename was already applied by those commits; my `git mv` was effectively a no-op at the tree level but not destructive. No conflict; proceeded normally.

## Deferred Issues

None.

## Commit

| Hash      | Scope          | Message |
| --------- | -------------- | ------- |
| `dfba7f0` | refactor(12-08) | rebrand vitest-browser-qwik example to Ogmios (flip workspace dep, sweep imports) |

## Success Criteria Checklist

- [x] `shoki-matchers.d.ts` renamed to `ogmios-matchers.d.ts` (history preserved via upstream wave-2 rename + this plan's content sweep)
- [x] `package.json` dep is `"ogmios": "workspace:*"`; description rebranded to "Canonical Ogmios example"
- [x] Zero `shoki` / `Shoki` / `SHOKI_` / `munadi` / `Munadi` / `MUNADI_` / `dicta` / `Dicta` / `DICTA_` tokens in `examples/vitest-browser-qwik/`
- [x] `pnpm typecheck` exits 0 (SDK `dist/` prebuilt per Rule 3 auto-fix)
- [x] `pnpm install` at repo root resolves the workspace cleanly
- [x] One atomic task commit (`dfba7f0`)

## Self-Check: PASSED

- examples/vitest-browser-qwik/src/ogmios-matchers.d.ts: FOUND
- examples/vitest-browser-qwik/src/shoki-matchers.d.ts: ABSENT (as required)
- examples/vitest-browser-qwik/package.json dep `ogmios`: "workspace:*" FOUND
- examples/vitest-browser-qwik/package.json dep `munadi`: ABSENT (as required)
- Commit `dfba7f0`: FOUND in `git log` on main
- Residual token grep: zero matches (verified post-commit)
- `pnpm typecheck` in example: exit 0 (verified post-commit)
