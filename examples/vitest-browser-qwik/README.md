# vitest-browser-qwik-example

Canonical Shoki example — a Qwik app whose Submit button announcement is
captured by **real VoiceOver** and asserted with semantic matchers, and whose
**server-rendered HTML** (the initial accessibility tree the screen reader
actually sees first) is tested directly without running any JavaScript.

This example replaces the earlier `vitest-browser-react` canonical example.
The move to Qwik unlocks one capability no other framework in Shoki's
Vitest-browser-mode story can offer: **testing the a11y tree before JS
executes** via `renderSSR()`.

## What's in the box

- `src/app.tsx` — Qwik components:
  - `DefaultPage` / `SubmitButton` — Submit button + aria-live live region.
  - `NotInDomPage` — URL-only marker fixture (negative case for the DOM-vs-URL
    test).
  - `DomPage` — DOM-visible marker fixture (positive case).
  - `App` — routes on `window.location.pathname`.
- `tests/app.test.tsx` — **CSR** test:
  1. Renders `<DefaultPage />` in a real Chromium browser (via Playwright).
  2. Boots VoiceOver via `voiceOver.start({ mute: true })` on the Node side.
  3. Clicks Submit with Playwright's locator.
  4. Waits for announcements to settle (`session.awaitStable`).
  5. Asserts `toHaveAnnounced({ role: 'button', name: 'Submit' })` +
     `toHaveAnnouncedText(/Form submitted/i)`.
- `tests/app-ssr.test.tsx` — **SSR** test (Qwik-unique):
  1. Renders `<DefaultPage />` to its server-rendered HTML (no JS runs).
  2. Asserts directly on `role="status"` + `aria-live="polite"` in the SSR
     output.
  3. Runs accessible-name queries against the pre-hydration DOM.
- `tests/dom-vs-chrome-url.test.tsx` — paired DOM-vs-URL-bar regression
  (the "most important functional requirement" from Phase 7-04), ported
  verbatim from the React example to prove the pid filter is
  framework-agnostic.
- `vitest.config.ts` — wires `testSSR()` + `qwikVite()` + `shokiVitest()`.
- `src/vitest.setup.ts` — imports `@shoki/vitest/setup` to register the four
  Shoki matchers on Vitest's `expect`.

## Why Qwik (and why SSR)

Qwik's `renderSSR()` returns the genuine server-rendered HTML — the markup
a user whose browser has JS disabled would see, and **the markup a screen
reader encounters before hydration**. Axe-playwright and similar tools
check post-render state; `renderSSR()` lets you assert on the initial a11y
tree directly.

Mental model: same as a Lighthouse SSR audit, but programmable and
assertable from any Vitest test.

## Prerequisites

- Node.js >= 24
- pnpm >= 10
- **macOS** with VoiceOver set up for AppleScript control (run
  `npx shoki doctor`)
- Playwright's Chromium browser
  (`pnpm exec playwright install chromium`)

## Install

From the repo root:

```sh
pnpm install
pnpm --filter vitest-browser-qwik-example exec playwright install chromium
```

If the first `pnpm install` fails while trying to download Chromium (e.g.
in sandboxed CI), set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and run
`playwright install chromium` as a separate step.

## Run the app locally

```sh
pnpm --filter vitest-browser-qwik-example dev
```

Open `http://localhost:5173` — click Submit and see "Form submitted"
appear.

## Run the tests

**Without VoiceOver** (SSR + render-only smoke tests):

```sh
pnpm --filter vitest-browser-qwik-example test
```

This runs:

- All SSR tests in `app-ssr.test.tsx` (no screen reader needed — the HTML
  is deterministic).
- The render-only smoke test in `app.test.tsx`.
- Skips the VO-dependent CSR + DOM-vs-URL tests cleanly.

**With VoiceOver** (full canonical test suite):

```sh
SHOKI_INTEGRATION=1 pnpm --filter vitest-browser-qwik-example test
```

On macOS with VoiceOver set up, this additionally:

1. Boots VoiceOver (muted — `mute: true`).
2. Opens Chromium via Playwright.
3. Renders the app, clicks Submit, waits for VO to settle.
4. Asserts on the captured announcement log.
5. Runs the paired DOM-vs-URL regression test.
6. Stops VoiceOver and restores your plist settings.

## How SSR testing differs from CSR

| Dimension | CSR (`render`) | SSR (`renderSSR`) |
|-----------|----------------|-------------------|
| JS executes? | Yes | No |
| Event handlers wired? | Yes | No (pre-hydration) |
| Live-region updates? | Yes, on interaction | Initial value only |
| Needs VoiceOver gate? | Yes, for real announcements | No — HTML is deterministic |
| What you assert on | Post-interaction a11y state | Pre-hydration a11y tree |

Both matter. CSR tests prove the app *will* announce correctly once JS
runs; SSR tests prove the user doesn't see broken a11y before JS loads.

## Why the VO tests are gated

Running VoiceOver requires a real darwin host with Accessibility +
Automation permissions. The `SHOKI_INTEGRATION=1` gate keeps:

- Linux/Windows developers unblocked (SSR tests still run green).
- CI explicit about which jobs run the real VO path.
- Local dev without full setup productive — you see SSR and render-only
  tests pass.

## Troubleshooting

- **"VoiceOver driver is macOS-only"** — non-darwin host; run without
  `SHOKI_INTEGRATION=1` to use SSR + render-only tests.
- **SSR test fails with "JSX not valid"** — ensure `jsxImportSource` in
  `tsconfig.json` is `@qwik.dev/core`.
- **`toHaveAnnounced` fails with an empty log** — run `npx shoki doctor`.
  #1 cause is a missing Automation grant.
- **Test times out** — increase `quietMs` or `timeoutMs` on
  `session.awaitStable`. 500ms of silence is tight on slow machines.
- **Chromium not found** —
  `pnpm --filter vitest-browser-qwik-example exec playwright install chromium`.

## CI

Phase 5's reference workflows (self-hosted tart, Cirrus Runners, GetMac,
stock `macos-latest`) run this example. See `.github/workflows/examples/`.

## License

MIT — part of the [Shoki](https://github.com/shoki/shoki) monorepo.
