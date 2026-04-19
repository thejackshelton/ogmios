# Matchers — semantic assertions

Ogmios ships four Vitest `expect` matchers over `OgmiosEvent[]` logs. The pure matcher functions live at **`ogmios/matchers`** (framework-agnostic); Vitest wiring (`expect.extend`) lives at **`ogmios/vitest/setup`**. All four work against both Node-side events (`tsNanos: bigint`) and browser-side RPC payloads (`tsMs: number`). Negation is supported via `.not.*` on every matcher.

## Setup

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["ogmios/vitest/setup"],
  },
});
```

That single import registers all four matchers globally. TypeScript declarations are included so `expect(log).toHaveAnnounced(...)` has full IntelliSense without extra imports.

## The four matchers

### `toHaveAnnounced({ role, name, source?, interrupt? })`

Asserts that the log contains at least one event matching the given **semantic shape**. Both `role` and `name` accept strings or RegExps.

**Runnable example — button click:**

```tsx
import { voiceOver } from "ogmios/vitest/browser";
import { page } from "@vitest/browser/context";
import { render } from "vitest-browser-qwik";
import { expect, test } from "vitest";
import { SubmitButton } from "../src/SubmitButton";

test("announces the Submit button on click", async () => {
  const session = await voiceOver.start({ mute: true });
  try {
    await render(<SubmitButton />);
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

If you're not using `ogmios/vitest`, you can pull the pure matcher functions from `ogmios/matchers` and either wire them into your framework's own `expect.extend` or call them directly:

```ts
import { voiceOver } from "ogmios";
import { toHaveAnnounced } from "ogmios/matchers";

const handle = voiceOver();
await handle.start({ mute: true });
// ... trigger work ...
const log = handle.phraseLog();  // string[] convenience
const events = await handle.drain();  // structured

// Direct call — returns { pass, message } (Jest-compatible shape):
const result = toHaveAnnounced(events, { role: "button", name: "Submit" });
if (!result.pass) throw new Error(result.message());

await handle.stop();
```

When using `ogmios/vitest/setup` the same matcher functions are registered on Vitest's `expect` — you write `expect(events).toHaveAnnounced(...)` and the setup file handles `expect.extend`.

## Chrome noise: how to avoid capturing URL-bar text

When Vitest browser-mode opens Chromium via Playwright, VoiceOver sees the
entire OS screen — including the URL bar, tab titles, and address-bar
autofill. If your assertion naively checks that a specific string was
announced, you may get a false positive from chrome text that VO read from
the browser UI, not from the DOM your test actually rendered.

Ogmios's canonical test
[`examples/vitest-browser-qwik/tests/dom-vs-chrome-url.test.tsx`](https://github.com/thejackshelton/ogmios/blob/main/examples/vitest-browser-qwik/tests/dom-vs-chrome-url.test.tsx)
pins this invariant with a paired positive/negative test. The filter works
on three layers:

### 1. Scope AX capture to the renderer process

Ogmios honors the `OGMIOS_AX_TARGET_PID` environment variable as the pid its
AX observer binds to (via `AXUIElementCreateApplication(pid)` on the helper
side). When set, AX notifications from the parent Chromium process — which
owns the URL bar, tab bar, and window chrome — are excluded from capture.

Under `ogmios/vitest`, the plugin resolves the renderer pid automatically
just before booting VoiceOver. You can set it yourself for custom flows:

```ts
import { execFileSync } from "node:child_process";

const out = execFileSync(
  "/usr/bin/pgrep",
  ["-f", "Chromium Helper (Renderer)"],
  { encoding: "utf8" },
);
process.env.OGMIOS_AX_TARGET_PID = out.trim().split("\n").pop()!;
```

The Zig SDK also exposes `resolveChromeRendererPid` in
`zig/src/drivers/voiceover/driver.zig` for in-process callers that want to
resolve + set the env var without shelling out from TS.

### 2. Focus the page viewport before capture

VoiceOver's AppleScript "last phrase" capture path follows VO cursor — which
doesn't respect process boundaries the same way AX notifications do. Before
your assertion, focus an element inside the DOM so VO cursor lands on page
content, not the browser chrome:

```ts
await page.getByRole("button", { name: "Click me" }).click();
await session.reset();
// Now perform your action and assert.
```

### 3. Use `toHaveAnnounced({ role, name })` instead of string-matching

Structured matchers are immune to most chrome noise because the parent
Chromium process's URL-bar elements don't have the same `(role, name)` shape
as a `<button>Submit</button>` in the DOM:

```ts
expect(log).toHaveAnnounced({ role: "button", name: "Submit" });
```

### Verifying your setup works

Replicate the paired-test pattern from the canonical example:

- Navigate to a URL whose path contains a magic marker string not present
  in your rendered component.
- Drive a page-content announcement.
- Assert `expect(haystack).not.toContain(magicString)`.

If that assertion ever fails, one of the three layers above has regressed
— URL-bar text is leaking into your capture log.

## Caveats

- **RegExp flags matter** — `/submit/i` matches "Submit" and "SUBMIT"; `/submit/` does not.
- **`source`** is `"applescript"` or `"ax"` — distinguishing the capture path matters only for debugging, not for application correctness.
- **`interrupt`** is only set by the AppleScript capture path; the AX-notifications path doesn't carry it.
- **Empty logs are a red flag** unless you explicitly assert them via `toHaveNoAnnouncement` — if you're getting empty logs you didn't expect, your grants are almost certainly missing. Re-run `npx ogmios setup --force`.

## Full API reference

See the [Matchers API reference](/api/matchers) for type signatures and all options. For the framework-wiring subpath see the [`ogmios/vitest` API reference](/api/vitest).
