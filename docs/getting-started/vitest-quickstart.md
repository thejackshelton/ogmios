# Vitest quickstart

The fastest way to get a real VoiceOver-backed test running. Five minutes end to end if `shoki doctor` already passes.

## Prerequisites

- `shoki doctor` exits 0 — see [Install](./install) and [Permission setup](./permission-setup).
- A project with Vitest 3.x installed.
- Playwright's Chromium available for Vitest browser mode.

## 1. Install the packages

```bash
pnpm add -D @shoki/sdk @shoki/vitest @shoki/matchers vitest @vitest/browser playwright
pnpm exec playwright install chromium
```

## 2. Configure Vitest

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { shokiVitest } from "@shoki/vitest";

export default defineConfig({
  plugins: [shokiVitest()],
  test: {
    setupFiles: ["@shoki/matchers/setup"],
    browser: {
      enabled: true,
      provider: "playwright",
      instances: [{ browser: "chromium" }],
    },
  },
});
```

The `shokiVitest()` plugin:

- Registers 10 `BrowserCommand`s so browser-side tests can talk to the Node-side SDK over Vitest's tinyRPC.
- Auto-sets `poolOptions.threads.singleThread = true` when it sees `@shoki/vitest/browser` imports — VoiceOver is a system singleton, so parallel tests would collide.
- Throws `ShokiConcurrentTestError` at the first `test.concurrent` in a VO-scoped file, pointing you at the exact fix.

## 3. Write a test

`tests/submit-button.test.tsx`:

```tsx
import { render } from "vitest-browser-react";
import { page } from "@vitest/browser/context";
import { voiceOver } from "@shoki/vitest/browser";
import { expect, test, afterEach } from "vitest";
import { SubmitButton } from "../src/SubmitButton";

let session: Awaited<ReturnType<typeof voiceOver.start>> | undefined;

afterEach(async () => {
  await session?.stop();
  session = undefined;
});

test("announces Submit on click", async () => {
  session = await voiceOver.start({ mute: true });

  render(<SubmitButton />);
  await page.getByRole("button", { name: "Submit" }).click();

  const log = await session.awaitStable({ quietMs: 500 });

  expect(log).toHaveAnnounced({ role: "button", name: "Submit" });
});
```

What's happening:

1. `voiceOver.start({ mute: true })` — browser-side call dispatches over tinyRPC to the Node-side `SessionStore`, which boots VoiceOver muted. Returns a session handle.
2. `render(...)` + Playwright `.click()` — standard Vitest browser-mode. Shoki never drives the page.
3. `awaitStable({ quietMs: 500 })` — polls until VO has been silent for 500ms, then returns the accumulated event log.
4. `toHaveAnnounced({ role, name })` — iterates the log looking for an event whose `role` and `name` match.

## 4. Run it

Locally:

```bash
SHOKI_INTEGRATION=1 pnpm vitest run
```

Expected output:

```
 ✓ tests/submit-button.test.tsx (1)
   ✓ announces Submit on click

Tests  1 passed (1)
```

Without `SHOKI_INTEGRATION=1`, a render-only smoke test runs and the VO-dependent test is skipped — this is how you can still run CI on non-darwin hosts without the test suite exploding.

## Why the gate?

`SHOKI_INTEGRATION=1` is an explicit opt-in to the real-VO path. Reasons:

- **Non-darwin CI jobs** (lint, typecheck on Ubuntu) don't have VO available.
- **Darwin CI jobs without proper grants** would fail cryptically otherwise; the gate makes it loud when the real test is actually running.
- **Local dev without setup** still gets the render-only smoke test passing green.

The canonical [`examples/vitest-browser-react`](https://github.com/shoki/shoki/tree/main/examples/vitest-browser-react) repo uses this pattern. Copy its `vitest.config.ts` and `tests/` verbatim if you want a known-good starting point.

## What's next

- [Matchers guide](/guides/matchers) — the 4 matchers in depth with worked examples.
- [CI quickstart](./ci-quickstart) — run this same test in GitHub Actions.
- [Migration from Guidepup](/guides/migration-from-guidepup) if you're porting an existing Guidepup suite.

## Troubleshooting

- **`ShokiConcurrentTestError`** — you used `test.concurrent` somewhere in the file. Remove it; VoiceOver is a singleton.
- **Empty log + `toHaveAnnounced` fails** — run `shoki doctor`. Missing Automation grant is the #1 cause.
- **Timeout on `awaitStable`** — bump `quietMs` or `timeoutMs`. On a slow machine 500ms is tight.
- **"VoiceOver driver is macOS-only"** — you're on Linux/Windows; drop `SHOKI_INTEGRATION=1`.

For the full troubleshooting index see [Troubleshooting](/guides/troubleshooting).
