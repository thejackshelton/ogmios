# Phase 3: VoiceOver Capture Core - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Mode:** Auto (decisions from research + PROJECT.md + prior-phase artifacts)

<domain>
## Phase Boundary

Implement the VoiceOver driver in Zig: AppleScript-based capture, AX-notifications-based parallel capture, plist snapshot/restore, force-kill lifecycle, ring-buffer drain loop, full TS API surface (`start/stop/listen/phraseLog/lastPhrase/clear/reset/awaitStableLog`), and keyboard command catalog. Noop driver from Phase 1 remains for tests; this phase makes `voiceOver()` factory point at the real driver.

Out of this phase: Vitest integration (Phase 4), CI/tart image (Phase 5), docs polish (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Capture Architecture — Dual Path, Single Stream
- Both AppleScript polling AND AX notifications capture run **simultaneously** when `voiceOver.start()` is called.
- Each event carries `source: "applescript" | "ax"` so downstream code can filter/dedup.
- Default `listen()` yields BOTH sources; filtering is a consumer concern (matchers package in Phase 4 adds convenience).
- **Why both at once:** CVE-2025-43530 means AppleScript may fail silently on 26.2+; AX notifications keep working. Running both also validates that the event shapes match.

### AppleScript Polling
- **Cadence:** 50ms poll loop inside the Zig core (native thread). NOT in JS.
- **Mechanism:** spawn `osascript` with `tell application "VoiceOver" to return content of last phrase`, wrapped in a `with transaction` block for atomicity.
- **De-dup:** compare current result to last observed; only push a new event on change.
- **Process strategy:** spawn a long-lived `osascript` shell that reads AppleScript commands from stdin and writes results to stdout. This avoids per-poll spawn overhead (~15ms each). Alt: per-poll spawn. Benchmark in the plan.
- **Error handling:** osascript timeout (>500ms) → kill + respawn + log `osascript_stall` event (flags bit). Too many consecutive stalls (>10) → emit `CAPTURE_DEGRADED` and let callers decide to stop.

### AX Notifications
- **Mechanism:** `AXObserverAddNotification` in Zig (via `CoreFoundation` + `ApplicationServices` framework headers), subscribed to `kAXAnnouncementRequestedNotification` on the system-wide AXUIElement.
- **Call from the signed helper app** — AX observation requires Accessibility TCC grant; the helper holds it (Phase 1 decision). Zig → XPC → helper → AXObserver.
- **Event delivery:** helper forwards each notification to the Zig core via XPC callback; Zig pushes to the same ring buffer AppleScript writes to, tagged `source: "ax"`.
- **What it captures:** `kAXAnnouncementRequestedNotification` fires when apps explicitly request an announcement (ARIA live regions, toast notifications). NOT captured: VoiceOver cursor reads of static content. AppleScript captures those.

### VoiceOver Plist Keys (9 snapshotted + restored)
1. `SCREnableAppleScript` (ensure true)
2. `com.apple.VoiceOver4/default/SCRVoiceShouldMute` (set true for test)
3. `SCRCurrentSpeechRate` (set 90 — high, not max, to preserve intelligibility for debugging)
4. `SCRVerbosity` (set to minimum)
5. `SCRShouldSpeakHints` (set false)
6. `SCRPunctuationAppName` / `SCRPunctuationLevel` (set minimum)
7. `SCRShouldSpeakStaticText` (set true)
8. `SCRSpeakChannel` (lock to a known voice)
9. `SCRShouldAnnounceKeyCommands` (set false — test noise)

Exact key names come from Guidepup's `configureSettings.ts` — copy verbatim. Version-branch plist PATH using the Phase 2 doctor logic (Sonoma vs Sequoia+ Group Container).

### Lifecycle Discipline (copy from Guidepup + harden)
1. `storeOriginalSettings()` at start — read each of the 9 keys into memory before any write
2. `configureSettings(SHOKI_DEFAULTS)` — write our values
3. `VoiceOverStarter.app` OR AppleScript `tell application "VoiceOver" to activate` to boot VO. Verify with `pgrep -x VoiceOver` + 2s timeout
4. At stop OR any crash signal: `restoreSettings()` + force-kill VO (`kill -9` if soft quit fails + `pgrep` didn't clear within 1s)
5. Before stop: wait 100ms for last events to flush
6. Process-level exit hooks: `exit`, `uncaughtException`, `unhandledRejection`, `SIGINT`, `SIGTERM`. All call the same `restoreSettings + forceKillVO` path

**Critical rule:** The Zig core owns these hooks — NOT the TS SDK. A TS unhandled promise rejection doesn't unwind Zig state; we need native-side signal handlers.

### Start/Stop Refcounting
- Multiple `voiceOver.start()` calls in one process refcount. First caller boots VO + configures plist; later callers get handles to the same session.
- `voiceOver.stop()` decrements; last caller restores plist + kills VO.
- This is mandatory because Vitest parallelizes test files in Phase 4 — several may call `start()` concurrently.

### Startup Reconciliation
- On `start()`: if `pgrep -x VoiceOver` shows VO already running (from the user's own use OR a crashed prior test), we do NOT attach. We force-kill + start fresh. User's VO state is lost, but our session is deterministic.
- This trades user-VO preservation for test reliability. Doctor warns of a running VO before tests start (Phase 2 `shoki doctor` check — add in a future iteration).

### Ring Buffer Draining (Zig owns)
- Ring buffer capacity default: 10,000 entries (~configurable via start option `logBufferSize`)
- Overflow: oldest entry discarded, `droppedCount` atomic counter increments
- TS calls `binding.drain(driverHandle, buffer)` to copy all entries into a pre-allocated Buffer in one N-API hop
- `drain` returns the count + clears the ring buffer
- Backpressure strategy: TS must call drain regularly (the SDK does this automatically every 50ms in a background timer); if TS falls behind, droppedCount grows and is visible via `getDroppedCount()`

### TS API Surface
- `voiceOver(options?)` → returns `ScreenReaderHandle` (matches `screenReader` interface from Phase 1)
- `handle.start()`, `handle.stop()` — the existing interface
- `handle.listen(): AsyncGenerator<ShokiAnnouncement>` — yields events as they arrive; never throws for backpressure, just emits with `dropped: number` hint
- `handle.phraseLog(): ShokiAnnouncement[]` — snapshot of all events captured since start (or last `clear`)
- `handle.lastPhrase(): ShokiAnnouncement | null` — most recent event
- `handle.clear()` — empties the internal log without restarting VO or losing buffer capacity
- `handle.reset()` — calls `VO Utility reset` AppleScript to reset VO cursor to a known state + clear the log; used between tests
- `handle.awaitStableLog({ quietMs }): Promise<ShokiAnnouncement[]>` — resolves when no new events have arrived for `quietMs` milliseconds; returns the stable log
- `handle.getDroppedCount(): number` — visibility into backpressure

### Keyboard Command Catalog (CAP-16)
- Port verbatim from Guidepup's `src/macOS/VoiceOver/constants.ts`. Two exported objects:
  - `keyboardCommands` — 226 VO gesture names → key-sequence descriptions
  - `commanderCommands` — 129 VO Commander command names → key-sequence descriptions
- Format: `{ name: string, keys: Array<{ key: string, modifiers?: string[] }> }`
- Users dispatch via their own framework's keyboard driver (Playwright's `page.keyboard.down/up`, XCTest's `XCUIKeyboardKey`, etc.)
- Shoki does NOT dispatch these — observe-only remains the rule.

### Wire Format (freeze NOW)
- `WIRE_VERSION = 1` — set in Phase 1, do NOT change
- Entry: `[u64 ts_nanos][u8 source_tag][u8 flags][u16 phrase_len][phrase utf8][u16 role_len][role utf8?][u16 name_len][name utf8?]`
- `source_tag`: 0 = applescript, 1 = ax, 2+ reserved
- `flags` bit 0: `interrupt` (this announcement interrupted a prior one, inferred from timing); bit 1: `truncated` (capture was clipped); bits 2-7 reserved
- Regression test: `zig/test/wire_test.zig` locks the exact byte layout via a golden test

### Process Model Recap
- Noop driver from Phase 1 stays for round-trip testing.
- New `voiceover` driver registers alongside noop in `zig/src/core/registry.zig`.
- `packages/sdk/src/voice-over.ts` factory now looks up `"voiceover"` in the registry instead of `"noop"`.

### Testing Strategy
- **Unit (Zig):** ring buffer, wire format, settings snapshot/restore logic with mocked plist IO, refcount state machine — no OS calls
- **Unit (TS):** wire decoder (already exists), `listen()` async generator backpressure, `awaitStableLog` timing, `reset`/`clear` semantics — all mocked native
- **Integration (darwin-only, CI):** actual VO boot, `say` to trigger an announcement, assert event delivery, then restart clean. Gated on a CI env var.
- **Stress test:** 10,000-event script to verify droppedCount behavior (CAP-07)
- **Crash-recovery test:** child process starts VO, kills itself with SIGKILL, parent verifies plist was restored and VO was killed

### Claude's Discretion
- Exact AppleScript tell-block text
- Whether to use Obj-C or pure Zig for the AX observer callback — pure Zig preferred if `@cImport` of ApplicationServices headers is stable; fall back to tiny Obj-C shim if not
- Exact Zig struct layouts for the driver state

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `zig/src/core/driver.zig` — ShokiDriver vtable already frozen
- `zig/src/core/ring_buffer.zig` — ring buffer already implemented, `droppedCount` ready
- `zig/src/core/wire.zig` — wire format already frozen (version 1)
- `zig/src/core/registry.zig` — just append the voiceover driver to the array
- `zig/src/drivers/noop/driver.zig` — reference implementation shape
- `helper/Sources/ShokiRunnerProtocol/ShokiRunnerProtocol.swift` — extend with `startAXObserver` / `stopAXObserver` XPC methods
- `packages/sdk/src/screen-reader.ts` — `ScreenReaderHandle` interface already defined
- `packages/sdk/src/wire.ts` — TS wire decoder ready
- `packages/sdk/src/voice-over.ts` — factory exists, currently points at noop; switch to voiceover driver
- `@shoki/doctor` (Phase 2) — call from `start()` to pre-flight check permissions; if doctor exits non-zero, fail fast with a pointer to run `shoki doctor`

### Established Patterns
- Zig comptime-dispatched drivers (Phase 1)
- TS optionalDependencies for platform binaries (Phase 1)
- Settings snapshot/restore lifecycle (Guidepup reference)
- XPC protocol in Swift helper (Phase 1 scaffolded, extend here)

### Integration Points
- Zig core → XPC → ShokiRunner.app (AX observer lives here)
- TS `voiceOver()` factory → Zig `driver.start("voiceover", opts)` → Zig boots VO + configures plist + starts poll + registers AX observer via XPC
- On stop/crash → Zig unregisters AX observer (XPC) + kills VO + restores plist

</code_context>

<specifics>
## Specific Ideas

- Study Guidepup source: `src/macOS/VoiceOver/LogStore.ts`, `configureSettings.ts`, `start.ts`, `runAppleScript.ts`, `withTransaction.ts`, `constants.ts`. Copy lifecycle discipline, adapt to Zig.
- The `say "hello"` trick is the simplest way to validate captures in integration tests — it's synchronous from the app layer but VO announces it via kAXAnnouncementRequestedNotification.
- Use Guidepup's `VoiceOverStarter.app` if available; otherwise `tell application "VoiceOver" to activate`.

</specifics>

<deferred>
## Deferred Ideas

- Audio capture + ASR for ultra-high-fidelity capture (out of scope; PITFALLS notes it as too heavy for marginal gain)
- Rotor / navigation commands (`handle.navigate()`) — observe-only is the v1 promise
- Per-announcement element source inspection (which element announced this?) — requires deeper AX API work; flag as v2
- Custom speech synthesizer interception — private API territory, macOS-version-fragile

</deferred>
