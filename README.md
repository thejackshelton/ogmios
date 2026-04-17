# Shoki

> Run real screen readers — VoiceOver, NVDA, and more — in any test framework and any CI environment.

**Status:** 🚧 Early development. v1 targets macOS + VoiceOver + Vitest browser mode. Not ready for production use.

## What is this?

Shoki lets you start a **real** screen reader from your existing test framework, capture everything it would have announced, and assert on that log. No simulators, no static checkers — the actual VoiceOver (and later NVDA, Orca) speaking through a test.

Think of it as a more ambitious [Guidepup](https://github.com/guidepup/guidepup) with first-class CI support and dramatically better DX.

### Why?

Most accessibility tests today use static rule checkers (axe-core, ESLint-jsx-a11y). They catch structural problems but miss how the experience *actually sounds* to a screen reader user. Running real screen readers in automated tests has historically been hard because:

- Screen readers need OS-level permissions.
- They announce through speakers.
- macOS CI runners are expensive and fiddly.
- NVDA is Windows-only.

Shoki solves those piece by piece.

## Core value

**A test author can start a real screen reader from their existing test framework, capture what it announces, and assert on it — locally and in CI — without becoming a sysadmin.**

## Architecture (brief)

```
┌──────────────────────┐
│   Your test          │   (Vitest, Playwright, XCUITest — whatever)
│   voiceOver.listen() │
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│   @shoki/sdk (TS)    │   Public API surface
└──────────┬───────────┘
           │ N-API
┌──────────▼───────────┐
│   shoki.node (Zig)   │   Native core — 50ms VO poll loop, ring buffer, wire format
└──────────┬───────────┘
           │ XPC
┌──────────▼───────────┐
│   ShokiRunner.app    │   Signed helper — holds the stable TCC trust anchor
│   (Swift)            │
└──────────┬───────────┘
           │ AppleScript + AX notifications
┌──────────▼───────────┐
│   VoiceOver          │
└──────────────────────┘
```

See [`docs/architecture.md`](docs/architecture.md) for the full story (signed-wrapper-app rationale, wire format spec, driver extensibility).

## Not yet

Shoki is pre-alpha. The v1 roadmap:

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundations | In progress |
| 2 | Permission Setup & Doctor CLI | Not started |
| 3 | VoiceOver Capture Core | Not started |
| 4 | Vitest Browser-Mode Integration | Not started |
| 5 | CI Story | Not started |
| 6 | Docs & v1 Release Polish | Not started |

See `.planning/ROADMAP.md` for specifics.

## Getting involved

Shoki is MIT-licensed and we welcome contributors. If you want to help add a new screen reader driver, see [`docs/adding-a-driver.md`](docs/adding-a-driver.md).

For questions and design discussions, open an issue.

## License

[MIT](LICENSE)
