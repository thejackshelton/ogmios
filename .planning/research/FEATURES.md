# Feature Research

**Domain:** Screen-reader automation for test frameworks and CI
**Researched:** 2026-04-17
**Confidence:** MEDIUM–HIGH (Guidepup API surface is HIGH from official docs; CI pain, adoption signals, and competitive gaps are MEDIUM from multi-source web search)

## Prior Art — Concrete Mapping

This section is the evidence base. Feature tables below cite back to it.

### 1. Guidepup (`@guidepup/guidepup`) — direct competitor

- **Repo:** https://github.com/guidepup/guidepup — **519 stars**, latest release **0.24.1 (Jan 2026)**, MIT, TypeScript-only, actively maintained.
- **Mechanism (macOS):** AppleScript (`osascript`) driving the VoiceOver scripting dictionary — e.g. `Application('VoiceOver').lastPhrase.content()`. Uses the `VoiceOverStarter` binary at `/System/Library/CoreServices/VoiceOver.app/Contents/MacOS/VoiceOverStarter` to launch VO.
- **Mechanism (Windows):** Native NVDA accessibility APIs plus a controller DLL. Not relevant to Shoki v1.
- **Full public API surface** (extracted from guidepup.dev `/docs/api/class-voiceover` and `/docs/api/class-nvda`):

  Lifecycle:
  - `start([options])` — turn screen reader on
  - `stop()` — turn off
  - `detect()` — is VO/NVDA supported on this OS
  - `default()` — is this the OS default screen reader

  Navigation (VO cursor):
  - `next()` — VO-Right Arrow
  - `previous()` — VO-Left Arrow
  - `act()` — default action (VO-Space)
  - `interact()` — VO-Shift-Down (enter a container)
  - `stopInteracting()` — VO-Shift-Up (exit a container)

  Driving input (observation: **this is where Shoki diverges — we won't do this**):
  - `click([options])` — mouse click with button/count options
  - `press(key[, options])` — keyboard key on focused item
  - `type(text[, options])` — type text
  - `perform(command[, options])` — execute a pre-canned keyboard or Commander command

  Current-item & history:
  - `itemText()` — text of item under cursor
  - `itemTextLog()` — full history of visited items
  - `lastSpokenPhrase()` — most recent speech
  - `spokenPhraseLog()` — full history of speech
  - `clearItemTextLog()` / `clearSpokenPhraseLog()`

  VO-only extras:
  - `copyLastSpokenPhrase()` — to clipboard
  - `saveLastSpokenPhrase()` — to file (includes crash log)
  - `takeCursorScreenshot()` — screenshot of focused item

  Properties / command catalogs:
  - `keyboardCommands` — **226 VO keyboard gestures** codified (`findNextHeading`, `findNextControl`, etc.)
  - `commanderCommands` (VO) — **129 VO Commander commands**

- **Capture shape:** Returns flat `string[]` from the log methods. No timestamps, no structured event type, no node identity, no verbosity indicator, no "interruption" marker. Tests typically do `expect(JSON.stringify(await voiceOver.spokenPhraseLog())).toMatchSnapshot()`.
- **Known pain (from guidepup/guidepup issues and dev.to articles):**
  - "Failure on `voiceOver.start` if VoiceOver is already started" — not idempotent.
  - "Poor `osascript` performance on Sonoma" — speech polling is slow.
  - Sequoia compatibility issues reported.
  - SIP blocks writes to `/private/var/db/Accessibility/.VoiceOverAppleScriptEnabled` — the root CI pain point; `@guidepup/setup --ignoreTccDb` is the escape hatch and it documents that reliability is not guaranteed when used.
  - "What can GuidePup do that other testing libraries can't" is called out in issues as a documentation gap — users can't tell when to pick it.
  - No rate/verbosity configurability.
  - No headless NVDA mode.
  - Tests "slightly slower than Playwright expects" → need 3-minute timeouts and `workers: 1`.

### 2. Guidepup Playwright (`@guidepup/playwright`)

- **Repo:** https://github.com/guidepup/guidepup-playwright.
- Thin wrapper. Adds:
  - `voiceOverTest` / `nvdaTest` — Playwright test fixtures that inject a `voiceOver`/`nvda` instance alongside `page`.
  - `screenReaderConfig` — Playwright config preset (extended timeouts, retries, single worker).
  - `navigateToWebContent()` — a convenience that positions VO at the first body element after `page.goto()` **and clears the logs**.
  - `voiceOverStartOptions` / `nvdaStartOptions` via `test.use({...})` — e.g. `{ capture: "initial" }`.
- **Does not** provide Vitest, XCUITest, or other framework integrations.

### 3. Guidepup Virtual (`@guidepup/virtual-screen-reader`)

- **Repo:** https://github.com/guidepup/virtual-screen-reader — **136 stars**, v0.32.1 (May 2025), MIT.
- **Not a real screen reader.** It walks the DOM and builds an accessibility tree from W3C ARIA 1.2, HTML-AAM, ACCNAME 1.2 specs, then *simulates* what a screen reader would say.
- Same API shape as Guidepup (`virtual.start/next/lastSpokenPhrase/...`) so user code is portable.
- **Why it's separate:** For unit tests where you do not want to boot VO. Fast, runs anywhere, zero permissions. **Shoki's explicit "no simulation" rule rules this approach out** — but the API-parity idea is worth stealing.

### 4. Assistiv Labs

- Not an automation API. Cloud-based remote AT testing (VoiceOver, NVDA, JAWS, Narrator) accessed through a browser tab. Targets manual QA, not CI.
- **Relevance to Shoki:** None as a competitor; validates commercial demand for "real AT, hard to run locally."

### 5. Static checkers — axe-core, Pa11y, accessibility-checker

- **axe-core (Deque):** Rules engine over DOM + ARIA. Checks WCAG 2.0/2.1/2.2 + best practice. Deque itself states it catches **~57% of WCAG issues** automatically. No runtime AT involvement.
- **Pa11y:** CLI over a headless browser, wraps axe/HTMLCS rules. Built for CI. Still static.
- **axe-playwright / @axe-core/playwright:** `await new AxeBuilder({ page }).analyze()` and assert on violations. Used alongside Playwright; still static.

  **Where static ends, Shoki begins:** static checkers verify that labels, roles, and contrast exist; they cannot verify what the user actually hears — whether VO says "link, submit" vs "button, submit," whether a live region announces in the right order, whether focus changes are announced at all, or whether a toast is interrupted by a tooltip.

### 6. Apple native — XCTest / XCUITest / Accessibility Inspector

- **`performAccessibilityAudit()`** — introduced in **Xcode 15 / iOS 17** on `XCUIApplication`. Checks labels, contrast, dynamic type, hit regions, element descriptions. **Static audit.** `XCUIAccessibilityAuditType` lets you filter categories.
- Does **not** boot VoiceOver or capture announcements. Apple has no public API for capturing VO speech.
- Accessibility Inspector is interactive-only, no automation API.
- XCUITest can *drive* an app (tap, swipe) but the `app.buttons["id"].accessibilityLabel` is the same tree axe reads, not what VO announces.
- **Relevance to Shoki:** the iOS/macOS native-app audience has no equivalent to Guidepup; a Shoki that works for an AppKit/SwiftUI app would be net-new in the ecosystem.

### 7. Chrome DevTools / Puppeteer accessibility tree

- `page.accessibility.snapshot({ interestingOnly: true })` returns a JSON tree (roles, names, attributes) pulled from CDP (`Accessibility.getFullAXTree`).
- **Static snapshot** of Chrome's AX tree. Not what a screen reader announces — it is what the browser exposes to the platform AT API. Mapping to speech is AT-specific.
- Ergonomic model: dump-and-snapshot. Same pattern as Playwright's aria-snapshots.

### 8. Playwright built-in a11y assertions

- `expect(locator).toHaveAccessibleName('Save')`
- `expect(locator).toHaveAccessibleDescription(...)`
- `expect(locator).toHaveRole('button')`
- `expect(locator).toMatchAriaSnapshot(...)` — YAML representation of the AX tree, with `--update-snapshots` and a codegen "Aria snapshot" tab in Inspector.
- All derive from the browser's AX tree, not from VO/NVDA speech. Excellent DX, hugely popular, but still **static semantic verification** — they are what Shoki composes with, not what it replaces.

### Positioning diagram

```
                    [ what the user actually hears ]
                                     ^
                                     | ← Shoki lives here
                                     |
   [ static AX tree snapshot ]  <----+----> [ real screen reader speech ]
      axe-core / axe-playwright            Guidepup (observe + drive)
      Puppeteer ax.snapshot                Shoki (observe-only, CI-first)
      Playwright aria-snapshots            Auto VO, web-test-runner-voiceover
      XCUI performAccessibilityAudit       (stalled projects)
```

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these = "why would I use this over Guidepup?"

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `voiceOver.start()` / `voiceOver.stop()` lifecycle | Every tool in this space has this | MEDIUM | Must be idempotent — Guidepup's #1 complaint is `start()` fails if VO already on. Shoki should tolerate existing VO state and tear down cleanly on test failure. |
| Capture speech as an ordered list | The core promise — "assert on what VO said" | HIGH | The hard part is the capture mechanism itself (AppleScript polling vs something better); the surface is `log()` / `lastPhrase()`. |
| `listen()` that yields a stream of announcements | PROJECT.md names this as the canonical v1 call | HIGH | Pattern should be both "stream while user's framework drives the page" and "snapshot at end." |
| Clear-log / scope-log semantics | Guidepup's `navigateToWebContent()` clears logs; every test needs per-test isolation | LOW | `voiceOver.clear()` plus an implicit clear when `listen()` is called. |
| Works from inside Vitest browser mode | PROJECT.md names this as the v1 success target | HIGH | Needs to cohabit with Playwright-as-browser-provider; single-worker constraint likely inherited. |
| Works on a developer's local Mac without sysadmin | PROJECT.md requirement | HIGH | This is the hardest UX problem — permissions (TCC, Accessibility, Automation). Guidepup's `@guidepup/setup` punts on this. |
| Works on GitHub Actions macOS and self-hosted runners | PROJECT.md requirement | HIGH | SIP + TCC are the blockers. Must document `--ignoreTccDb`-equivalent escape hatches or use tart to sidestep. |
| Muted audio during capture | Nobody wants speakers blaring in CI | LOW | Guidepup does this implicitly via VO settings. Easy but must be unmissable default. |
| Max speech rate during capture | Tests should not sit through 300wpm speech in realtime | LOW | Again, VO setting — set high on `start()`. |
| Keyboard command catalog (findNextHeading, etc.) | Users will want to drive VO rotor from their test framework eventually | MEDIUM | v1 is observe-only per PROJECT.md, so this can be **just the catalog** (strings/constants) for users to `page.keyboard.press()` themselves — no Shoki-driven input. |
| Snapshot-friendly output | Everyone uses `toMatchSnapshot()` on the phrase log | LOW | JSON-serializable, deterministic ordering. |
| TypeScript types on everything | Guidepup sets the bar; TS is the canonical surface | LOW | Zig→TS bindings via Yuku produce the .d.ts. |
| Detect screen reader already running / conflict | VO doesn't tolerate two controllers | LOW | `voiceOver.detect()`-equivalent, and throw clearly if another test is running it. |

### Differentiators (Competitive Advantage)

What would make a web dev pick Shoki over Guidepup.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Zero-config CI on GetMac + GH Actions macOS** | PROJECT.md's hero constraint. Guidepup requires hand-rolled TCC pokes; Shoki ships a one-liner that works. | HIGH | Likely means either (a) a tart-VM image Shoki distributes, or (b) a `shoki doctor` CLI that grants permissions programmatically where SIP allows and guides manually where it doesn't. Research phase: pick one. |
| **Structured event stream, not just strings** | Each announcement carries `{ phrase, ts, source: "speech"\|"braille"\|"sound", interrupt: bool, role?, name? }`. Enables semantic assertions (`expect(events).toContainAnnouncement({ role: "button", name: "Submit" })`) where Guidepup forces string regex. | HIGH | Requires a richer capture path than AppleScript polling. May be where Zig+OS-level integration pays off (NSAccessibility / AXObserver hooks). |
| **First-class `listen()` generator API** | `for await (const ev of vo.listen()) { ... }` lets tests react as announcements arrive, not only after. Reflects real AT use. | MEDIUM | Once the event-stream foundation exists, this is a thin wrapper. |
| **Works in Vitest browser mode, not just Playwright** | Guidepup only has a Playwright fixture. Vitest browser mode is growing fast and component-library testing is a named audience. | MEDIUM | Framework-agnostic core + per-framework thin adapters. |
| **Idempotent `start()` / safe teardown** | Guidepup's top bug. Shoki handles "VO already running" and "test crashed mid-run" gracefully. | LOW | Pure polish; huge DX win. |
| **Structured diagnostic artifacts on failure** | On test fail, write `shoki-debug/<test>/events.json`, `screenshot.png`, `voiceover-log.txt`, optional WebVTT caption track. | MEDIUM | Guidepup has `saveLastSpokenPhrase` and `takeCursorScreenshot`, but no unified "what happened in this test" bundle. |
| **WebVTT caption output for replay** | Emit a `.vtt` alongside a screen recording (CI artifact) so reviewers can *play back what VO said during the test.* | MEDIUM | Requires timestamped capture. High "wow factor" for a PR review. |
| **`shoki doctor` CLI** | One command diagnoses local permission state, tells the user *exactly* what to click, or fixes what it can. | MEDIUM | Addresses PROJECT.md's "Mac detected → walk user through setup" bullet. |
| **tart VM image for permission-isolated local runs** | Mac devs who don't want to grant their primary user account Accessibility+Automation can run tests in a tart VM with pre-granted permissions. | HIGH | PROJECT.md names this as on-the-table. Research phase recommends evaluating vs native-with-CLI. |
| **Stable API across screen readers (extensibility)** | Same `listen()`/`log()`/`clear()` surface on VO, later NVDA, later Orca, later iOS VoiceOver. | MEDIUM | Architectural, not v1-shippable; but API shape has to be designed now so NVDA slots in without breaking. |
| **Semantic matchers: `expect(shoki).toHaveAnnounced(...)`** | `expect(log).toHaveAnnounced({ role: "button", name: /submit/i })` — beats regex on strings. | LOW (given events) | Small package layered on the event stream. |
| **Accurate "interrupted" / "paused" detection** | Real VO often gets cut off when focus changes; tests should be able to assert that. Guidepup can't. | HIGH | Needs sub-AppleScript instrumentation. |
| **Zig core + Yuku TS bindings = speed** | Guidepup complains of slow `osascript` polling on Sonoma. Shoki can be substantially faster. | HIGH | PROJECT.md Key Decision already locked this in; this is where that decision pays user-visible dividends. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Driving the app (`click`, `type`, `press`, `act`, `interact`) | Guidepup has it, users will ask "where's my `click()`?" | PROJECT.md explicit Out-of-Scope. Scope creep into test-framework territory; Playwright/XCUI already drive the app; doubles the surface area and doubles the flake. | Document the pattern: `await page.getByRole('button').click(); for await (const ev of vo.listen()) {...}`. Ship example recipes. |
| Simulating a screen reader ("virtual" mode) | Fast, cross-platform, no perms | PROJECT.md Out-of-Scope: "simulation would defeat the point." Users who want this already have `@guidepup/virtual-screen-reader`. | Recommend virtual-screen-reader in docs for unit-test layer; position Shoki as the integration layer. |
| Static a11y rule scanning (axe-style) | "One tool for a11y" is appealing | PROJECT.md Out-of-Scope. Axe-core is a solved problem and is already dominant. | Docs: "Run axe for structure, Shoki for speech. They compose." |
| A11y scoring / grading ("your page is 87/100") | Management-friendly number | PROJECT.md Out-of-Scope. Opinionated scoring is a trap — different teams care about different things. | Expose raw event stream; let teams define what "good" means. |
| Built-in rotor / quick-nav helpers on v1 | "I want `vo.nextHeading()`" | PROJECT.md says observe-only v1. Driving VO itself multiplies timing bugs. | Ship `voiceOver.keyboardCommands.findNextHeading` as a *constant* users press via their own framework. |
| Running its own test runner | Simplicity | PROJECT.md Out-of-Scope. Every test runner has opinions; we'd lose Vitest/Playwright/XCUI compatibility the moment we picked. | Stay BYO-runner. Ship adapters, not a runner. |
| Proprietary dashboard / SaaS upsell | Easy monetization story | Muddles the OSS story, fractures adoption. | Events are JSON; let users build their own dashboards or pipe into existing tools. |
| "Record test in a GUI, export code" Playwright-codegen-style | Nice to have eventually | Huge effort for v1; VO-while-recording is a permissions nightmare. | v2+ consideration. |
| Configurable speech rate / verbosity knobs at the test level | Users think they want realistic speech timing | Introduces test flake and doesn't match CI reality (muted + fast). | Opinionated default (muted, max rate); allow override only if user explicitly asks. |

## Feature Dependencies

```
[ Zig core + Yuku TS bindings ]
    └──enables──> [ Native macOS AX / AppleScript hybrid capture ]
                       └──enables──> [ Structured event stream ]
                                           ├──enables──> [ listen() generator ]
                                           ├──enables──> [ semantic matchers ]
                                           ├──enables──> [ WebVTT output ]
                                           └──enables──> [ interrupt detection ]

[ Permission-setup story (tart VM OR shoki doctor) ]
    └──required-for──> [ Local dev UX ]
    └──required-for──> [ CI UX on GH macOS / GetMac / self-hosted ]

[ Core TS API (start/listen/log/stop) ]
    └──required-for──> [ Vitest browser mode adapter ]
    └──required-for──> [ Playwright adapter ]
    └──required-for──> [ XCUITest adapter (v2) ]

[ Extensible screen-reader abstraction ]
    └──required-for──> [ NVDA support (v2) ]
    └──required-for──> [ Orca support (v2+) ]
    └──required-for──> [ iOS VoiceOver (v2+) ]

[ Keyboard command catalog ]
    ──enhances──> [ Core TS API ] (user-facing convenience, no runtime dependency)

[ shoki doctor CLI ]
    ──conflicts──> [ tart-VM-only story ]  // pick one primary; the other is secondary
```

### Dependency Notes

- **Structured event stream blocks most differentiators.** If Shoki ships with Guidepup-shaped `string[]` output, we give up `listen()`, semantic matchers, WebVTT, and interrupt detection simultaneously. This is the single highest-leverage feature and it gates almost everything else worth building.
- **Permission story blocks adoption, not features.** Whether we pick tart-VM or `shoki doctor`, the feature itself is binary: users can run tests locally + in CI, or they cannot. The research phase owes the project a decision here.
- **Vitest browser mode adapter is independent of the Playwright adapter.** Both layer on the core TS API. Shipping Vitest first (PROJECT.md target) does not block a later Playwright adapter.
- **NVDA, Orca, iOS all depend on the abstraction layer being right in v1.** We don't build them, but we design so they drop in. If the v1 API leaks macOS-specific concepts (e.g. exposing AppleScript handles), v2 costs a rewrite.
- **Keyboard command catalog enhances but does not require driving.** Shipping the constants (`voiceOver.commands.findNextHeading = "VO+Command+H"`) is observe-only-compatible; users press the keys via their own framework.

## MVP Definition

### Launch With (v1)

Minimum viable — matches PROJECT.md's "if everything else fails, this must work" standard (`voiceOver.listen()` in a Vitest browser-mode test produces a structured log).

- [ ] **Core TS API** — `voiceOver.start()`, `voiceOver.stop()`, `voiceOver.listen()`, `voiceOver.log()`, `voiceOver.clear()` — exposed from `@shoki/core` (or top-level `shoki`) via Yuku-generated bindings.
- [ ] **macOS VoiceOver driver (Zig)** — boots VO, sets muted + max-rate, captures announcements, tears down cleanly even on crash. Idempotent start.
- [ ] **Structured event stream** — each event at minimum `{ phrase: string, ts: number, source: 'speech' }`. Richer fields (`role`, `name`, `interrupt`) land as available from the capture path.
- [ ] **Vitest browser mode integration** — documented working example, ideally a `@shoki/vitest` fixture that auto-cleans between tests.
- [ ] **Local permission setup** — one of: tart VM image, or `shoki doctor` CLI. Pick in Phase 1, ship in Phase 2. Must work on developer's Mac without sudo-heavy sysadmin.
- [ ] **CI on GH Actions macOS + GetMac + self-hosted** — ships with example `.github/workflows/a11y.yml`. TCC/SIP strategy documented.
- [ ] **Keyboard command catalog** — constants exported so users can drive VO rotor via their own framework (`await page.keyboard.press('VO+Command+H')`).
- [ ] **Extensibility interfaces** — internal driver abstraction such that adding NVDA later is implementation, not rewrite.
- [ ] **npm distribution** — `@shoki/core`, `@shoki/vitest` as the first two packages.

### Add After Validation (v1.x)

- [ ] **Playwright fixture** — `@shoki/playwright` mirroring `voiceOverTest`; trigger: first five users ask for it.
- [ ] **Semantic matchers package** — `@shoki/matchers` with `toHaveAnnounced({ role, name })`; trigger: string-snapshot brittleness shows up in real use.
- [ ] **WebVTT caption export** — alongside Playwright/Vitest video artifacts; trigger: CI-failure debuggability feedback.
- [ ] **`shoki debug` bundle** — on test fail, write events.json + screenshot + VO log to `.shoki/<test>/`; trigger: first "why did this fail in CI and not locally" report.
- [ ] **Storybook integration** — design-system teams are a named audience in PROJECT.md; trigger: one component-library adopter asks.
- [ ] **Rate/verbosity advanced options** — opt-in, off the golden path; trigger: when someone has a real use case (demos? docs generation?).

### Future Consideration (v2+)

- [ ] **NVDA support** — Windows, natively or via VM runner; deferred because macOS-first is PROJECT.md's entire de-risking strategy.
- [ ] **iOS VoiceOver on XCUITest** — deferred because simulator/device permissions are a whole separate problem and the iOS audience is a differentiator bet, not a core promise.
- [ ] **Orca (Linux)** — deferred pending NVDA-on-Linux architectural question (Windows VM vs WINE vs Orca-as-substitute) called out as a known-unknown.
- [ ] **Driving VO (rotor navigation API)** — deferred because PROJECT.md explicitly scopes v1 to observe-only; revisit if users consistently find the BYO-framework-driving pattern awkward.
- [ ] **Interrupt / pause / braille source events** — deferred because the AppleScript-via-VO-scripting path may not expose these; unlock requires lower-level NSAccessibility work.
- [ ] **`shoki codegen` (record-a-test UI)** — deferred; Playwright-codegen-style but with VO running is a separate engineering project.
- [ ] **Cloud runner service** — deferred; OSS-first per PROJECT.md ambition; a paid runner is a distraction until adoption is real.
- [ ] **A11y scoring / dashboard** — PROJECT.md Out-of-Scope; leave to ecosystem integrators.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Core TS API (start/listen/log/stop) | HIGH | MEDIUM | P1 |
| macOS VO driver (Zig + capture) | HIGH | HIGH | P1 |
| Structured event stream | HIGH | HIGH | P1 |
| Vitest browser-mode integration | HIGH | MEDIUM | P1 |
| Idempotent start / safe teardown | HIGH | LOW | P1 |
| Permission setup (tart VM or `shoki doctor`) | HIGH | HIGH | P1 |
| CI examples (GH Actions / GetMac / self-hosted) | HIGH | MEDIUM | P1 |
| Keyboard command catalog (constants only) | MEDIUM | LOW | P1 |
| Muted audio + max-rate defaults | HIGH | LOW | P1 |
| Driver abstraction for future SRs | MEDIUM | MEDIUM | P1 |
| Playwright fixture | HIGH | LOW | P2 |
| Semantic matchers package | HIGH | LOW | P2 |
| WebVTT caption export | MEDIUM | MEDIUM | P2 |
| `shoki debug` failure bundle | MEDIUM | MEDIUM | P2 |
| Storybook integration | MEDIUM | LOW | P2 |
| NVDA support | HIGH | HIGH | P3 |
| iOS VoiceOver / XCUITest | HIGH | HIGH | P3 |
| Linux / Orca | MEDIUM | HIGH | P3 |
| Driving VO (rotor API) | MEDIUM | MEDIUM | P3 |
| Interrupt / pause detection | MEDIUM | HIGH | P3 |
| `shoki codegen` | MEDIUM | HIGH | P3 |

**Priority key:** P1 = v1 launch. P2 = v1.x, add after real users. P3 = v2+, deferred.

## Competitor Feature Analysis

| Feature | Guidepup (`@guidepup/guidepup`) | Guidepup Virtual | axe-playwright / Playwright aria-snapshots | Shoki (target) |
|---------|---------------------------------|------------------|-------------------------------------------|----------------|
| Real screen reader | VO / NVDA | No (simulated) | No (AX tree only) | **VO v1, NVDA v2** |
| Observe-only mode | Possible but API mixes drive+observe | API-parity with real | N/A | **First-class, the only mode** |
| Capture shape | `string[]` from `spokenPhraseLog()` | `string[]` | JSON tree / YAML snapshot | **Structured event stream (ts, source, interrupt, role, name)** |
| `listen()`-style generator | No (poll-based) | No | N/A | **Yes — `for await` over events** |
| Framework integrations | Playwright, Jest | Any (pure JS) | Playwright-only | **Vitest first, Playwright v1.x, XCUI v2** |
| Zero-config CI on GH macOS | No — manual TCC + `--ignoreTccDb` | N/A (no perms needed) | N/A | **Yes — tart VM or `shoki doctor`** |
| Idempotent `start()` | No (known bug) | Yes | N/A | **Yes** |
| Speech rate / muting | Via VO settings, implicit | N/A | N/A | **Explicit default, opt-out** |
| WebVTT / caption artifacts | No | No | No | **Yes (v1.x)** |
| Semantic matchers | No (string regex on log) | No | `toHaveAccessibleName` etc. (on tree) | **Yes (v1.x) — on real-speech events** |
| Keyboard command catalog | 226 VO + 129 Commander | Same shape | N/A | **Yes, constants only (v1)** |
| Driving the app | Yes (`click`, `type`, `press`, `act`) | Yes | N/A (Playwright does it) | **No — BYO framework** |
| iOS/macOS native app | No | No | No | **v2+** |
| Performance on Sonoma/Sequoia | Known slow (osascript polling) | Fast | Fast | **Target: faster than Guidepup via Zig** |

## Sources

**Guidepup ecosystem:**
- [Guidepup repo — screen reader driver for test automation](https://github.com/guidepup/guidepup)
- [Guidepup VoiceOver API reference](https://www.guidepup.dev/docs/api/class-voiceover)
- [Guidepup NVDA API reference](https://www.guidepup.dev/docs/api/class-nvda)
- [Guidepup real-world example](https://www.guidepup.dev/docs/example)
- [guidepup-playwright repo](https://github.com/guidepup/guidepup-playwright)
- [@guidepup/playwright on npm](https://www.npmjs.com/package/@guidepup/playwright)
- [virtual-screen-reader repo](https://github.com/guidepup/virtual-screen-reader)
- [@guidepup/setup — environment setup](https://github.com/guidepup/setup)
- [guidepup/setup-action GitHub Action](https://github.com/marketplace/actions/guidepup-setup)
- [Guidepup open issues — user pain points](https://github.com/guidepup/guidepup/issues)

**Historical / prior art:**
- [Automating Screen Reader Testing On macOS Using Auto VO — Smashing Magazine](https://www.smashingmagazine.com/2021/06/automating-screen-reader-testing-macos-autovo/)
- [A11y Testing: Automating Screen Readers — Craig Morten](https://dev.to/craigmorten/a11y-testing-automating-screenreaders-1a3n)
- [Automating Screen Readers for Accessibility Testing — Assistiv Labs](https://assistivlabs.com/articles/automating-screen-readers-for-accessibility-testing)

**Static-checker ecosystem (what Shoki is NOT):**
- [axe-core repo](https://github.com/dequelabs/axe-core)
- [Pa11y official site](https://pa11y.org/)
- [Playwright LocatorAssertions — toHaveAccessibleName, toHaveRole](https://playwright.dev/docs/api/class-locatorassertions)
- [Playwright ARIA snapshots docs](https://playwright.dev/docs/aria-snapshots)
- [Puppeteer accessibility.snapshot](https://pptr.dev/api/puppeteer.accessibility.snapshot)
- [Accessibility Testing with Playwright Assertions — DEV](https://dev.to/steady5063/accessibility-testing-with-playwright-assertions-3m3i)

**Apple native (XCUITest):**
- [UITests and accessibility tests on iOS using performAccessibilityAudit — Medium](https://medium.com/@victorcatao/uitests-and-accessibility-tests-on-ios-using-performaccessibilityaudit-df72d64cc646)
- [XCUITests for accessibility — Mobile A11y](https://mobilea11y.com/guides/xcui/)
- [Testing your app's accessibility with UI Tests — Create with Swift](https://www.createwithswift.com/testing-your-apps-accessibility-ui-tests/)

**CI / permissions context:**
- [macOS 13/14 missing TCC permission — actions/runner-images #9529](https://github.com/actions/runner-images/issues/9529)
- [Accessibility Permissions for the app deployed in macOS — actions/runner-images #1567](https://github.com/actions/runner-images/issues/1567)
- [macOS TCC internals — HackTricks](https://desecurity.github.io/hacktricks/macos-hardening/macos-security-and-privilege-escalation/macos-security-protections/macos-tcc/)

**Vitest browser mode (v1 target):**
- [Vitest Browser Mode guide](https://vitest.dev/guide/browser/)
- [@vitest/browser-playwright](https://www.npmjs.com/package/@vitest/browser-playwright)
- [Reliable Component Testing with Vitest's Browser Mode and Playwright — DEV](https://dev.to/mayashavin/reliable-component-testing-with-vitests-browser-mode-and-playwright-k9m)

**Commercial comparables:**
- [Assistiv Labs — remote AT testing](https://assistivlabs.com/)

---
*Feature research for: screen-reader automation for test frameworks and CI*
*Researched: 2026-04-17*
