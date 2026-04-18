---
layout: home

hero:
  name: Ogmios
  text: Real screen readers in your tests.
  tagline: Ogmios — the Gaulish god of eloquence, who bound his listeners with chains of gold from his tongue to their ears. Run VoiceOver (and later NVDA, Orca) from any test framework. Capture announcements as structured events. Assert semantically. Locally and in CI.
  image:
    src: /ear.png
    alt: Ogmios — a dotwork illustration of a human ear in coral on deep navy
  actions:
    - theme: brand
      text: Get started
      link: /getting-started/install
    - theme: alt
      text: View on GitHub
      link: https://github.com/thejackshelton/ogmios

features:
  - icon: 🦻
    title: Real screen readers, no simulation
    details: Boot actual VoiceOver from your Vitest test, capture what it would have spoken, assert against it. No audio-capture hacks, no static checkers.
  - icon: 🧪
    title: Observe-only by design
    details: Ogmios never clicks, types, or navigates. Your Playwright / XCUITest / framework drives the app; Ogmios captures what the screen reader says about it.
  - icon: 🔒
    title: Stable TCC trust anchor
    details: Signed Zig-compiled helper app holds the Accessibility + Automation grants. TCC doesn't break every time Node updates. One-click GUI setup (OgmiosSetup.app) triggers first-run prompts.
  - icon: 🏗️
    title: CI-first
    details: Four reference topologies — self-hosted tart, Cirrus Runners, GetMac, stock macos-latest. Pre-baked tart images with VoiceOver-AppleScript-enabled and permissions granted.
  - icon: 📦
    title: Structured events, not string[]
    details: Every announcement is `{ phrase, ts, source, role?, name?, interrupt? }`. Semantic matchers (`toHaveAnnounced({ role, name })`) build on top.
  - icon: 🔭
    title: Honest about platform risk
    details: VoiceOver AppleScript access is narrowing (CVE-2025-43530). We ship a parallel AX-notifications capture path as a hedge. See Platform risk for the full story.
---

## Quick install

```bash
pnpm add -D ogmios
npx ogmios doctor
# If TCC is missing, one-click setup via the bundled GUI:
npx ogmios setup
```

Then follow the [Vitest quickstart](/getting-started/vitest-quickstart) — a complete working test in under 5 minutes.

## What is Ogmios?

**Ogmios** — the Gaulish god of eloquence.

The Greek satirist Lucian of Samosata described a statue of Ogmios in 2nd-century
Gaul: an old man with chains of gold and amber running from his tongue to the ears
of his followers, who trailed behind him willingly, pulled by his words. Lucian's
Gaulish host explained that in Celtic tradition, wisdom and persuasion are greater
in age than in youth — so the god of speech is painted as an elder.

The library is that chain. It captures the speech traveling from the screen reader
— the tongue — to the test — the ear — so you can assert on every word.

Ogmios is a Zig-core + TypeScript-SDK library that lets any test framework start a **real** screen reader, capture its announcements as structured events, and assert on them — locally on a developer's Mac and in CI on multiple macOS runner topologies.

**Core value:** A test author can start a real screen reader from their existing test framework, capture what it announces, and assert on it — locally and in CI — without becoming a sysadmin.

Think of it as a more ambitious [Guidepup](https://github.com/guidepup/guidepup) with first-class CI support and dramatically better DX. If you already use Guidepup, see the [migration guide](/guides/migration-from-guidepup).

## Why?

Most accessibility tests today use static rule checkers (axe-core, ESLint-jsx-a11y). They catch structural problems but miss how the experience _actually sounds_ to a screen reader user. Running real screen readers in automated tests has historically been hard because:

- Screen readers need OS-level permissions.
- They announce through speakers.
- macOS CI runners are expensive and fiddly.
- NVDA is Windows-only.

Ogmios solves those piece by piece — one signed helper, one dual-path capture, one set of CI workflows.

## Status

**Pre-alpha.** v1 targets macOS + VoiceOver + Vitest browser mode. The docs you're reading are the same docs we use to keep ourselves honest about what ships and what doesn't.

See the [architecture](/background/architecture) page for the full load-bearing design, and the [platform risk](/background/platform-risk) page for an open discussion of the risks we've taken on.

## License

[MIT](https://github.com/thejackshelton/ogmios/blob/main/LICENSE)
