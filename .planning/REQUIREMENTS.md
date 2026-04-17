# Requirements: Shoki

**Defined:** 2026-04-17
**Core Value:** A test author can start a real screen reader from their existing test framework, capture what it announces, and assert on it — locally and in CI — without becoming a sysadmin.

## v1 Requirements

Requirements for the initial macOS + VoiceOver release. Each maps to a roadmap phase.

### Foundation

- [ ] **FOUND-01**: Zig 0.16.0+ core compiles to a platform-specific N-API `.node` addon via napi-zig
- [x] **FOUND-02**: `@shoki/sdk` npm package loads the native addon via `optionalDependencies` platform packages (`@shoki/binding-darwin-arm64`, `@shoki/binding-darwin-x64`)
- [ ] **FOUND-03**: Release binaries are Apple Developer ID-signed from the first publish — no unsigned binaries shipped
- [ ] **FOUND-04**: Signed-wrapper-app architecture decided and documented (which process holds the stable TCC trust anchor)
- [ ] **FOUND-05**: CI pipeline publishes a prebuilt binding for darwin-arm64 + darwin-x64 on every release via OIDC trusted publishing

### Permission Setup

- [ ] **PERM-01**: `shoki doctor` CLI diagnoses VoiceOver-AppleScript-enabled state on macOS 14, 15, and 26
- [ ] **PERM-02**: `shoki doctor` detects Accessibility and Automation TCC grants for the shoki trust anchor
- [ ] **PERM-03**: `shoki doctor` detects and reports stale/orphaned TCC entries
- [ ] **PERM-04**: `shoki doctor --fix` applies the VO AppleScript-enabled plist write when SIP permits, with clear messaging when it doesn't
- [ ] **PERM-05**: `shoki doctor` emits deep links to the correct System Settings panes when manual grants are required
- [ ] **PERM-06**: CLI exits non-zero with actionable error codes when shoki cannot run on this machine

### VoiceOver Capture Core

- [ ] **CAP-01**: `voiceOver.start({ speechRate, mute, takeOverExisting, timeout, logBufferSize })` boots VoiceOver deterministically and is idempotent across reentrant calls
- [ ] **CAP-02**: VoiceOver default plist (9 keys: mute, speech rate, punctuation, hints, verbosity, voice, etc.) is snapshotted at start and restored at stop
- [ ] **CAP-03**: VoiceOver is force-killed on stop with `pgrep -x VoiceOver` verification; ghost processes never survive a clean test run
- [ ] **CAP-04**: Announcements are captured via AppleScript `content of last phrase` polled at 50ms cadence inside the Zig core (not from JS)
- [ ] **CAP-05**: A parallel AX-notifications capture path (`AXObserverAddNotification` + `kAXAnnouncementRequestedNotification`) is implemented alongside the AppleScript path as a macOS 26+ hedge
- [ ] **CAP-06**: Captured events are emitted as structured records: `{ phrase, ts, source ("applescript" | "ax"), interrupt?, role?, name? }`
- [ ] **CAP-07**: A bounded ring buffer (default 10k entries) exposes a `droppedCount` counter to TS; overflow is observable, not silent
- [ ] **CAP-08**: `voiceOver.listen()` returns an async iterator of structured events streamed from the ring buffer
- [ ] **CAP-09**: `voiceOver.phraseLog()` returns the full flat phrase history as `string[]` (Guidepup-compat convenience)
- [ ] **CAP-10**: `voiceOver.lastPhrase()` returns the most recent phrase
- [ ] **CAP-11**: `voiceOver.clear()` empties the log without restarting VO
- [ ] **CAP-12**: `voiceOver.reset()` returns VO to a known state between tests without a full restart
- [ ] **CAP-13**: `voiceOver.awaitStableLog({ quietMs })` resolves when no new events have arrived for the given window
- [ ] **CAP-14**: Process exit hooks (`exit`, `uncaughtException`, `unhandledRejection`, `SIGINT`, `SIGTERM`) restore plist settings even on crash
- [ ] **CAP-15**: Binary wire format between Zig and TS is versioned and documented; format is frozen before the first driver ships
- [ ] **CAP-16**: Keyboard command catalog (226 VO gestures + 129 Commander commands) exported as TS constants — users dispatch them via their own framework's keyboard driver

### Vitest Browser-Mode Integration

- [ ] **VITEST-01**: `@shoki/vitest` plugin registers `shokiListen`, `shokiDrain`, `shokiStop`, `shokiClear`, `shokiReset` as Vitest `BrowserCommand`s
- [ ] **VITEST-02**: Browser-side helpers (`@shoki/vitest/browser`) wrap the `BrowserCommand`s in a typed API so tests never import Node-only modules
- [ ] **VITEST-03**: Plugin auto-configures `poolOptions.threads.singleThread = true` when VoiceOver is in scope
- [ ] **VITEST-04**: Runtime error is raised with an actionable message when `test.concurrent` is used in a VO-scoped test
- [ ] **VITEST-05**: Concurrent `voiceOver.start()` calls across test files refcount; first boots, last kills; per-test `reset()` is used between tests
- [ ] **VITEST-06**: Return payloads from Vitest `BrowserCommand`s are structured-clone-safe (plain objects, numeric timestamps)
- [ ] **VITEST-07**: A canonical example repo (Vitest browser mode + real web app) runs green locally and produces a structured VO event log assertable with a semantic matcher
- [ ] **VITEST-08**: `@shoki/matchers` package provides `toHaveAnnounced({ role, name })` and `toHaveAnnouncedText(pattern)` matchers on top of the event stream

### CI Story

- [ ] **CI-01**: A reference pre-baked tart macOS image (`ghcr.io/shoki/macos-vo-ready:<macos>`) is published with VO-AppleScript-enabled + required TCC grants pre-applied
- [ ] **CI-02**: The tart image is reproducibly built with Packer + Ansible; build scripts live in the shoki repo
- [ ] **CI-03**: `shoki/setup-action` GitHub Action prepares a runner for a shoki test — works on self-hosted tart runners, Cirrus Runners, GetMac, and stock GH-hosted `macos-latest`
- [ ] **CI-04**: Reference `.github/workflows/` examples exist for each supported CI topology
- [ ] **CI-05**: Pre/post-job hooks kill background apps (Slack, Discord, Teams, Mail, Calendar) so their announcements don't leak into captures
- [ ] **CI-06**: Example repos from Vitest phase run identically green on a developer's Mac, GH-hosted `macos-latest`, and a self-hosted tart-VM runner

### Observability & Docs

- [ ] **DOCS-01**: Documentation site covers: install, permission setup, Vitest quickstart, CI setup per provider, API reference, and troubleshooting
- [ ] **DOCS-02**: Platform-risk page documents CVE-2025-43530, Apple's tightening trajectory, and shoki's AX-notifications fallback
- [ ] **DOCS-03**: The `@shoki/matchers` usage section shows how to assert on structured event logs semantically
- [ ] **DOCS-04**: Migration-from-Guidepup page describes API differences and a concrete side-by-side example

### Extensibility

- [ ] **EXT-01**: Driver interface (`ShokiDriver` vtable in Zig, `ScreenReaderHandle` in TS) is factored so adding a second screen reader requires only one new `src/drivers/<name>/driver.zig`, one registry entry, and one new platform binding package — no changes to core, SDK, or wire format

## v2 Requirements

Deferred to future releases. Tracked but not in v1 roadmap.

### Hardening & Polish

- **HARD-01**: Debug bundle on test failure — `.shoki/<test>/events.json` + screenshot + `voiceover.log`
- **HARD-02**: WebVTT caption track output synced to Playwright video artifacts
- **HARD-03**: Flake classification system — tags runs with "VO restart detected", "long silence gap", "overwrite dropped" indicators
- **HARD-04**: Health-check-before-test — emits a known announcement, verifies capture, fails fast if VO is dead at session start
- **HARD-05**: `@shoki/playwright` fixture mirroring Guidepup's shape, observe-only
- **HARD-06**: Storybook integration example (design-system audience)

### Second Screen Reader

- **SR2-01**: Second driver implemented (NVDA on Windows OR iOS VoiceOver via XCUITest) to validate the extensibility abstraction
- **SR2-02**: Any `ShokiDriver` interface adjustments forced by the second driver are incorporated without breaking the v1 API

### Additional Platforms (future)

- **PLAT-01**: NVDA on Windows — UI Automation + NVDA controller client
- **PLAT-02**: Orca on Linux — AT-SPI2 integration
- **PLAT-03**: iOS VoiceOver via XCUITest IPC shim
- **PLAT-04**: Android TalkBack

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Running tests | Shoki is not a test framework — BYO Vitest/Playwright/XCUITest |
| Driving the app (clicks, typing, rotor nav) | User's existing framework drives; shoki is observe-only in v1 |
| Simulating a screen reader | We always use real VoiceOver/NVDA; simulation defeats the point |
| Static a11y rule scanning (axe-core-style) | Different category of tool; composable alongside but out of scope |
| A11y scoring / grading dashboards | We expose what the SR said; callers decide what matters |
| Record-a-test codegen UI | No evidence users want this before we ship the primitives |
| Private-framework VO capture (`AXSpeechSynthesizer` etc.) | Fragile across macOS versions, App Store denial surface |
| Audio-capture + ASR for announcements | Disproportionate dependency weight for marginal fidelity gain |
| Notarization of the `.node` addon in v1 | npm-distributed `.node` binaries inherit trust from Node itself |
| NVDA / Orca / iOS / Android in v1 | macOS-first; other platforms land in v2+ |
| Configurable verbosity knobs at test level | Default is muted + max-rate, opinionated; opt-out only |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1: Foundations | Pending |
| FOUND-02 | Phase 1: Foundations | Complete |
| FOUND-03 | Phase 1: Foundations | Pending |
| FOUND-04 | Phase 1: Foundations | Pending |
| FOUND-05 | Phase 1: Foundations | Pending |
| EXT-01   | Phase 1: Foundations | Pending |
| PERM-01  | Phase 2: Permission Setup & Doctor CLI | Pending |
| PERM-02  | Phase 2: Permission Setup & Doctor CLI | Pending |
| PERM-03  | Phase 2: Permission Setup & Doctor CLI | Pending |
| PERM-04  | Phase 2: Permission Setup & Doctor CLI | Pending |
| PERM-05  | Phase 2: Permission Setup & Doctor CLI | Pending |
| PERM-06  | Phase 2: Permission Setup & Doctor CLI | Pending |
| CAP-01   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-02   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-03   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-04   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-05   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-06   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-07   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-08   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-09   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-10   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-11   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-12   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-13   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-14   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-15   | Phase 3: VoiceOver Capture Core | Pending |
| CAP-16   | Phase 3: VoiceOver Capture Core | Pending |
| VITEST-01 | Phase 4: Vitest Browser-Mode Integration | Pending |
| VITEST-02 | Phase 4: Vitest Browser-Mode Integration | Pending |
| VITEST-03 | Phase 4: Vitest Browser-Mode Integration | Pending |
| VITEST-04 | Phase 4: Vitest Browser-Mode Integration | Pending |
| VITEST-05 | Phase 4: Vitest Browser-Mode Integration | Pending |
| VITEST-06 | Phase 4: Vitest Browser-Mode Integration | Pending |
| VITEST-07 | Phase 4: Vitest Browser-Mode Integration | Pending |
| VITEST-08 | Phase 4: Vitest Browser-Mode Integration | Pending |
| CI-01    | Phase 5: CI Story | Pending |
| CI-02    | Phase 5: CI Story | Pending |
| CI-03    | Phase 5: CI Story | Pending |
| CI-04    | Phase 5: CI Story | Pending |
| CI-05    | Phase 5: CI Story | Pending |
| CI-06    | Phase 5: CI Story | Pending |
| DOCS-01  | Phase 6: Docs & v1 Release Polish | Pending |
| DOCS-02  | Phase 6: Docs & v1 Release Polish | Pending |
| DOCS-03  | Phase 6: Docs & v1 Release Polish | Pending |
| DOCS-04  | Phase 6: Docs & v1 Release Polish | Pending |

**Coverage:**
- v1 requirements: **46 total** (corrected from initial header miscount of 42 — 5 FOUND + 6 PERM + 16 CAP + 8 VITEST + 6 CI + 4 DOCS + 1 EXT = 46)
- Mapped to phases: **46 / 46** (100% coverage)
- Unmapped: **0**
- Orphans: **none**
- Duplicates: **none** (every REQ-ID assigned to exactly one phase)

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 — traceability populated by roadmapper, v1 count corrected (42 → 46)*
