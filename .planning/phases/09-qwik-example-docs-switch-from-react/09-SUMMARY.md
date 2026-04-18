---
phase: 09
plan: "all"
subsystem: examples-and-docs
tags: [qwik, vitest, ssr, a11y, example, docs, ci]
dependency-graph:
  requires:
    - Phase 8 package consolidation (@shoki/sdk/matchers, @shoki/vitest/setup subpath imports)
    - vitest-browser-qwik@0.3+ (external OSS library maintained by @thejackshelton)
    - @qwik.dev/core v2 (Qwik v2 beta line)
  provides:
    - canonical example demonstrating SSR a11y testing pre-hydration
    - framework-agnostic confirmation of the renderer-pid filter (paired DOM-vs-URL test)
    - Vitest 4 coexistence proof (main monorepo stays on Vitest 3)
  affects:
    - examples/ tree (now single-example)
    - all docs code snippets (vitest-quickstart, matchers, migration, troubleshooting)
    - all 4 CI topology reference workflows
    - phase-5-parity gate (now runs against the Qwik example)
tech-stack:
  added:
    - vitest-browser-qwik@0.3.6 (Qwik render / renderSSR helpers for Vitest browser mode)
    - "@qwik.dev/core@2.0.0-beta.32"
    - vitest@4.1.4 (example only; rest of monorepo stays on 3.2.4)
    - "@vitest/browser@4.1.4, @vitest/browser-playwright@4.1.4, @vitest/expect@4.1.4 (example only)"
  patterns:
    - local shoki-matchers.d.ts ambient-as-module type shim pattern for cross-major-version Vitest matcher augmentation
    - testSSR() + qwikVite() + shokiVitest() Vite plugin stacking order
    - renderSSR() -> container.innerHTML assertions on pre-hydration a11y attributes
key-files:
  created:
    - examples/vitest-browser-qwik/package.json
    - examples/vitest-browser-qwik/vite.config.ts
    - examples/vitest-browser-qwik/vitest.config.ts
    - examples/vitest-browser-qwik/tsconfig.json
    - examples/vitest-browser-qwik/src/app.tsx
    - examples/vitest-browser-qwik/src/root.tsx
    - examples/vitest-browser-qwik/src/env.d.ts
    - examples/vitest-browser-qwik/src/vitest.setup.ts
    - examples/vitest-browser-qwik/src/shoki-matchers.d.ts
    - examples/vitest-browser-qwik/tests/app.test.tsx
    - examples/vitest-browser-qwik/tests/app-ssr.test.tsx
    - examples/vitest-browser-qwik/tests/dom-vs-chrome-url.test.tsx
    - examples/vitest-browser-qwik/README.md
    - examples/vitest-browser-qwik/.gitignore
  modified:
    - packages/vitest/package.json (peer range ^3 || ^4)
    - packages/vitest/README.md
    - docs/getting-started/vitest-quickstart.md
    - docs/guides/matchers.md
    - docs/guides/migration-from-guidepup.md
    - docs/guides/troubleshooting.md
    - .github/workflows/phase-5-parity.yml
    - .github/workflows/examples/shoki-cirrus-runners.yml
    - .github/workflows/examples/shoki-getmac.yml
    - .github/workflows/examples/shoki-github-hosted.yml
    - .github/workflows/examples/shoki-tart-selfhosted.yml
    - .github/actions/setup/action.yml
    - CHANGELOG.md
  deleted:
    - examples/vitest-browser-react/** (entire directory, 15 files)
decisions:
  - Hard replace per CONTEXT.md Option A: git history preserves the React example.
  - Qwik example runs Vitest 4 because vitest-browser-qwik@0.3+ peer-depends on ^4; rest of monorepo stays on Vitest 3. Peer range of @shoki/vitest widened to ^3 || ^4.
  - Local ambient-as-module matcher-type shim in the Qwik example instead of rebuilding @shoki/sdk against Vitest 4, keeping the SDK's Vitest-3 tests unaffected.
  - SSR tests are ungated (no SHOKI_INTEGRATION) — HTML is deterministic, no screen reader needed, so SSR tests stay green on every OS.
metrics:
  duration: "~19 minutes wall clock (single-session execution)"
  completed: "2026-04-18"
  commits:
    - 601745a feat(09-01) create Qwik example
    - c6f19b6 chore(09-02) delete React example
    - d7be01f docs(09-03) switch docs + CI references
---

# Phase 9: Qwik example + docs switch from React — Summary

## One-liner

Replaced the React Vitest-browser-mode example with a Qwik one that adds
**pre-hydration SSR a11y testing** — a capability no other framework
integration in Shoki's Vitest story offers — and switched all docs + CI
references to match.

## What shipped

**examples/vitest-browser-qwik/** — full canonical example:

- **`src/app.tsx`** — Qwik components mirroring the React fixtures:
  `DefaultPage` / `SubmitButton` (Submit button + aria-live), `NotInDomPage`
  (negative DOM-vs-URL fixture), `DomPage` (positive), and `App` (routing).
- **`src/root.tsx`** — minimal Qwik root required by Vite build.
- **`tests/app.test.tsx`** — CSR test: render Submit button, click it,
  `voiceOver.start/reset/end`, assert `toHaveAnnounced({ role, name })`
  + `toHaveAnnouncedText(/Form submitted/i)`.
- **`tests/app-ssr.test.tsx`** — **unique Qwik value**: `renderSSR()` into
  a pre-hydration DOM and assert on `role="status"` + `aria-live="polite"`
  + accessible-name queries. No VoiceOver gate — HTML is deterministic.
- **`tests/dom-vs-chrome-url.test.tsx`** — ported verbatim from the React
  example to prove the renderer-pid filter is framework-agnostic.
- **`vitest.config.ts`** — `testSSR()` + `qwikVite()` + `shokiVitest()` plugin
  stack, Vitest 4 + `@vitest/browser-playwright` provider factory.
- **`README.md`** — CSR vs SSR table, run instructions, troubleshooting.

## Runtime verification (exit codes)

| Command | Exit | Notes |
| --- | --- | --- |
| `pnpm install` | 0 | peer warning: @qwik.dev/core wants vitest >=2 <4, example uses 4 (soft peer) |
| `pnpm -r typecheck` | 0 | packages/sdk, packages/vitest, examples/vitest-browser-qwik all green |
| `pnpm -r build` | 0 | sdk + vitest tsc, Qwik example vite build (14 modules, 101kB main) |
| `pnpm -r test` | 0 | 179+38+3 = 220 passed, 13+3 = 16 skipped |
| `pnpm --filter vitest-browser-qwik-example test` | 0 | 3 passed / 3 skipped (VO-gated) |
| `cd docs && pnpm build` | 0 | VitePress 1.6.4, 1.85s |
| `ls examples/` | returns only `vitest-browser-qwik` | React example gone |
| grep for `vitest-browser-react` in `.github/ docs/ README.md CONTRIBUTING.md` (excl .planning) | 0 matches | Historical refs in CHANGELOG + .planning are intentional |

## Test counts before/after

| | Before (React) | After (Qwik) |
| --- | --- | --- |
| Example test files | 2 | 3 (+ app-ssr.test.tsx) |
| Example test cases | ~4 (2 VO-gated + 2 render) | 6 (2 SSR + 4 VO-gated) |
| SSR a11y coverage | 0 | 2 tests (pre-hydration role/aria-live + heading) |
| Always-green tests (non-integration) | 1 (render smoke) | 3 (2 SSR + 1 render smoke) |
| VO-gated tests | 3 | 3 (1 CSR announce + 2 DOM-vs-URL) |

## Docs files changed

| File | Change |
| --- | --- |
| `docs/getting-started/vitest-quickstart.md` | Vitest 3/4 compat note, install deps include `@qwik.dev/core` + `vitest-browser-qwik`, Vitest config adds `testSSR()` + `qwikVite()`, new Qwik component example, CSR + SSR test sections, canonical-example link → Qwik |
| `docs/guides/matchers.md` | Top runnable example uses `vitest-browser-qwik`, Chrome-noise canonical-test link points to the Qwik `dom-vs-chrome-url.test.tsx` |
| `docs/guides/migration-from-guidepup.md` | Side-by-side "Shoki" example uses `vitest-browser-qwik` and awaits `render()` |
| `docs/guides/troubleshooting.md` | Canonical-example reference link updated |
| `packages/vitest/README.md` | Canonical-example reference line updated |
| `CHANGELOG.md` | New `[Unreleased]` Phase 9 entries under Changed |

## CI files changed

| File | Change |
| --- | --- |
| `.github/workflows/phase-5-parity.yml` | Path filters + working-directory + parity comment all reference the Qwik example |
| `.github/workflows/examples/shoki-cirrus-runners.yml` | working-directory + step name |
| `.github/workflows/examples/shoki-getmac.yml` | working-directory + step name + comment |
| `.github/workflows/examples/shoki-github-hosted.yml` | working-directory + step name + comment |
| `.github/workflows/examples/shoki-tart-selfhosted.yml` | working-directory + step name |
| `.github/actions/setup/action.yml` | github-hosted-path comment updated |

## Deviations from Plan

### Rule 3 — Blocking: Vitest 4 peer dependency on `vitest-browser-qwik`

- **Found during:** Plan 09-01 typecheck phase.
- **Issue:** The plan spec pinned `vitest ^3.0.0` for the example, but
  every published `vitest-browser-qwik` version (including the ^0.3.0
  the plan pinned) peer-depends on `vitest ^4.0.18`. Vitest 3 and 4
  also have a breaking shape change in `vitest/browser` (the
  `LocatorSelectors` interface the Qwik library's `RenderResult` relies
  on is only present in v4).
- **Fix:**
  - Bumped the Qwik example to `vitest@^4.0.0`, `@vitest/browser@^4.0.0`,
    and added the new `@vitest/browser-playwright@^4.0.0` provider factory.
  - Widened `@shoki/vitest`'s `peerDependencies` on `vitest` and
    `@vitest/browser` to `^3.0.0 || ^4.0.0` so it can be consumed by
    both the (Vitest 3) rest of the monorepo and the (Vitest 4) Qwik
    example.
  - Added an explicit `@vitest/expect` devDep on the example so pnpm
    hoists it into `examples/vitest-browser-qwik/node_modules/`,
    letting the local type-augmentation shim resolve its module
    identity.
- **Files modified:** `examples/vitest-browser-qwik/package.json`,
  `examples/vitest-browser-qwik/vitest.config.ts`,
  `packages/vitest/package.json`.
- **Commit:** 601745a.

### Rule 3 — Blocking: `@shoki/sdk/matchers` type augmentation doesn't merge across Vitest 3↔4

- **Found during:** Plan 09-01 typecheck phase.
- **Issue:** `@shoki/sdk/matchers`'s shipped `dist/matchers/types.d.ts`
  targets `declare module 'vitest'` with `interface Assertion<T = any>`
  + `interface Matchers<T = any>`. It was built against Vitest 3 and
  resolves against Vitest 3's module identity. In Vitest 4 those
  interfaces live in `@vitest/expect`, and with both major versions
  coexisting in the monorepo the augmentation didn't reach the Qwik
  example's `expect` invocations.
- **Fix:** Added a local `src/shoki-matchers.d.ts` that re-declares the
  `Matchers` / `AsymmetricMatchersContaining` / `Assertion` augmentation
  against both `@vitest/expect` and `vitest`, with an `export {}` at the
  end to mark the file as a module (so `declare module 'vitest'` MERGES
  rather than REPLACES). Referenced via
  `/// <reference path="./shoki-matchers.d.ts" />` in the setup file.
  No SDK rebuild required.
- **Files modified:** `examples/vitest-browser-qwik/src/shoki-matchers.d.ts`,
  `examples/vitest-browser-qwik/src/vitest.setup.ts`.
- **Commit:** 601745a.

### Rule 3 — Blocking: Qwik vite build needs `src/root.tsx`

- **Found during:** Plan 09-01 build phase.
- **Issue:** `qwikVite()` requires a `src/root.{tsx,jsx}` entry for
  `vite build` to succeed. The plan spec only specified test fixtures;
  build would have failed the "pnpm -r build → 0" gate.
- **Fix:** Added a minimal `src/root.tsx` that wires `App` into a
  document shell. Tests don't use it — they import fixtures directly.
- **Commit:** 601745a.

### Rule 3 — Blocking: generated artifacts polluting git

- **Found during:** Plan 09-01 commit phase.
- **Issue:** First test run created `dist/`, `.vitest-attachments/`,
  and `tests/__screenshots__/` (failure screenshots from the in-progress
  typecheck-less test), which were accidentally staged with `git add`.
- **Fix:** Added `examples/vitest-browser-qwik/.gitignore` ignoring
  `dist/`, `node_modules/`, `.vitest-attachments/`, and
  `tests/__screenshots__/`.
- **Commit:** 601745a.

### Deferred: Vitest 4 deprecation warnings

- **`test.poolOptions` was removed in Vitest 4**: the `shokiVitest()`
  plugin still uses Vitest 3's pool shape; it runs fine on Vitest 4 via
  compatibility shims but logs a `DEPRECATED` warning. Deferred —
  fixing requires plugin rewrites that land better in a dedicated
  "Vitest 4 canonicalize" phase.
- **`@vitest/browser/context` deprecated in favor of `vitest/browser`**:
  the Qwik test files + `@shoki/vitest`'s `browser.ts` still import
  from `@vitest/browser/context`. Non-blocking (works today) —
  deferred to the same Vitest 4 canonicalize phase.
- **"close timed out after 10000ms" warning** at the end of Vitest 4
  runs: cosmetic, the test process does exit successfully; reported
  upstream in multiple vitest@4 hanging-process threads.

All three deferred items are recorded for a future plan that
canonicalizes the whole monorepo on Vitest 4. None of them block the
Phase 9 gates.

## Authentication gates encountered

None. This phase is all local code + docs work.

## Known Stubs

None. Every new file has real content backing real assertions; no
placeholder UI or TODO markers landed.

## Gate

**GREEN.** Every verification command exit code is 0; every plan-spec
`grep` assertion passes; the Qwik example's non-integration test suite
is green on darwin/arm64 with 3 passing + 3 cleanly skipped; docs site
builds cleanly.

## Self-Check: PASSED

- `examples/vitest-browser-qwik/package.json` FOUND
- `examples/vitest-browser-qwik/src/app.tsx` FOUND
- `examples/vitest-browser-qwik/tests/app-ssr.test.tsx` FOUND
- `examples/vitest-browser-react/` MISSING (as intended)
- commit 601745a FOUND in `git log`
- commit c6f19b6 FOUND in `git log`
- commit d7be01f FOUND in `git log`
- `pnpm -r typecheck` exits 0
- `pnpm -r test` exits 0
- `pnpm -r build` exits 0
- `cd docs && pnpm build` exits 0
