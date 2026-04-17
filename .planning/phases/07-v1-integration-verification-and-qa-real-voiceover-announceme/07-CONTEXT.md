# Phase 7: v1 Integration Verification & QA - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Why this phase exists:** Phases 1-6 shipped scaffolded code verified only by source-grep + TS unit tests with mocked native bindings. Nothing was end-to-end verified against a real Zig build, a real signed helper, or a real VoiceOver session. This phase closes that gap — the claim "v1 works" must be backed by an actually-run test, not YAML that's never been triggered.

<domain>
## Phase Boundary

Claude acts as a manual QA engineer for the shoki v1 stack. The goal is to autonomously prove — without asking the user to click anything — that a Vitest browser-mode test can start real VoiceOver, navigate a real DOM, capture actual announcements from the rendered page content, and cleanly restore the developer's prior VO settings afterward.

Out of scope: post-v1 hardening (HARD-*), second-driver implementation (SR2-*), CI secrets provisioning (that requires the human maintainer — we can only validate locally).

</domain>

<decisions>
## Implementation Decisions

### Autonomous verification mandate
The user has stated: **act as a manual QA checker, autonomously, without me manually making sure it works.** This means:
- Install missing tools (Zig 0.16, Playwright browsers) without asking
- Build the helper, Zig binding, all packages
- Grant TCC permissions to the helper app programmatically if possible; if not possible without user interaction, clearly document the one-time manual grant step and make the test work around it (e.g. `sudo` where legitimately required, or make the verification path use an already-granted process like the user's terminal as the TCC anchor instead of the Dev-ID-less local helper build)
- Run the real end-to-end Vitest + VoiceOver test and report pass/fail

If any step genuinely cannot be automated, it must be called out as a blocker with an exact command the user can run — not hidden in a SUMMARY footnote.

### "Actual DOM content, not Chrome URL bar" requirement
**This is the most important functional requirement.** When Vitest browser-mode opens Chromium via Playwright, VoiceOver — left to itself — will announce the URL bar, tab title, window chrome, and anything else it can see on screen. We need to ensure that what shoki *captures* is the announcements from DOM content the test is actually exercising, not incidental chrome noise.

Options to enforce this:
1. **Scope the capture to announcements originating from the browser viewport only** — inspect AX notification source, filter by `AXParent`/`AXWindow` matching the tab content area (not the chrome).
2. **Route AX notifications only for the browser's web content process**, not the parent Chrome process — NSAccessibility gives us the process-id for each notification, we can filter.
3. **Explicitly focus the app content before capture starts** and include that in the test setup.
4. **AppleScript path already filters to VO's "last phrase"** which is whatever VO cursor is on — if the test first `Tab`s to a control in the page before asserting, VO's cursor is in the page and announcements are page-content.

Probable answer: combination of (2) filter by pid, (3) focus the content area before capture, and (4) document the pattern in the matchers guide. This phase must verify the filter works — write a test where the URL bar contents could be announced (e.g. URL contains "example.com") and assert that string does NOT appear in the log unless it also appears in the DOM.

### Settings restore is non-negotiable
The user emphasized: **VO settings MUST be restored to whatever they had before — sound level and playback speed specifically, plus the full 9-key plist snapshot from Phase 3**. Failure to restore = we break the user's Mac's accessibility. This is already implemented in Phase 3 (`storeOriginalSettings → configureSettings → restoreSettings` + process-exit hooks for SIGINT/SIGTERM/uncaughtException), but **this phase must verify it works**: run a test that reads the plist values before start, runs a session, crashes the session (SIGKILL the child), and asserts every plist value is back to its pre-test state.

Additional safety: if settings-restore fails for any reason, the `shoki` CLI should expose `shoki restore-vo-settings` as an escape hatch for users who end up stuck with a muted Mac. Ship this in this phase.

### API reshape question: `listen()` vs `start()`/`end()`
The user is uncertain whether the current `voiceOver.listen()` API is right. Their proposal: `voiceOver.start()` + `voiceOver.end()` as explicit lifecycle markers per test.

Analysis:
- **Current state (Phase 3+4):** `voiceOver.start(opts)` boots VO and returns a handle; `handle.listen()` is an async generator; `handle.stop()` shuts down. Plus `handle.reset()` for per-test cleanup without full restart.
- **User's concern:** auto-reset-per-test (implied by `listen()` semantics) seems inefficient.
- **Proposal interpreted:** explicit `voiceOver.start()` at test-file (or suite) setup → `voiceOver.end()` at test-file teardown. Between tests, use `handle.reset()` (cheap — clears log + resets VO cursor, doesn't restart VO).

**Decision:** KEEP the current `start`/`stop`/`listen` API shape — `listen()` is valuable as an async-generator view; it's NOT the primary lifecycle verb. But RENAME `stop()` → `end()` for symmetry with `start()` in the TS SDK to match the user's intuition. Add a top-level convenience: `voiceOver.start(opts)` and `voiceOver.end()` that manage a singleton default handle for the common case (one VO session per test file). Document the pattern clearly: "boot in `beforeAll`, tear down in `afterAll`, reset between tests."

Also verify: `reset()` is genuinely cheap (doesn't spawn `osascript` again, just clears ring buffer + resets VO cursor). If not, make it cheap.

### Verification checklist (what must pass)
This phase succeeds when ALL of the following are TRUE:

1. `brew install zig@0.16` (or equivalent) succeeds and `zig --version` reports 0.16.x
2. `zig build` in `zig/` produces `libshoki.dylib` without errors
3. `zig build test` passes all Zig unit tests (ring buffer, wire, noop, lifecycle, driver, plist, etc.)
4. `swift build` + `swift test` in `helper/` succeeds for ShokiRunner
5. The helper `.app` bundle builds via `helper/scripts/build-app-bundle.sh`
6. `libShokiXPCClient.dylib` is built and linked via `zig/build.zig`
7. The `.node` file is installed into `packages/binding-darwin-arm64/` and `require()` loads it
8. `SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test` passes — noop round-trip + ping are green
9. `npx playwright install chromium` succeeds
10. `pnpm --filter @shoki/matchers test` + `pnpm --filter @shoki/vitest test` green
11. `pnpm --filter docs build` succeeds — VitePress site compiles
12. TCC grants — either the helper gets Developer ID signed locally (ad-hoc signing OK if Dev ID unavailable) OR the verification path uses the user's terminal as the TCC anchor (already granted). Document which path is taken.
13. `pnpm --filter vitest-browser-react-example test` runs against **real VoiceOver** — not mocked — and asserts:
    - `toHaveAnnounced({ role: 'button', name: 'Submit' })` passes
    - The log contains text that matches rendered DOM content (e.g. the button label)
    - The log does NOT contain Chrome chrome strings (URL bar contents, tab title, address-bar autofill suggestions)
14. After the test suite completes (or crashes via SIGKILL), VO is not running AND all 9 plist keys are restored to pre-test values (verify via `defaults read` diff)
15. `shoki restore-vo-settings` CLI command works as an escape hatch

### Allowed deviations
- If Zig `@cImport` of ApplicationServices headers doesn't work on Zig 0.16 (PITFALLS.md #10), FIX IT in this phase — don't defer. The most likely fix is hand-writing `extern` declarations instead of relying on translate-c.
- If `realAppleScriptSpawner` is a stub in Phase 3 (it is), IMPLEMENT IT in this phase using `std.process.Child`. This is a blocker to #13.
- If the AX observer XPC path doesn't actually work, FIX IT or document the exact delta.
- If the AppleScript content-filter problem (#13's "chrome URL bar" concern) requires architectural changes to Phase 3's capture pipeline, MAKE THEM. Update the affected SUMMARY + PLAN files to reflect the real implementation.

### User action checklist (what we CAN'T do)
Clearly enumerate any step that truly requires human action at the end:
- Granting Accessibility permission in System Settings (if ad-hoc signing path fails and Dev ID isn't available) — document the exact path + screenshot location
- Provisioning Apple Developer ID certificate for first release (not needed for local verification)
- Running CI with repo secrets (not part of this phase)

### Claude's Discretion
- Exact test fixtures in the example repo (add more if needed to exercise the DOM-content filter)
- Whether to use `ad-hoc codesign` locally vs dev-cert-based signing for the helper during QA
- Report format (structured MD + pass/fail checkboxes preferred)

</decisions>

<code_context>
## Existing Code Insights

### What's scaffolded but unverified
- All Zig source under `zig/src/` (verified by source-grep only)
- Swift helper under `helper/` (XPC ping had `swift test` green; new AX observer code is unverified)
- `libShokiXPCClient.dylib` link path in `zig/build.zig` is a placeholder
- `realAppleScriptSpawner` in Phase 3 is a stub returning `error.RealSpawnerNotYetImplemented`
- All CI YAML in `.github/workflows/` never triggered
- tart image pipeline in `infra/tart/` never executed
- VitePress docs site `pnpm --filter docs build` never run

### Known stubs / gaps flagged in prior SUMMARYs
- Phase 3 SUMMARY § Known Gaps: `realAppleScriptSpawner`, `__debugInjectEvents` N-API hook, signal-delivery unit test elided
- Phase 4 SUMMARY: VO-dependent integration test never run
- Phase 5 SUMMARY: `skip-doctor: true` flag on setup-action used in Phase 1+2 CI flows (hack)
- Phase 6 SUMMARY: docs site never built

### Integration Points to Verify
- Zig core ↔ N-API ↔ TS SDK (the noop round-trip)
- Zig core ↔ XPC ↔ Swift helper ↔ AX observer (the real VO path)
- @shoki/sdk ↔ @shoki/vitest plugin ↔ browser test ↔ voiceOver.start()/end()
- Vitest browser-mode (Node orchestrator) ↔ Playwright-launched Chromium ↔ DOM content ↔ VoiceOver announcement pipeline

</code_context>

<specifics>
## Specific Ideas

- The DOM-content-vs-URL-bar test is the most important assertion this phase produces. A test that passes only because VO said "example.com" (from the URL bar) is FALSE PASS and must be detected.
- `shoki restore-vo-settings` as an escape hatch is a trust-building feature — users who experiment with shoki on their main Mac should know they have a safety net.
- The "QA report" output should be copy-paste-able into a GitHub issue if something breaks, so future users hit the same roadblock have a runbook.

</specifics>

<deferred>
## Deferred Ideas

- **CI verification of this phase's tests** — goes in the post-v1 hardening phase, not here; we're validating local-only
- **Multiple example repos** — just the one Vitest+React example; Playwright-native is v1.1+
- **Performance benchmarking** — whether we meet Phase 3's 50ms poll target under load; flag but don't fix
- **Automated TCC signature-match fix in `shoki doctor`** — out of scope for this phase
- **Windows/Linux variants of this QA playbook** — v1 is macOS-only

</deferred>
