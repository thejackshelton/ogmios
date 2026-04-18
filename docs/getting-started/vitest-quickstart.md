# Vitest quickstart

The fastest way to get a real VoiceOver-backed test running. Five minutes end to end if `shoki doctor` already passes.

## Prerequisites

- `shoki doctor` exits 0 — see [Install](./install) and [Permission setup](./permission-setup).
- A project with Vitest (3.x or 4.x) installed.
- Playwright's Chromium available for Vitest browser mode.

The canonical example uses **Qwik** because its `renderSSR()` helper lets you assert on the **server-rendered accessibility tree before JavaScript runs** — a capability other Vitest browser-mode integrations don't offer. The `@shoki/*` packages are framework-agnostic; anything you see below works with React, Solid, Svelte, or vanilla DOM too.

## 1. Install the packages

Local install in your test project — this is the canonical path (see [Install → Why local install](./install#why-local-install)):

```bash
npm install -D @shoki/core vitest @vitest/browser playwright vitest-browser-qwik
```

Or the pnpm equivalent used throughout these docs:

```bash
pnpm add -D @shoki/core vitest @vitest/browser playwright @qwik.dev/core vitest-browser-qwik
pnpm exec playwright install chromium
```

The `@shoki/binding-darwin-arm64` (or `-x64`) native package is installed automatically as an `optionalDependency` of `@shoki/core`.

## 2. Configure Vitest

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { shokiVitest } from "@shoki/core/vitest";
import { qwikVite } from "@qwik.dev/core/optimizer";
import { testSSR } from "vitest-browser-qwik/ssr-plugin";

export default defineConfig({
  plugins: [testSSR(), qwikVite(), shokiVitest()],
  test: {
    setupFiles: ["@shoki/core/vitest/setup"],
    browser: {
      enabled: true,
      provider: "playwright",
      instances: [{ browser: "chromium" }],
    },
  },
});
```

The `testSSR()` plugin is what unlocks Qwik's `renderSSR()` helper — it's optional if you only need CSR tests.

`@shoki/core/vitest/setup` runs `expect.extend(...)` for Shoki's four matchers (`toHaveAnnounced`, `toHaveAnnouncedText`, `toHaveNoAnnouncement`, `toHaveStableLog`) — the matcher implementations themselves are pure functions at `@shoki/core/matchers` and the setup file is the framework-specific wiring.

The `shokiVitest()` plugin:

- Registers 10 `BrowserCommand`s so browser-side tests can talk to the Node-side SDK over Vitest's tinyRPC.
- Auto-sets `poolOptions.threads.singleThread = true` when it sees `@shoki/core/vitest/browser` imports — VoiceOver is a system singleton, so parallel tests would collide.
- Throws `ShokiConcurrentTestError` at the first `test.concurrent` in a VO-scoped file, pointing you at the exact fix.

## 3. Define a Qwik component

`src/SubmitButton.tsx`:

```tsx
import { $, component$, useSignal } from "@qwik.dev/core";

export const SubmitButton = component$(() => {
  const message = useSignal("");
  const onSubmit = $(() => {
    message.value = "";
    queueMicrotask(() => { message.value = "Form submitted"; });
  });

  return (
    <form preventdefault:submit onSubmit$={onSubmit}>
      <button type="submit">Submit</button>
      <p aria-live="polite" role="status">{message.value}</p>
    </form>
  );
});
```

## 4. Write a CSR test

`tests/submit-button.test.tsx`:

```tsx
import { render } from "vitest-browser-qwik";
import { page } from "@vitest/browser/context";
import { voiceOver, type ShokiBrowserSession } from "@shoki/core/vitest/browser";
import { expect, test, beforeAll, afterAll, beforeEach } from "vitest";
import { SubmitButton } from "../src/SubmitButton";

let session: ShokiBrowserSession;

beforeAll(async () => {
  session = await voiceOver.start({ mute: true });
}, 30_000);

afterAll(async () => {
  await session?.end();
});

beforeEach(async () => {
  // Cheap: clears the ring buffer + resets the VO cursor, no osascript respawn.
  await session.reset();
});

test("announces Submit on click", async () => {
  await render(<SubmitButton />);
  await page.getByRole("button", { name: "Submit" }).click();

  const log = await session.awaitStable({ quietMs: 500 });

  expect(log).toHaveAnnounced({ role: "button", name: "Submit" });
});
```

## 5. Write an SSR a11y test (Qwik-unique)

`tests/submit-button-ssr.test.tsx`:

```tsx
import { renderSSR } from "vitest-browser-qwik";
import { expect, test } from "vitest";
import { SubmitButton } from "../src/SubmitButton";

test("SSR output exposes the correct initial a11y tree", async () => {
  const screen = await renderSSR(<SubmitButton />);

  // The server-rendered HTML IS the initial accessibility tree.
  expect(screen.container.innerHTML).toContain('role="status"');
  expect(screen.container.innerHTML).toContain('aria-live="polite"');
  await expect.element(screen.getByRole("button", { name: "Submit" })).toBeVisible();
});
```

No VoiceOver gate needed — the SSR assertion runs on every host. This test proves a screen reader user won't see broken a11y before JavaScript hydrates.

What's happening in the CSR test:

1. **`beforeAll` → `voiceOver.start({ mute: true })`** — browser-side call dispatches over tinyRPC to the Node-side `SessionStore`, which boots VoiceOver muted. Returns a session handle. One VoiceOver session per test file is the default; the SessionStore refcounts if multiple test files in the same worker share a session.
2. **`beforeEach` → `session.reset()`** — cheap per-test cleanup. No osascript respawn, no VO restart — only clears the ring buffer and resets the VO cursor.
3. **`render(...)` + Playwright `.click()`** — standard Vitest browser-mode. Shoki never drives the page.
4. **`awaitStable({ quietMs: 500 })`** — polls until VO has been silent for 500ms, then returns the accumulated event log.
5. **`toHaveAnnounced({ role, name })`** — iterates the log looking for an event whose `role` and `name` match.
6. **`afterAll` → `session.end()`** — tears VoiceOver down and restores the pre-test plist keys. `end()` is the preferred name in v1+; `stop()` remains available for back-compat.

## 6. Run the tests

Locally (SSR + render-only, no VoiceOver):

```bash
pnpm vitest run
```

Full integration (SSR + CSR + real VoiceOver):

```bash
SHOKI_INTEGRATION=1 pnpm vitest run
```

Expected output:

```
 ✓ tests/submit-button-ssr.test.tsx (1)
   ✓ SSR output exposes the correct initial a11y tree
 ✓ tests/submit-button.test.tsx (1)
   ✓ announces Submit on click

Tests  2 passed (2)
```

Without `SHOKI_INTEGRATION=1`, SSR tests still run (they don't need a screen reader) and the VO-dependent CSR test is skipped — this is how you can still run CI on non-darwin hosts without the test suite exploding.

## Why the gate?

`SHOKI_INTEGRATION=1` is an explicit opt-in to the real-VO path. Reasons:

- **Non-darwin CI jobs** (lint, typecheck on Ubuntu) don't have VO available.
- **Darwin CI jobs without proper grants** would fail cryptically otherwise; the gate makes it loud when the real test is actually running.
- **Local dev without setup** still gets the SSR + render-only smoke tests passing green.

The canonical [`examples/vitest-browser-qwik`](https://github.com/shoki/shoki/tree/main/examples/vitest-browser-qwik) repo uses this pattern. Copy its `vitest.config.ts` and `tests/` verbatim if you want a known-good starting point.

## What's next

- [Matchers guide](/guides/matchers) — the 4 matchers in depth with worked examples. For the full pattern that keeps Chrome URL-bar / tab-title text out of your captured log, see [Matchers § Chrome noise](/guides/matchers#chrome-noise-how-to-avoid-capturing-url-bar-text).
- [CI quickstart](./ci-quickstart) — run this same test in GitHub Actions.
- [Migration from Guidepup](/guides/migration-from-guidepup) if you're porting an existing Guidepup suite.

## Troubleshooting

- **`ShokiConcurrentTestError`** — you used `test.concurrent` somewhere in the file. Remove it; VoiceOver is a singleton.
- **Empty log + `toHaveAnnounced` fails** — run `shoki doctor`. Missing Automation grant is the #1 cause.
- **Timeout on `awaitStable`** — bump `quietMs` or `timeoutMs`. On a slow machine 500ms is tight.
- **"VoiceOver driver is macOS-only"** — you're on Linux/Windows; drop `SHOKI_INTEGRATION=1`.

For the full troubleshooting index see [Troubleshooting](/guides/troubleshooting).
