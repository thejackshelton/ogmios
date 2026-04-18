# Phase 9: Qwik example + docs switch from React - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Depends on:** Phase 8 (4-package consolidation — imports reference `@shoki/sdk/matchers`, `@shoki/vitest/setup`)

<domain>
## Phase Boundary

Replace `examples/vitest-browser-react` with `examples/vitest-browser-qwik` using the `vitest-browser-qwik` package. Add a `renderSSR` test scenario (Qwik's unique SSR-in-Vitest-browser-mode capability — directly valuable for a11y testing since SSR output IS the initial accessibility tree). Update every docs reference to React so quickstart/API examples show Qwik.

Out of scope: keeping both React and Qwik examples (the user said "instead of"), extending matchers, NVDA/Linux work.

</domain>

<decisions>
## Implementation Decisions

### Target versions (from the vitest-browser-qwik README)
- `vitest-browser-qwik` ^0.3 (latest when this was gathered — user is the maintainer)
- `@qwik.dev/core` v2 (matches vitest-browser-qwik v0.3+)
- `vitest` ^3 (our existing version; vitest-browser-qwik supports both v3 and v4)
- `@vitest/browser` ^3
- `vite` ^6 (README flags v5 has render issues — we're already on v6)
- `playwright` ^1.50
- `@shoki/sdk`, `@shoki/vitest` — workspace refs

### Example repo layout
```
examples/vitest-browser-qwik/
├── package.json
├── tsconfig.json
├── vite.config.ts          (qwikVite(), testSSR() optional plugin from vitest-browser-qwik/ssr-plugin)
├── vitest.config.ts        (browser.enabled=true, provider=playwright(), instances=[{browser:'chromium'}])
├── src/
│   ├── app.tsx             (Qwik component: button + aria-live region — minimal fixture for assertions)
│   ├── dom-vs-chrome-fixtures.tsx  (positive+negative fixtures for DOM-vs-URL-bar test)
│   └── vitest.setup.ts     (imports @shoki/vitest/setup)
├── tests/
│   ├── app.test.tsx        (CSR: render + click + voiceOver.start/end + toHaveAnnounced)
│   ├── app-ssr.test.tsx    (SSR: renderSSR + assertion on server-rendered accessibility tree)
│   └── dom-vs-chrome-url.test.tsx  (copied pattern from React example — proves the URL-bar filter works with Qwik)
└── README.md
```

### CSR test pattern (from vitest-browser-qwik README)
```typescript
import { render } from 'vitest-browser-qwik'
import { expect, test, beforeAll, afterAll, beforeEach } from 'vitest'
import { voiceOver } from '@shoki/sdk'
import { Button } from './app'

beforeAll(async () => { await voiceOver.start({ mute: true }) })
afterAll(async () => { await voiceOver.end() })
beforeEach(async () => { await voiceOver.reset() })

test('submit button announces role and name', async () => {
  const screen = await render(<Button>Submit</Button>)
  await screen.getByRole('button', { name: 'Submit' }).click()
  const log = await voiceOver.awaitStableLog({ quietMs: 500 })
  expect(log).toHaveAnnounced({ role: 'button', name: 'Submit' })
})
```

### SSR test pattern — UNIQUE VALUE for a11y testing
```typescript
import { renderSSR } from 'vitest-browser-qwik'
import { expect, test } from 'vitest'
import { LiveRegionExample } from './app'

test('SSR emits live region with expected role and aria-live', async () => {
  const screen = await renderSSR(<LiveRegionExample />)

  // The server-rendered HTML IS the initial accessibility tree;
  // test it directly before hydration / JS ever runs.
  expect(screen.container.innerHTML).toContain('role="status"')
  expect(screen.container.innerHTML).toContain('aria-live="polite"')
  await expect.element(screen.getByRole('status')).toBeVisible()
})
```

This is a clear differentiator: **shoki + Qwik + renderSSR lets you assert on the a11y tree before JS runs.** Other frameworks' Vitest browser-mode shows post-hydration state; Qwik shows genuine SSR.

### DOM-vs-URL-bar test — ported verbatim
The pattern from `examples/vitest-browser-react/tests/dom-vs-chrome-url.test.tsx` (Phase 7-04) carries over unchanged — the renderer-pid filter doesn't care what framework produces the DOM. Just swap the React components for Qwik equivalents with the same `xxyyzz-not-in-dom` / `xxyyzz-DOM-MARKER` markers.

### Docs sweep (all React references → Qwik)
Files to update:
- `docs/getting-started/vitest-quickstart.md` — code snippets, install commands
- `docs/guides/matchers.md` — examples
- `docs/guides/migration-from-guidepup.md` — if it uses React code in side-by-side, swap to Qwik
- `docs/api/vitest.md` — any example imports
- `docs/guides/ci/*.md` — checkout paths, pnpm filter names
- `README.md` — any repo-level example references
- `CHANGELOG.md` — new entry: "BREAKING: example repo swapped from React to Qwik to showcase SSR a11y testing"
- `CONTRIBUTING.md` — repo layout section

### CI updates
- `.github/workflows/phase-5-parity.yml` — any `--filter vitest-browser-react-example` → `vitest-browser-qwik-example`
- `.github/workflows/ci.yml` — if it runs example tests, update filter
- `.github/workflows/examples/*.yml` — any reference to the React example path

### Deletion plan
Option A: **Hard replace.** Delete `examples/vitest-browser-react/` entirely when `examples/vitest-browser-qwik/` passes its gate. Matches user intent ("instead of").
Option B: Keep both as first-class. Reject — user explicitly said "instead of."
Option C: Archive React to `.archive/` for reference. Reject — git history preserves; archive adds noise.

**Pick Option A.** Hard replace.

### Verification (runtime, per Phase 8 mandate)
- `cd examples/vitest-browser-qwik && pnpm install` → exit 0
- `pnpm --filter vitest-browser-qwik-example typecheck` → 0
- `pnpm --filter vitest-browser-qwik-example build` → 0 (Vite build)
- `pnpm --filter vitest-browser-qwik-example test` → exit 0 (non-integration tests pass; VO-gated tests skip cleanly)
- `ls examples/vitest-browser-react` → "No such file or directory"
- `grep -r 'vitest-browser-react' .github/ docs/ README.md CONTRIBUTING.md --exclude-dir=.planning` → zero matches (except maybe CHANGELOG historical entries)
- `cd docs && pnpm install --ignore-workspace && pnpm build` → 0 (no broken links from React references)

### Claude's Discretion
- Exact Qwik component layouts (keep them minimal — mirror the React fixtures' shapes)
- Whether to include `testSSR()` plugin for Vitest 3 (probably yes — gives us both CSR + SSR coverage)
- README style for the example repo

</decisions>

<code_context>
## Existing Code Insights

### Reusable patterns from `examples/vitest-browser-react`
- `package.json` shape — pnpm scripts, dev deps layout
- `vitest.config.ts` structure — browser.enabled, provider, instances
- `tests/dom-vs-chrome-url.test.tsx` — the critical DOM-filter test from Phase 7-04; port the assertions verbatim
- `src/vitest.setup.ts` — `import '@shoki/vitest/setup'`

### Qwik-specific references (from vitest-browser-qwik README in Phase 9 task)
- `qwikVite()` from `@qwik.dev/core/optimizer`
- `render()` and `renderSSR()` both async
- `test SSR` optional plugin from `vitest-browser-qwik/ssr-plugin`
- React 19 patterns NOT applicable — Qwik's component model is resumability-first

### Integration Points
- `@shoki/sdk` `voiceOver.start/end/reset` (Phase 7-03 surface, Phase 8 subpath imports)
- `@shoki/vitest/setup` for matcher registration
- `@shoki/sdk/matchers` for type augmentation

</code_context>

<specifics>
## Specific Ideas

- User maintains `vitest-browser-qwik` — dogfooding their own tool is good signal for adopters
- SSR a11y testing is underserved in the ecosystem (axe-playwright only tests post-render) — call this out in the docs explicitly
- The renderSSR pattern unlocks "test the HTML the user first sees, before JS executes" — same mental model as Lighthouse SSR audits but programmable and scriptable

</specifics>

<deferred>
## Deferred Ideas

- `@shoki/playwright` adapter (v1.1+ hardening)
- Storybook + Qwik integration (v1.1+)
- Astro / Solid / Svelte examples (post-v1; one framework per release is enough signal)
- Performance benchmarking of CSR vs SSR capture paths

</deferred>
