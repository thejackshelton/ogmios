# Matchers — semantic assertions

`@shoki/matchers` adds four Vitest `expect` matchers over `ShokiEvent[]` logs. All four work against both Node-side events (`tsNanos: bigint`) and browser-side RPC payloads (`tsMs: number`). Negation is supported via `.not.*` on every matcher.

## Setup

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["@shoki/matchers/setup"],
  },
});
```

That single import registers all four matchers globally. TypeScript declarations are included so `expect(log).toHaveAnnounced(...)` has full IntelliSense without extra imports.

## The four matchers

### `toHaveAnnounced({ role, name, source?, interrupt? })`

Asserts that the log contains at least one event matching the given **semantic shape**. Both `role` and `name` accept strings or RegExps.

**Runnable example — button click:**

```tsx
import { voiceOver } from "@shoki/vitest/browser";
import { page } from "@vitest/browser/context";
import { render } from "vitest-browser-react";
import { expect, test } from "vitest";
import { SubmitButton } from "../src/SubmitButton";

test("announces the Submit button on click", async () => {
  const session = await voiceOver.start({ mute: true });
  try {
    render(<SubmitButton />);
    await page.getByRole("button", { name: "Submit" }).click();
    const log = await session.awaitStable({ quietMs: 500 });

    expect(log).toHaveAnnounced({ role: "button", name: "Submit" });
  } finally {
    await session.stop();
  }
});
```

**With RegExp:**

```ts
expect(log).toHaveAnnounced({ role: "button", name: /submit/i });
```

**Negation:**

```ts
expect(log).not.toHaveAnnounced({ role: "alert" });
```

**Error output** — when the assertion fails, the matcher prints the full log prefixed with a numeric index so you can see exactly what was captured:

```
Expected log to contain an announcement { role: 'button', name: 'Submit' }
but none matched. Captured events (3):
  [0] { phrase: 'main web content', role: 'application', source: 'applescript' }
  [1] { phrase: 'Submit', role: 'button', name: 'Submit', source: 'ax' }
  [2] { phrase: 'Form submitted', role: 'status', source: 'ax' }
```

### `toHaveAnnouncedText(pattern)`

Looser match — asserts at least one event's `phrase` matches the string (substring) or RegExp. Useful for announcements that don't carry structured `role`/`name` (live-region status updates, custom announcements).

**Runnable example — form error:**

```tsx
test("announces email validation error", async () => {
  const session = await voiceOver.start({ mute: true });
  try {
    render(<SignupForm />);
    await page.getByRole("button", { name: "Sign up" }).click();
    const log = await session.awaitStable({ quietMs: 500 });

    expect(log).toHaveAnnouncedText(/email is required/i);
  } finally {
    await session.stop();
  }
});
```

**Substring vs regex:**

```ts
expect(log).toHaveAnnouncedText("Form submitted");  // substring, case-sensitive
expect(log).toHaveAnnouncedText(/submitted/i);      // regex
```

### `toHaveNoAnnouncement()`

Asserts the log is empty. The canonical use case is "this decorative animation should be silent" — a regression guard against accidentally announcing noise.

**Runnable example — decorative animation:**

```tsx
test("spinner entry animation makes no announcement", async () => {
  const session = await voiceOver.start({ mute: true });
  try {
    render(<SpinnerDemo />);
    await page.getByRole("button", { name: "Show spinner" }).click();
    const log = await session.awaitStable({ quietMs: 500 });

    expect(log).toHaveNoAnnouncement();
  } finally {
    await session.stop();
  }
});
```

Fails with:

```
Expected log to be empty but found 2 events:
  [0] { phrase: 'spinning', source: 'ax' }
  [1] { phrase: 'please wait', role: 'status', source: 'ax' }
```

### `toHaveStableLog({ quietMs })`

Async matcher — resolves when the log reference has stopped growing for the given quiet window. Use this at the start of a test to wait out any residual announcements from the page load before you begin asserting.

**Runnable example — waiting for stability:**

```tsx
test("status updates settle before we assert", async () => {
  const session = await voiceOver.start({ mute: true });
  try {
    render(<AsyncStatus />);
    await page.getByRole("button", { name: "Refresh" }).click();

    await expect(session.log).toHaveStableLog({ quietMs: 500 });

    expect(session.log).toHaveAnnounced({ role: "status", name: /loaded/i });
  } finally {
    await session.stop();
  }
});
```

Most tests will prefer `session.awaitStable({ quietMs })` which returns the stable log directly; `toHaveStableLog` is for cases where you want to chain further assertions on the same `session.log` reference.

## Picking the right matcher

| You want to assert… | Use |
|---------------------|-----|
| A specific control was announced (role + name) | `toHaveAnnounced` |
| A specific phrase was spoken | `toHaveAnnouncedText` |
| Nothing was announced | `toHaveNoAnnouncement` |
| Wait until announcements stop, then assert | `toHaveStableLog` + follow-up matcher |

## Working against raw event logs

If you're not using `@shoki/vitest`, the matchers still work against any `ShokiEvent[]` or `WireShokiEvent[]`:

```ts
import { voiceOver } from "@shoki/sdk";

const handle = voiceOver();
await handle.start({ mute: true });
// ... trigger work ...
const log = handle.phraseLog();  // string[] convenience
const events = await handle.drain();  // structured
expect(events).toHaveAnnounced({ role: "button", name: "Submit" });
await handle.stop();
```

## Caveats

- **RegExp flags matter** — `/submit/i` matches "Submit" and "SUBMIT"; `/submit/` does not.
- **`source`** is `"applescript"` or `"ax"` — distinguishing the capture path matters only for debugging, not for application correctness.
- **`interrupt`** is only set by the AppleScript capture path; the AX-notifications path doesn't carry it.
- **Empty logs are a red flag** unless you explicitly assert them via `toHaveNoAnnouncement` — if you're getting empty logs you didn't expect, your grants are almost certainly missing. Run `shoki doctor`.

## Full API reference

See the [Matchers API reference](/api/matchers) for type signatures and all options.
