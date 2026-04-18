---
phase: 08-zig-helper-port-shokisetup-app-gui-package-consolidation
plan: 03
status: completed
gate: self-test-green-manual-trigger-deferred
date: 2026-04-17
---

# Plan 08-03 Summary: ShokiSetup.app GUI

**Status:** completed (self-test green; manual dialog verification deferred — user in autonomous loop mode, not physically at keyboard)
**Commit:** `8b274f6`

## What Shipped

- `helper/src/setup/appkit_bindings.zig` (~170 lines) — hand-written C externs for the minimum AppKit / Obj-C runtime surface (NSApplication, NSAlert, NSAppleScript, AXIsProcessTrustedWithOptions, objc_msgSend typed variants, sel_registerName, NSAutoreleasePool)
- `helper/src/setup/setup_main.zig` (~260 lines) — app entry, argv parsing (`--version`, `--self-test`, `--quit-immediately`, `--bogus → exit 2`), two-prompt TCC flow (Accessibility via AXIsProcessTrustedWithOptions, Automation via NSAppleScript `tell VoiceOver`), final "Shoki is ready" NSAlert
- `helper/src/setup/Info.plist` — `CFBundleIdentifier=org.shoki.setup`, LSUIElement=false, both usage descriptions
- `helper/src/setup/ShokiSetup.entitlements` — byte-identical to ShokiRunner (reuses `com.apple.security.automation.apple-events`)
- `helper/test/setup_bindings_test.zig` — 6 tests validating class lookups, selector registration, argv parsing
- `helper/build.zig` — second executable target; links AppKit + Foundation + ApplicationServices + libobjc; test_mod gets the frameworks too
- `helper/all_tests.zig` — imports setup tests into the aggregate runner

## Runtime Verification (automated — all green)

| # | Command | Exit | Evidence |
|---|---------|------|----------|
| V1 | `ShokiSetup --version` | 0 | prints `ShokiSetup 0.1.0 (zig-compiled)` |
| V2 | `ShokiSetup --self-test` | 0 | 0.012s — all AppKit class lookups succeed |
| V3 | `ShokiSetup --bogus` | 2 | stderr: `ShokiSetup: unknown flag '--bogus'` |
| V4 | `ShokiRunner --version` | 0 | No regression from adding second target |
| V5 | `plutil -lint Info.plist` | 0 | OK |
| V6 | `codesign --deep -s - ShokiSetup.app` | 0 | bundle well-formed |
| V7 | `open -W -n ShokiSetup.app --args --self-test` | 0 | 0.28s via LaunchServices |
| V8 | `zig build test` | 0 | 17/17 tests pass (11 prior + 6 new) |
| V9 | `zig build` (both exes in one invocation) | 0 | 9/9 steps succeed |

## Expected UX (manual verification deferred)

Double-clicking `ShokiSetup.app`:
1. App launches, appears in Dock (LSUIElement=false)
2. `AXIsProcessTrustedWithOptions({kAXTrustedCheckOptionPrompt: YES})` → macOS Accessibility TCC prompt with our usage description
3. VoiceOver launches (3s pause)
4. `tell VoiceOver to get bounds of vo cursor` → macOS Automation TCC prompt for VoiceOver control
5. Success NSAlert: "Shoki is ready" — one "Close" button
6. VoiceOver quits + app terminates

**Manual verification protocol** (when user is physically present):
```bash
# Optional: revoke prior grants to force prompts to re-fire
sudo tccutil reset Accessibility org.shoki.setup
sudo tccutil reset AppleEvents org.shoki.setup

open helper/.build/ShokiSetup.app
# Expected: two TCC dialogs + final "ready" alert in ~5 seconds
```

## Gate

**self-test-green-manual-trigger-deferred** — everything automatable passes (9/9 runtime gates, 17/17 tests). The dialog-appearing behavior is a kernel event with no programmatic assertion surface; user will manually verify when next at keyboard. Acceptable per CONTEXT.md's "interactive verification requires user action" clause.

## Deferred to Plan 08-04 (CI integration)

- `shoki setup` CLI subcommand in `packages/sdk/src/cli/` that invokes `open` on the bundled app
- `shoki doctor --fix` `LAUNCH_SETUP_APP` fix-action class
- `packages/binding-darwin-*/package.json` `files` array updates to include `helper/ShokiSetup.app/**`
- `release.yml` updates to sign + notarize both apps

These were out of scope for 08-03 per the original PLAN.md (which defines only the Zig app + tests). They align with 08-04's CI integration scope.

## Files (absolute)

- `/Users/jackshelton/dev/open-source/shoki/helper/src/setup/appkit_bindings.zig`
- `/Users/jackshelton/dev/open-source/shoki/helper/src/setup/setup_main.zig`
- `/Users/jackshelton/dev/open-source/shoki/helper/src/setup/Info.plist`
- `/Users/jackshelton/dev/open-source/shoki/helper/src/setup/ShokiSetup.entitlements`
- `/Users/jackshelton/dev/open-source/shoki/helper/test/setup_bindings_test.zig`
- `/Users/jackshelton/dev/open-source/shoki/helper/.build/ShokiSetup.app` (built artifact — not in git)
