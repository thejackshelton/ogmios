# Phase 8: Zig helper port + ShokiSetup.app GUI + package consolidation - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Depends on:** Phase 1-7 (all shipped; Phase 7 stays YELLOW until user grants TCC — this phase produces the GUI that makes the grant easy going forward)

<domain>
## Phase Boundary

Honor the "Zig-only" promise in PROJECT.md Key Decisions by porting the Swift helper to Zig. Add `ShokiSetup.app` — a tiny Zig-compiled GUI that triggers macOS TCC permission prompts cleanly (replacing the "System Settings → Privacy & Security → dig around" experience). Consolidate the 7 npm packages into 4 (sdk + 2 platform bindings + vitest) and move docs out of the workspace.

**Critical verification mandate:** Every piece of work in this phase MUST be verified by running the actual tool, not by source-grep. If `zig build` doesn't succeed on this Mac, the work isn't done. If `ShokiSetup.app` doesn't launch and trigger TCC prompts, the work isn't done. If package consolidation doesn't preserve test pass counts, the work isn't done.

Out of scope: Swap example repo to Qwik (Phase 9), extend to NVDA/Linux (post-v1).

</domain>

<decisions>
## Implementation Decisions

### Swift → Zig helper port

**Scope of removal:**
- `helper/Package.swift`
- `helper/Sources/ShokiRunner/main.swift`
- `helper/Sources/ShokiRunner/Info.plist` (replaced)
- `helper/Sources/ShokiRunner/ShokiRunner.entitlements` (ported to Zig build output)
- `helper/Sources/ShokiRunnerProtocol/ShokiRunnerProtocol.swift`
- `helper/Sources/ShokiRunnerService/ShokiRunnerService.swift`
- `helper/Sources/ShokiRunnerService/AXObserverSession.swift`
- `helper/Tests/ShokiRunnerTests/*.swift`
- All references to `swift build`, `swift test` in CI and scripts

**What replaces them:**
- `helper/build.zig` — builds the `ShokiRunner` executable and the `libShokiXPCClient.dylib`
- `helper/src/runner/main.zig` — app entry; installs XPC listener, pumps CFRunLoop
- `helper/src/runner/xpc_service.zig` — raw `<xpc/xpc.h>` service implementation
- `helper/src/runner/ax_observer.zig` — raw `<ApplicationServices/ApplicationServices.h>` AX observer subscription via hand-written `extern` decls
- `helper/src/client/xpc_client.zig` — the library Zig core uses to talk to the helper (replaces Swift-built libShokiXPCClient)
- `helper/test/*.zig` — round-trip + AX observer unit tests (Zig's built-in test runner)

**Hand-written extern decls** (avoid `@cImport` drift). Minimum surface:
- XPC: `xpc_connection_create`, `xpc_connection_set_event_handler`, `xpc_connection_resume`, `xpc_object_t` helpers (`xpc_dictionary_create`, `xpc_dictionary_set_int64`, `xpc_dictionary_get_string`, etc.)
- AX: `AXObserverCreate`, `AXObserverAddNotification`, `AXObserverGetRunLoopSource`, `AXUIElementCreateSystemWide`, `AXUIElementCreateApplication`, `AXUIElementCopyAttributeValue`
- CF: `CFRunLoopRun`, `CFRunLoopStop`, `CFRunLoopGetCurrent`, `CFRetain`, `CFRelease`, `CFStringGetCStringPtr`, `CFStringCreateWithCString`
- Darwin signals: `dispatch_main`, `signal(SIGTERM, ...)` for clean shutdown

**XPC wire format** — preserve the existing protocol 1:1 so Zig core doesn't change:
```
ping() -> string
startAXObserver(voicePID: int64, subscriberID: string) -> bool
stopAXObserver(subscriberID: string) -> bool
// callbacks from helper to client:
axAnnouncement(source: int64, phrase: string, role: string, name: string, ts: int64)
```

**Bundle structure** unchanged:
```
ShokiRunner.app/
├── Contents/
│   ├── Info.plist
│   ├── MacOS/ShokiRunner   (Zig-compiled Mach-O)
│   └── Resources/
```

**Signing** unchanged — `codesign` and `notarytool` don't care about source language.

### ShokiSetup.app — the GUI that makes TCC easy

**What it is:** A minimum-viable macOS `.app` bundle, Zig-compiled, whose sole purpose is to trigger Accessibility + Automation-of-VoiceOver TCC prompts cleanly on first run.

**Why it exists:** Phase 7 proved that CLI-parent TCC prompts don't fire. macOS only prompts when a bundled `.app` tries to use a protected API. Shipping `ShokiSetup.app` gives users a "double-click this once" experience instead of "follow these 4 System Settings steps."

**Architecture:**
- Single Zig binary in a `.app` bundle
- Links AppKit via externs (minimal subset: `NSApplication`, `NSAlert`, `NSOpenPanel`-style windows, or even simpler: no windows, just native `NSAlert` modal dialogs driven by the runloop)
- On launch:
  1. Probe `AXIsProcessTrustedWithOptions({ kAXTrustedCheckOptionPrompt: true })` — macOS shows the Accessibility TCC prompt if needed
  2. Wait for user acknowledgment (Accessibility granted → returns YES)
  3. Dispatch a dummy `NSAppleScript` targeting VoiceOver (e.g. `tell application "VoiceOver" to launch`) — triggers the Automation TCC prompt
  4. Verify both grants via TCC.db peek (optional — falls back to "assume granted on user confirmation")
  5. Show a native `NSAlert`: "✅ Shoki is ready. You can close this window."
  6. Quit

**UI is trivially simple:**
- Native `NSAlert` or a minimal `NSWindow` with 3 labels + 2 buttons
- No custom styling — match macOS defaults for trust
- English-only for v1; i18n is v1.1+

**Bundle location:**
- Shipped inside `@shoki/binding-darwin-arm64/helper/ShokiSetup.app` alongside `ShokiRunner.app`
- `shoki doctor` prints "Run `open node_modules/@shoki/binding-<arch>/helper/ShokiSetup.app`" if permissions are missing, OR launches it directly via `open` on `--fix`

**Entitlements:**
- `com.apple.security.automation.apple-events` (same as ShokiRunner)
- `com.apple.security.cs.allow-jit` — NOT needed (Zig is AOT)
- `com.apple.security.cs.allow-unsigned-executable-memory` — NOT needed

**Dev/CI flow:**
- Same signing scripts (`sign-and-notarize.sh`) — works for both apps
- New composite action step in `release.yml`: build+sign+notarize BOTH apps

### Package consolidation (7 → 4)

**Keep:**
- `@shoki/sdk` — core TS API. Public API entry. Absorbs:
  - `@shoki/doctor` → subpath export `@shoki/sdk/cli` + `bin: { shoki: "./dist/cli/index.js" }`
  - `@shoki/matchers` → pure assertion *functions* at `@shoki/sdk/matchers` (framework-agnostic; see below)
- `@shoki/binding-darwin-arm64` — platform binary (napi pattern, unavoidable)
- `@shoki/binding-darwin-x64` — same
- `@shoki/vitest` — Vitest plugin. Keeps its `vitest` + `@vitest/browser` peerDeps. Calls `expect.extend` using matcher functions imported from `@shoki/sdk/matchers`.

**Remove/merge:**
- `@shoki/doctor` → into `@shoki/sdk`
- `@shoki/matchers` → into `@shoki/sdk` (as `@shoki/sdk/matchers` subpath)
- `docs/` → leave as a standalone `docs/package.json` with its own install, NOT in the workspace

**Matcher refactor detail:** Separate *assertion logic* from *framework wiring*:
- `@shoki/sdk/matchers` exports pure functions `toHaveAnnounced(actual, expected): MatchResult` where `MatchResult = { pass: boolean, message: () => string, actual, expected }` (Jest-compatible shape)
- `@shoki/vitest` imports those, registers via `expect.extend({ toHaveAnnounced: (a, e) => matchers.toHaveAnnounced(a, e) })`
- Future: `@shoki/playwright` uses the same functions via Playwright's `expect.extend`
- Removes framework coupling from core. Each framework adapter is a tiny shim.

**Workspace diff:**
```diff
- packages/sdk
- packages/doctor
- packages/matchers
- packages/vitest
- packages/binding-darwin-arm64
- packages/binding-darwin-x64
- docs (workspace member)
+ packages/sdk            (includes cli + matchers as subpaths)
+ packages/vitest         (peerDep on vitest/matchers; imports @shoki/sdk/matchers)
+ packages/binding-darwin-arm64
+ packages/binding-darwin-x64
+ docs                    (standalone, not in pnpm-workspace.yaml)
```

**Workspace yaml:**
```yaml
packages:
  - "packages/*"
  - "examples/*"
# docs/ intentionally outside
```

**Migration mechanics:**
- Move `packages/doctor/src/*` → `packages/sdk/src/cli/*`
- Move `packages/matchers/src/*` → `packages/sdk/src/matchers/*`
- Delete `packages/doctor/` and `packages/matchers/` directories
- Update `packages/sdk/package.json` `exports` map to expose subpaths
- Update `packages/sdk/package.json` `bin` to point at the new CLI entry
- `@shoki/vitest` updates imports from `@shoki/matchers` → `@shoki/sdk/matchers`
- `pnpm publish -r` now publishes 4 packages instead of 7

### Verification mandate (NON-NEGOTIABLE)

Every task in this phase MUST:
- Actually run the tool (zig build, open the .app, pnpm install, pnpm test)
- Attach exit codes + output snippets to the SUMMARY
- If the executor claims something works, the claim must be backed by an exit-0 command output

If any step can't be verified on this Mac, the executor MUST:
- STOP, not fake it
- Write a BLOCKER.md with the exact repro
- Return PLAN STATUS: blocked

This is the explicit lesson from Phase 7 Wave 1's RED gate. No source-grep-as-verification.

### Claude's Discretion
- Exact Zig file layout inside `helper/src/`
- Whether `ShokiSetup.app` uses `NSAlert` or a tiny `NSWindow` (pick whichever is less code)
- Which of the 4 packages to migrate first (probably doctor → sdk first, since it's self-contained)

</decisions>

<code_context>
## Existing Code Insights

### Reusable
- `helper/scripts/build-app-bundle.sh` — keep; just invoke `zig build` instead of `swift build` internally
- `helper/scripts/sign-and-notarize.sh` — unchanged
- `helper/Sources/ShokiRunner/Info.plist` — port values verbatim to the new `helper/src/runner/Info.plist`
- `zig/build.zig` — reference for how napi-zig build graph is structured; helper's `build.zig` will be similar but building executables + dylibs instead of a `.node` addon
- `zig/src/core/subprocess.zig`, `sync.zig`, `clock.zig` — existing low-level shims we can reuse in the helper if needed

### Deletions expected
- `helper/Package.swift` and all `helper/Sources/**/*.swift`
- `helper/Tests/ShokiRunnerTests/**/*.swift`
- `packages/doctor/` and `packages/matchers/` directories after migration
- `@shoki/doctor` + `@shoki/matchers` from `packages/sdk/package.json` dependencies (they become same-package subpaths)

### Integration Points
- The Zig core's `libShokiXPCClient.dylib` linkage (Phase 7-02) MUST continue working — Zig helper builds the same-named dylib
- `@shoki/sdk`'s CLI entry point after migration: `"bin": { "shoki": "./dist/cli/index.js" }` — keep the command name stable for consumers
- The `@shoki/vitest` plugin must continue to work — its tests depend on mocking matchers; they now come from `@shoki/sdk/matchers` instead

</code_context>

<specifics>
## Specific Ideas

- `ShokiSetup.app` is the DEFAULT answer when users hit "missing permission" — `shoki doctor` SHOULD attempt to launch it directly with `open` rather than asking users to find it in node_modules
- Consider adding `shoki setup` as a CLI subcommand that wraps `open ~/.shoki/ShokiSetup.app` — lowers friction further
- Package consolidation changes user-facing install docs — getting-started/install.md and vitest-quickstart.md both need updates (people currently import from `@shoki/matchers` and `@shoki/doctor` in examples)

</specifics>

<deferred>
## Deferred Ideas

- i18n for ShokiSetup.app — v1.1 at earliest
- ShokiSetup.app for non-macOS — Linux/Windows have different permission models; each gets their own setup app later
- Auto-update check in ShokiSetup.app — out of scope; npm handles updates
- Full AppKit UI with preferences pane — keep it one-shot prompt-and-quit
- Homebrew cask shipping path — later; npm-bundled is v1's answer

</deferred>
