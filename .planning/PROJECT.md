# Shoki

## What This Is

Shoki lets you run **real** screen readers — VoiceOver, NVDA, and more to come — inside any CI environment and any test framework. It's not a test runner and not a static checker: you start a screen reader from your existing tests, capture everything it would have announced, and assert on that. Think of it as a more ambitious Guidepup with first-class CI support and dramatically better DX.

## Core Value

**A test author can start a real screen reader from their existing test framework, capture what it announces, and assert on it — locally and in CI — without becoming a sysadmin.**

If everything else fails, this must work: `voiceOver.listen()` in a Vitest browser-mode test produces a structured log of VO announcements that the test can assert against.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. Hypotheses until shipped. -->

- [ ] TypeScript API (`voiceOver.listen()` and friends) that boots and captures a real screen reader
- [ ] macOS / VoiceOver support end-to-end — the v1 platform target
- [ ] Announcements captured verbatim with source metadata (muted audio, max speech rate)
- [ ] Works in Vitest browser mode as the canonical v1 success target
- [ ] Runs on a developer's local Mac with setup that doesn't require a sysadmin
- [ ] Runs on self-hosted macOS runners and on GetMac-style GitHub Actions macOS runners
- [ ] Extensible architecture so NVDA and additional screen readers can be added later
- [ ] Zig core (0.16+) + `napi-zig` (from yuku-toolchain) for TS↔Zig N-API bindings

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Writing a test framework — BYO Vitest / Playwright / XCUITest; shoki only starts, captures, stops
- Driving the app under test (clicks, typing, rotor navigation) — user's framework does that; v1 is observe-only
- Simulating a screen reader — we always use real VO/NVDA; simulation would defeat the point
- Static a11y checks (axe-core-style rule scanning) — different category of tool
- A11y scoring / grading services — we expose what the SR said, callers decide what matters
- Linux/NVDA in v1 — macOS-first; Linux comes after the mac story is rock solid

## Context

**Problem space.** Most projects today test accessibility with static checkers (axe-core, ESLint-jsx-a11y). Static checks catch structural problems but miss how the experience *actually sounds* to a screen reader user. Running real screen readers in automated tests is hard because: (1) screen readers need OS-level permissions, (2) they announce through speakers, (3) macOS CI runners are expensive and fiddly, (4) NVDA is Windows-only. Guidepup is the closest prior art and validates the demand, but its DX and CI story leave a lot on the table.

**Who uses it.** Broad target: web devs (JS/TS, the Guidepup audience), native app devs (iOS/macOS/Android), and design system teams who want a11y regression tests on their component libraries.

**CI story.** Must work in self-hosted runners and in any GitHub Actions setup, including GetMac (a cheaper alternative to GH-hosted macOS runners that plugs into regular Actions YAML). GetMac-as-a-runner is a specific optimization target because the cost gap vs GH-hosted macOS matters for OSS adoption.

**Local dev story.** macOS permissions (Accessibility, Automation) are the hard part of running VoiceOver automated. A VM approach via **tart** is on the table for isolating permissions; a CLI tool that walks users through permission setup when a Mac is detected is also on the table. Exact approach is a known unknown — research should weigh in.

**Prior decisions with conviction.**
- Zig as the core language — chosen because OS-level integration on both macOS and Linux needs a language that can touch both worlds without switching, and Zig was the only option that fit.
- `napi-zig` (https://github.com/yuku-toolchain/napi-zig) for TS↔Zig N-API bindings — part of the yuku-toolchain org (the Yuku parser is its reference consumer). Chosen to keep a single-language stack across Mac and Linux OS-level work; perf is comparable to N-API + Rust, not demonstrably faster (earlier claim was unverified).
- Observe-only v1 — dramatically narrows scope vs Guidepup, defers VO/rotor navigation to post-v1.

**Known unknowns (for research phase).**
- NVDA-on-Linux architecture (Windows VM vs WINE vs Orca-as-substitute) — deferred; macOS-first means this doesn't block v1.
- macOS permission model — tart VM vs native-with-CLI-setup vs hybrid. Research leans toward a hybrid: `shoki doctor` CLI for local dev, pre-baked tart image for CI.
- Capture mechanism for VoiceOver announcements — AppleScript over the VO cursor (Guidepup's approach) is confirmed viable, but macOS 26.2 (CVE-2025-43530) tightened access; AX-notification-based fallback must be designed in.
- Output format — structured events (JSON) is the likely v1 bet because it unlocks semantic matchers, WebVTT replay, and interrupt detection in one design decision.
- Distribution channels for v1 — `optionalDependencies` platform npm packages (the esbuild/swc pattern) for JS users; Homebrew formula for the CLI later.
- Developer ID signing strategy — TCC is signature-based; unsigned rebuilds re-prompt for every permission. Signed wrapper-app architecture needs a Phase 1 design spike.

## Constraints

- **Tech stack**: Zig 0.16+ core, `napi-zig` (yuku-toolchain) for N-API bindings, TypeScript SDK as the primary surface — Chosen for OS-level access on Mac/Linux with a single language and clean TS interop.
- **Platform (v1)**: macOS + VoiceOver — Tackling the hardest permission/VM problem first unblocks the broader architecture.
- **API contract**: Observe-only (no app driving) — Keeps scope sharp and composes cleanly with existing frameworks.
- **CI portability**: Must run on self-hosted runners, GH Actions (Linux), and GetMac macOS in Actions — Adoption requires zero lock-in to GH-hosted macOS runners.
- **Screen reader fidelity**: We use real VO/NVDA, never a simulation — The whole premise collapses otherwise.
- **Ambition**: Serious OSS project — Months of work, quality-oriented, docs and adoption matter.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Zig as the core language | Only single-language option that can touch OS-level integration on both macOS and Linux | — Pending |
| `napi-zig` (yuku-toolchain) for TS↔Zig bindings | Single-language stack across Mac/Linux; TS API is the canonical DX surface; perf comparable to N-API+Rust | — Pending |
| Target Zig 0.16 stable | Released 2026-04-13; napi-zig's min version; earlier versions incompatible | — Pending |
| Dual capture path (AppleScript primary, AX notifications fallback) | macOS 26.2 CVE-2025-43530 tightened VO AppleScript access; need a hedge | — Pending |
| macOS + VoiceOver first | Hardest permission/VM problem — de-risk it before Linux/NVDA | — Pending |
| Observe-only v1 (no app driving) | User's existing framework drives the app; shoki composes instead of competing | — Pending |
| Vitest browser mode as the v1 success target | Concrete, measurable, covers the primary (web) audience | — Pending |
| Signed-wrapper-app (`ShokiRunner.app`) holds the TCC trust anchor | Granting TCC to Node breaks on every upgrade; a signed helper gives stable identity across Node versions and dev rebuilds | ✓ Good — implemented in Phase 1 |
| Extensible architecture for more screen readers | Future-proofs beyond VO/NVDA without refactor | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-17 after initialization*
