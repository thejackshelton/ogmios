# Migration from Guidepup

If you're here, you've used [Guidepup](https://github.com/guidepup/guidepup) — the pioneering OSS library for VoiceOver automation — and want to know when and why to switch to Shoki.

**Short answer:** Shoki is observe-only by design. If you need to _drive_ VoiceOver's rotor, navigate headings, or interact with the VO cursor, stay on Guidepup. If you want to **capture** what VoiceOver says while your existing framework (Vitest, Playwright, XCUITest) drives the app, Shoki is a better fit — with first-class CI support, structured events instead of `string[]`, and a stable TCC trust anchor that doesn't re-prompt every Node upgrade.

## Positioning

| Concern | Guidepup | Shoki |
|---------|----------|-------|
| **API surface** | VO driver (keyPress, rotor nav, interact) + capture | Capture only |
| **Data shape** | `string[]` of phrases | `ShokiEvent[]` — `{ phrase, ts, source, role?, name?, interrupt? }` |
| **Test framework** | Playwright-first | Vitest-first (Playwright and XCUITest composable) |
| **Trust anchor** | Grants TCC to Node (re-prompts on every upgrade) | Grants TCC to a signed Zig-compiled helper (stable) |
| **CI story** | Rolled-your-own per provider | Four reference topologies + reusable action |
| **Matchers** | None — users build their own | Semantic matchers shipped with the library |
| **Platform risk stance** | Implicit | Explicit disclosure of CVE-2025-43530 and AX-notifications hedge |

Shoki's thesis: **observing is 90% of what accessibility tests need, and making that bit excellent wins more than trying to match Guidepup feature-for-feature.** For the remaining 10% (driving VO), your framework's keyboard API dispatches Shoki's exported 226-gesture catalog — see [CAP-16](https://github.com/shoki/shoki/blob/main/.planning/REQUIREMENTS.md).

## Side-by-side: boot + capture a button click

### Guidepup

```ts
import { voiceOver } from "@guidepup/guidepup";
import { test, expect } from "@playwright/test";

test("Submit announces", async ({ page }) => {
  await voiceOver.start();
  try {
    await page.goto("http://localhost:5173");
    await page.getByRole("button", { name: "Submit" }).click();

    // Wait for VO to speak — Guidepup drains phrases lazily.
    await voiceOver.waitForPhrase("Submit, button");

    const phrases = await voiceOver.spokenPhraseLog();
    expect(phrases.join(" ")).toContain("Submit, button");
  } finally {
    await voiceOver.stop();
  }
});
```

### Shoki

```tsx
import { voiceOver } from "@shoki/vitest/browser";
import { page } from "@vitest/browser/context";
import { render } from "vitest-browser-qwik";
import { expect, test } from "vitest";
import { SubmitButton } from "../src/SubmitButton";

test("Submit announces", async () => {
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

**Notable differences:**

- **`start({ mute: true })`** — Shoki mutes VO by default in tests; Guidepup inherits your system settings.
- **Structured matcher** — `toHaveAnnounced({ role, name })` asserts on the `role` + `name` of a structured event, not a substring match of a joined string.
- **`awaitStable`** — explicit quiet-window wait replaces Guidepup's per-phrase `waitForPhrase`. Tends to be less flaky because it doesn't care about the exact phrase shape.

## API map

| Guidepup | Shoki equivalent |
|----------|------------------|
| `voiceOver.start()` | `voiceOver.start({ mute?, speechRate?, takeOverExisting? })` |
| `voiceOver.stop()` | `session.stop()` |
| `voiceOver.spokenPhraseLog()` | `session.phraseLog()` (convenience — returns `string[]`) |
| `voiceOver.lastSpokenPhrase()` | `session.lastPhrase()` |
| `voiceOver.waitForPhrase(p)` | `await session.awaitStable({ quietMs })` + semantic matcher |
| `voiceOver.perform(keyDown/keyUp)` | **Out of scope** — dispatch via your framework's keyboard driver + the [exported VO command catalog](/api/sdk#keyboard-command-catalog) |
| `voiceOver.interact()` | **Out of scope** — same; observe-only |
| `voiceOver.previous() / next()` | **Out of scope** — dispatch `VoiceOverCommands.next` via your keyboard driver |
| `voiceOver.clearSpokenPhraseLog()` | `session.clear()` |

## Choosing between them

### Stay on Guidepup if

- You depend on VO navigation (rotor, `next()`, `previous()`, `perform()`).
- You're happy with Playwright as your only runner.
- Your CI is a single-provider setup and re-granting TCC on Node upgrades isn't a recurring pain.

### Switch to Shoki if

- You're observe-only (the majority of a11y tests are).
- You use Vitest or want structured events you can assert on semantically.
- You need to run the same tests across self-hosted tart, Cirrus Runners, GetMac, and GH-hosted `macos-latest` without per-provider rewrites.
- Stable TCC (no re-grant on every Node upgrade) matters to you.

### Use both

Nothing stops you. Guidepup's navigation helpers can drive VO while Shoki captures — just make sure only one library boots VO.

## Limits to be honest about

- **Shoki is macOS-only in v1.** Guidepup ships NVDA support already. If you need NVDA today, Guidepup is your only choice. Shoki's v1.1 roadmap adds NVDA to validate the driver abstraction (see [EXT-01](/background/architecture#driver-extensibility)).
- **Shoki doesn't drive VO.** If your test asserts on post-`next()` rotor state, Guidepup is the right tool.

## Want to migrate?

Open an issue on the [shoki repo](https://github.com/shoki/shoki) with the specific Guidepup APIs your suite uses and we'll map them to shoki equivalents (or explicitly file them as out of scope). The [API reference](/api/sdk) is the source of truth for the full surface.
