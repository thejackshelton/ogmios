# vitest-browser-react-example

Canonical Shoki example — a React app whose Submit button announcement is captured by **real VoiceOver** and asserted with semantic matchers.

This example is the v1 success target (VITEST-07). Every other Phase 4 package exists to make this test pass.

## What's in the box

- `src/App.tsx` — React component with a Submit button and an ARIA live region.
- `tests/app.test.tsx` — Vitest browser-mode test that:
  1. Renders `<App />` in a real Chromium browser (via Playwright).
  2. Boots VoiceOver via `voiceOver.start({ mute: true })` on the Node side.
  3. Clicks the Submit button with Playwright's built-in locator.
  4. Waits for announcements to settle (`session.awaitStable({ quietMs: 500 })`).
  5. Asserts `expect(log).toHaveAnnounced({ role: 'button', name: 'Submit' })`.
- `vitest.config.ts` — Wires the `shokiVitest()` plugin + `@shoki/matchers/setup` in setupFiles.

## Prerequisites

- Node.js >= 24
- pnpm >= 10
- **macOS** with VoiceOver set up for AppleScript control (run `npx shoki doctor` once Phase 2 ships)
- Playwright's Chromium browser (`pnpm exec playwright install chromium`)

## Install

From the repo root:

```sh
pnpm install
pnpm --filter vitest-browser-react-example exec playwright install chromium
```

If the first `pnpm install` fails while trying to download Chromium (e.g. in sandboxed CI), set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and run `playwright install chromium` as a separate step.

## Run the app locally

```sh
pnpm --filter vitest-browser-react-example dev
```

Open `http://localhost:5173` — click Submit and see "Form submitted" appear.

## Run the test

**Without VoiceOver (render-only smoke test):**

```sh
pnpm --filter vitest-browser-react-example test
```

This runs 1 passing test (render) and skips the VO-dependent test.

**With VoiceOver (the real canonical test):**

```sh
SHOKI_INTEGRATION=1 pnpm --filter vitest-browser-react-example test
```

On macOS with VoiceOver set up, this:

1. Boots VoiceOver (muted — `mute: true`).
2. Opens Chromium via Playwright.
3. Renders the app, clicks Submit, waits for VO to settle.
4. Asserts on the captured announcement log.
5. Stops VoiceOver and restores your plist settings (per CAP-02/CAP-03/CAP-14).

Expected output:

```
 ✓ renders the Submit button with the correct accessible name
 ✓ announces the Submit button on click and shows the Form submitted status
Tests  2 passed (2)
```

## What's happening under the hood

1. **`shokiVitest()` plugin** (from `@shoki/vitest`) registers 10 BrowserCommands at Vitest's config hook (VITEST-01) and auto-sets `poolOptions.threads.singleThread = true` because it detects `from '@shoki/vitest/browser'` imports (VITEST-03).
2. **`voiceOver.start()` in the test** (browser side) dispatches `commands.shokiStart()` over Vitest's tinyRPC WebSocket to the Node-side `SessionStore`, which boots VoiceOver via `@shoki/sdk` and returns a `sessionId`.
3. **`page.getByRole('button', { name: 'Submit' }).click()`** is pure Playwright — shoki doesn't drive the page, it only observes.
4. **`session.awaitStable({ quietMs: 500 })`** polls `shokiAwaitStable` over tinyRPC until VoiceOver has been silent for 500ms, then returns the full event log.
5. **`expect(log).toHaveAnnounced({ role: 'button', name: 'Submit' })`** (from `@shoki/matchers`) iterates the log and matches on event shape.
6. **`session.stop()`** decrements the refcount. The last stop kills VO and restores the 9-key plist snapshot (CAP-03).

## Why the test is gated

Running VoiceOver requires a real darwin host with Accessibility + Automation permissions. We gate the test behind `SHOKI_INTEGRATION=1` so:

- Windows/Linux developers can still `pnpm install` + `pnpm typecheck` + run the render-only test.
- CI can explicitly opt in on the macOS jobs (Phase 5 wires this up in `.github/workflows/`).
- Local dev without full setup isn't blocked.

## Troubleshooting

- **"VoiceOver driver is macOS-only"** — You're on a non-darwin host. Switch to a Mac, or run the render-only test without `SHOKI_INTEGRATION=1`.
- **`toHaveAnnounced` fails with an empty log** — Run `npx shoki doctor` (Phase 2). You probably don't have VoiceOver AppleScript control enabled or Accessibility permissions granted to the right process.
- **Test times out** — Increase `quietMs` or `timeoutMs` on `session.awaitStable`. On a slow machine, 500ms of silence can be too tight.
- **Chromium not found** — `pnpm --filter vitest-browser-react-example exec playwright install chromium`.

## CI

Phase 5 ships the reference GitHub Actions workflows (self-hosted tart, Cirrus Runners, GetMac, stock `macos-latest`) that run this test green. See CI-01..06 in the roadmap.

## License

MIT — part of the [Shoki](https://github.com/shoki/shoki) monorepo.
