---
phase: 04
plan: 04
subsystem: example
tags: [vitest, react, playwright, canonical-example]
requires: ["@shoki/sdk", "@shoki/vitest", "@shoki/matchers", "Playwright chromium"]
provides:
  - "examples/vitest-browser-react (canonical v1 success target)"
  - "End-to-end verification target for Phase 5 CI (Phase 5 forward ref)"
affects: ["pnpm-workspace.yaml", "examples/vitest-browser-react/*"]
tech_stack:
  added: ["React 19", "Vite 6", "@vitejs/plugin-react 4", "Playwright 1.50", "vitest-browser-react 1"]
  patterns: ["SHOKI_INTEGRATION gate", "Vite define() for browser-side env stamping", "vitest-browser-react render()", "@vitest/browser page.getByRole locator"]
key_files:
  created:
    - examples/vitest-browser-react/package.json
    - examples/vitest-browser-react/tsconfig.json
    - examples/vitest-browser-react/tsconfig.node.json
    - examples/vitest-browser-react/vite.config.ts
    - examples/vitest-browser-react/vitest.config.ts
    - examples/vitest-browser-react/index.html
    - examples/vitest-browser-react/src/main.tsx
    - examples/vitest-browser-react/src/App.tsx
    - examples/vitest-browser-react/src/vitest.setup.ts
    - examples/vitest-browser-react/src/env.d.ts
    - examples/vitest-browser-react/tests/app.test.tsx
    - examples/vitest-browser-react/README.md
    - examples/vitest-browser-react/.gitignore
  modified:
    - pnpm-workspace.yaml
    - packages/matchers/src/types.ts
    - packages/vitest/src/errors.ts
decisions:
  - "SHOKI_INTEGRATION + host platform are stamped into the browser bundle via Vite `define` — the test file uses `import.meta.env.SHOKI_INTEGRATION`, not `process.env`, because the browser-mode bundle has no Node globals."
  - "Vitest plugin's browser entry (@shoki/vitest/browser) must not import @shoki/sdk — the sdk's index.ts triggers binding-loader which uses `node:module.createRequire`. Fix: define ShokiError locally in packages/vitest/src/errors.ts, structurally compatible with @shoki/sdk's version."
  - "Augment Vitest `Matchers<T=any>` in addition to `Assertion<T=any>` — augmenting only `Assertion` doesn't flow through to consumer call sites because `Assertion<T>` extends `Matchers<T>` internally."
metrics:
  duration: ~10m
  completed_at: "2026-04-17T17:15Z"
---

# Phase 04 Plan 04: Canonical vitest-browser-react Example Summary

Ships `examples/vitest-browser-react/` — the v1 success target (VITEST-07). Every other Phase 4 artifact exists to make the gated test in this example go green.

## Files

13 created + 3 modified — see frontmatter.

## Two-Test Structure

The test file (`tests/app.test.tsx`) has:

1. **Always-on**: `renders the Submit button with the correct accessible name` — pure vitest-browser-react render + Playwright locator assertion. Runs on every CI host / dev machine.
2. **Gated**: `announces the Submit button on click and shows the Form submitted status` — runs only when `SHOKI_INTEGRATION=1` AND `process.platform === 'darwin'`. This is the real canonical test that boots VO and asserts `toHaveAnnounced({ role: 'button', name: 'Submit' })`.

Without `SHOKI_INTEGRATION`, the second test is `.skipIf`'d cleanly — 1 pass + 1 skip, 0 failures. This keeps the example installable + typecheckable + runnable everywhere.

## SHOKI_INTEGRATION Plumbing

Browser-mode tests run in Chromium; there's no `process.env`. Vite's `define` option stamps values into the bundle at build time:

```ts
define: {
  'import.meta.env.SHOKI_INTEGRATION': JSON.stringify(process.env.SHOKI_INTEGRATION ?? ''),
  'import.meta.env.SHOKI_PLATFORM': JSON.stringify(process.platform),
}
```

Plus an `env.d.ts` that types `ImportMetaEnv.SHOKI_INTEGRATION` / `SHOKI_PLATFORM` as strings.

## Cross-Cutting Fixes (Auto-Applied)

Discovered while bringing up the example:

1. **[Rule 3]** `@shoki/vitest`'s `/browser` entry was importing `ShokiError` from `@shoki/sdk`, which transitively loads `node:module.createRequire` — that threw in the browser bundle. Fix: define a local `ShokiError` base class in `packages/vitest/src/errors.ts` (structurally compatible; Error + `.code`).
2. **[Rule 1]** `@shoki/matchers`' module augmentation targeted only `Assertion<T>`. The example test site still saw `Assertion<WireShokiEvent[]>` without the matchers because Vitest's `Assertion<T>` extends `Matchers<T>` — the latter needs augmenting too. Fix: augment both in a single `declare module 'vitest'` block.

Both fixes are tiny, surgical, and documented in the commit message.

## Version Pins

React 19, React-DOM 19, Vite 6, Vitest 3, @vitest/browser 3, Playwright 1.50, @vitejs/plugin-react 4, vitest-browser-react 1.

All via workspace:* for @shoki/* and semver pinning for third-party per CONTEXT.md version table.

## Verification

- `pnpm install` — resolves 58 new packages + links 3 workspace @shoki/* packages.
- `pnpm --filter vitest-browser-react-example typecheck` — 0 errors.
- `pnpm --filter vitest-browser-react-example build` — Vite bundle emits `dist/index.html` + `dist/assets/index-*.js`.
- `pnpm --filter vitest-browser-react-example test` — 1 pass (render) + 1 skip (gated VO), 0 failures.

Not run in this plan (documented in README for the developer): `SHOKI_INTEGRATION=1 pnpm --filter vitest-browser-react-example test` on a macOS host with VO configured — this is the Phase 5 CI target.

## Deviations from Plan

- Added `src/env.d.ts` to type `import.meta.env.SHOKI_INTEGRATION` / `SHOKI_PLATFORM` — the plan specified `process.env` but that isn't available in the browser bundle. Vite `define` + `import.meta.env` is the correct browser-safe pattern.
- `tests/app.test.tsx` uses `import '@shoki/matchers'` (value import) rather than a type-only import — needed because `verbatimModuleSyntax` preserves only side-effect imports that have runtime existence; pure type-only imports can be erased, which would drop the module augmentation.

## Forward Reference: Phase 5 CI

Phase 5 wires `.github/workflows/ci.yml` with 4 reference runners:
- self-hosted tart (closest to final v1 story)
- Cirrus Runners macOS
- GetMac dedicated runners
- stock `macos-latest`

Each runs `SHOKI_INTEGRATION=1 pnpm --filter vitest-browser-react-example test` as the correctness probe. If this test is green on all four, v1 is shippable.

## Self-Check: PASSED

- All declared files exist.
- Commit `95b3634` — `feat(04-04): canonical vitest-browser-react example + fix cross-cutting deviations (VITEST-07)`.
