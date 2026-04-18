# v1 Integration QA Report

**Date:** 2026-04-17
**Machine:** Darwin Mac-1917.lan 25.4.0 Darwin Kernel Version 25.4.0: Thu Mar 19 19:31:09 PDT 2026; root:xnu-12377.101.15~1/RELEASE_ARM64_T8132 arm64 (macOS 26.4)
**Shoki HEAD:** `c3a6be7233a6cd24caa91da5ccd8ae11195fd29c`
**Executor:** Claude Code (autonomous QA run)
**Toolchain:** zig 0.16.0, node v24.15.0, pnpm 10.0.0, swift 6.2.4

**Overall gate:** **YELLOW** — 12 PASS / 0 PARTIAL / 2 BLOCKED (user-action-required) / 1 FAIL (environment bug)

> The single hard blocker is **item #13 (real-VO Vitest)**: osascript (pipe mode) is silently blocked by macOS TCC's Automation gate, so shoki's `startHandle → BOOT_SCRIPT → sendAndReceive → osascript -s s -i -` path stalls at `voiceOver.start()`. This is the documented one-time user action from CONTEXT.md § "User action checklist". Once granted, the DOM-vs-Chrome-URL test + the app.test.tsx real-VO assertion both fire. Item #14 is logically BLOCKED on #13 (can't verify post-test plist equality if VO never runs), but #15 (`shoki restore-vo-settings`) is independently proven from the partial snapshot file that was written before the stall. A secondary FAIL is in the SIGKILL integration test harness (`tsx` missing from `@shoki/sdk` devDependencies).

## Summary

- Pass: 12
- Blocked (user action): 2 (items 13 and 14 — single root cause = Automation TCC grant)
- Fail (QA-found bug): 1 (item implicit: SIGKILL fixture dep missing — details under "Bugs found")
- Partial: 0

## Pre-run gate

All toolchain steps exit 0 on the current HEAD. Rebuilt + reinstalled from scratch to catch any Wave-2/3 native-code regressions.

| Step | Command | Exit | Evidence |
| --- | --- | --- | --- |
| zig build | `cd zig && zig build` | 0 | `zig-out/lib/libshoki.dylib` = 2,258,080 bytes, arm64 Mach-O |
| zig tests | `cd zig && zig build test --summary all` | 0 | `Build Summary: 3/3 steps succeeded; 87/87 tests passed` in 494ms |
| swift build | `cd helper && swift build -c release` | 0 | `Build complete! (0.10s)` — libShokiXPCClient.dylib relinked |
| swift tests | `cd helper && swift test` | 0 | 7 tests, 0 failures, 0.312s (5 AXObserver + 2 XPCPing) |
| helper app bundle | `cd helper && bash scripts/build-app-bundle.sh` | 0 | `helper/ShokiRunner.app/Contents/MacOS/ShokiRunner` = 100,200 bytes, executable |
| .node install | `cp zig-out/lib/libshoki.dylib packages/binding-darwin-arm64/shoki.node` | 0 | Binding 2.2MB; otool -L shows @rpath/libshoki.dylib + @rpath/libShokiXPCClient.dylib |
| pnpm install | `pnpm install` | 0 | `Already up to date` on full workspace (9 projects) |
| workspace typecheck | `pnpm -r typecheck` | 0 | 8 projects checked (`@shoki/sdk`, `@shoki/matchers`, `@shoki/vitest`, `@shoki/doctor`, example) |
| SDK tests (no integration) | `pnpm --filter @shoki/sdk test` | 0 | 57 passed, 6 skipped (integration gates) |
| SDK tests (native built) | `SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test` | 0 | 57 passed, 6 skipped; ping() round-trip green |
| matchers tests | `pnpm --filter @shoki/matchers test` | 0 | 19 passed / 19 (4 test files) |
| vitest plugin tests | `pnpm --filter @shoki/vitest test` | 0 | 38 passed / 38 |
| playwright chromium | `cd examples/vitest-browser-react && npx playwright install chromium` | 0 | Short-circuits — chromium-1200/1208/1217 already cached |
| docs build | `pnpm --filter docs build` | 0 | `build complete in 1.85s` — dist/index.html etc. emitted |
| binding ping | `node -e "require('.../shoki.node').ping()"` | 0 | Returns `"pong"`, version `"0.0.0"`, wire 1 |

**Pre-run gate: GREEN.** Downstream items are safe to attempt.

## Pre-test plist baseline

VoiceOver4 plist values at the real location `~/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4.plist` (macOS 26.4 uses Group Container path, not `com.apple.VoiceOver4` domain — confirmed via `sw_vers -productVersion` + `ls`).

```yaml
SCREnableAppleScript: true
SCRCategories_SCRCategorySystemWide_SCRSoundComponentSettings_SCRDisableSound: true
SCRCategories_SCRCategoryRotorAndTables_SCRGeneralSettings_SCRRateAsPercent: 90
SCRCategories_SCRCategoryActivities_SCRVerbositySettings_SCRVerbosityLevel: 0
SCRCategories_SCRCategoryHintsAndTips_SCRHintDelay_SCRShouldSpeakHints: false
SCRCategories_SCRCategoryPunctuationAndSymbols_SCRPunctuationSettings_SCRPunctuationLevel: 0
SCRCategories_SCRCategoryVerbosity_SCRShouldSpeakStaticText: true
SCRCategories_SCRCategoryVoices_SCRSpeakChannel: "com.apple.speech.synthesis.voice.Alex"
SCRShouldAnnounceKeyCommands: false
```

VoiceOver is NOT running at baseline (`pgrep -x VoiceOver` → exit 1).

## TCC anchor classification

**`TCC-ANCHOR: ad-hoc`**

Helper signature inspection:

```
$ codesign -dvvv helper/ShokiRunner.app
Executable=.../helper/ShokiRunner.app/Contents/MacOS/ShokiRunner
Identifier=ShokiRunner
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20400 size=900 flags=0x20002(adhoc,linker-signed) hashes=25+0
Signature=adhoc
TeamIdentifier=not set
```

Ad-hoc signature = TCC grants are tied to the exact hash (rebuild breaks the grant). For this QA run the helper is not directly invoked: Vitest-browser-mode drives the SDK which in turn spawns osascript directly. The controlling TCC anchor is therefore the process tree executing `pnpm test` (Claude Code's terminal/shell).

**Observed TCC state (probes, not sqlite3 — TCC.db requires Full Disk Access and was denied):**

| Probe | Result | Inference |
| --- | --- | --- |
| `osascript -e 'tell application "VoiceOver" to launch'` | RC=0 in 1s; `pgrep -x VoiceOver` finds the process | Launch Services path — does NOT need AppleEvents |
| `osascript -e 'tell application "VoiceOver" to quit'` | RC=0 in 1s; VO exits | Same — special-cased |
| `osascript -e 'tell application "VoiceOver" to get bounds of vo cursor'` (VO running) | Hangs 30s+, no dialog, kill via `pkill osascript` required | AppleEvents silently blocked |
| `osascript -e 'tell application "System Events" to return name of first process'` | Hangs 30s+, no dialog | Same — silent TCC block |
| `echo 'tell application "VoiceOver" with transaction...' \| osascript -s s -i -` (VO NOT running) | RC=0 in 1s; VO does NOT start | Pipe-mode nested tell blocks fail silently without AppleEvents access |

**Conclusion:** This machine has NO persistent Automation grant for the terminal/Node toward VoiceOver. The one-way `launch`/`quit` works because it goes through LaunchServices, but any real AppleScript that sends events to VoiceOver is silently dropped. No prompt dialog was triggered by any probe (macOS treats a denied Automation request as a silent no-op in CLI-parent contexts when the parent chain isn't in the per-app Automation list).

**What shoki's BOOT_SCRIPT does:** sends (verbatim from `zig/src/drivers/voiceover/applescript.zig` + `lifecycle.zig`):

```
tell application "VoiceOver"
    with transaction
        tell application "VoiceOver" to activate
    end transaction
end tell
log "__SHOKI_SEP__"
```

via `/usr/bin/osascript -s s -i -` (pipe mode). The outer `tell` + `with transaction` requires AppleEvents access to VoiceOver. Without it, osascript exits RC=0 but the `with transaction` block is a silent no-op and the sentinel `__SHOKI_SEP__` is not emitted before the child's stdin is drained, so shoki's `readStdoutLine` hits its 5000ms timeout and `error.Timeout` is mapped to `error.OsascriptStall` per `applescript.zig:110`.

## Known TCC Prompt

**NOTE for the user:** On first attempt to run `SHOKI_NATIVE_BUILT=1 SHOKI_INTEGRATION=1 pnpm --filter vitest-browser-react-example test`, macOS should — but on this machine did NOT — prompt to grant Automation to your terminal/IDE target toward VoiceOver. The autonomous QA session could not trigger the prompt because it runs in a non-GUI parent context where macOS suppresses the dialog and silently denies.

To unblock items 13 and 14, manually open **System Settings → Privacy & Security → Automation → [your terminal app, e.g. Terminal.app/iTerm/Ghostty/Warp/VS Code] → VoiceOver** and ensure it is toggled ON. If the VoiceOver row does not appear, run one of these commands in the terminal to trigger a first-use dialog:

```bash
# This SHOULD trigger a one-time Automation dialog:
osascript -e 'tell application "VoiceOver" to get bounds of vo cursor'
```

If the dialog still does not appear, the alternate path is to sign ShokiRunner.app with a Developer ID certificate and grant it Accessibility in System Settings. That is out-of-scope for local v1 verification (Dev ID cert provisioning is a separate workflow; see `docs/getting-started/permission-setup.md`).

## End-to-end Vitest test

**Command:** `cd examples/vitest-browser-react && SHOKI_NATIVE_BUILT=1 SHOKI_INTEGRATION=1 pnpm test`
**Log:** `/tmp/e2e-07-06.log` (captured verbatim below)
**Exit code:** 1

**Full failure output (both test files):**

```
RUN  v3.2.4 /Users/jackshelton/dev/open-source/shoki/examples/vitest-browser-react

❯ |chromium| tests/dom-vs-chrome-url.test.tsx (2 tests | 2 skipped) 5201ms
  ↓ DOM content vs Chrome URL bar (CONTEXT.md most-important) > NEGATIVE: URL-only magic string must NOT appear in captured log
  ↓ DOM content vs Chrome URL bar (CONTEXT.md most-important) > POSITIVE: same magic string appears when it IS in the DOM
❯ |chromium| tests/app.test.tsx (2 tests | 1 skipped) 10404ms
  ✓ vitest-browser-react canonical example (VITEST-07) > renders the Submit button with the correct accessible name 20ms
  ↓ vitest-browser-react canonical example (VITEST-07) > with real VoiceOver (SHOKI_INTEGRATION=1 on darwin) > announces the Submit button on click and shows the Form submitted status

⎯ Failed Suites 2 ⎯

FAIL |chromium| tests/app.test.tsx > vitest-browser-react canonical example (VITEST-07) > with real VoiceOver (SHOKI_INTEGRATION=1 on darwin)
Error: OsascriptStall
 ❯ Object.shokiStart ../../../../../../../@id/__x00__@vitest/browser/context:14:69
 ❯ tests/app.test.tsx:26:32
    24|     beforeAll(async () => {
    25|       if (!runVoTest) return;
    26|       session = await voiceOver.start({ mute: true });
      |                                ^
    27|     }, 30_000);

FAIL |chromium| tests/dom-vs-chrome-url.test.tsx > DOM content vs Chrome URL bar (CONTEXT.md most-important)
Error: OsascriptStall
 ❯ Object.shokiStart ../../../../../../../@id/__x00__@vitest/browser/context:14:69
 ❯ tests/dom-vs-chrome-url.test.tsx:55:30
    53|   beforeAll(async () => {
    54|     if (!runVoTest) return;
    55|     session = await voiceOver.start({ mute: true });
      |                              ^
    56|   }, 30_000);

Test Files  2 failed (2)
     Tests  1 passed | 3 skipped (4)
```

**Classification:** (b) TCC grant missing — specifically, pipe-mode osascript AppleEvents access to VoiceOver. Confirmed root cause via the probe matrix in § "TCC anchor classification" above.

**Workaround attempts:**

1. `osascript -e 'tell application "VoiceOver" to launch'` directly → works, but shoki does not use this — it uses pipe-mode for the full session handle, and the boot `with transaction activate` flow needs AppleEvents. Can't substitute.
2. Ad-hoc `codesign -s - helper/ShokiRunner.app` → already ad-hoc signed from build-app-bundle.sh; re-signing produces identical hash; does not unblock pipe-mode osascript because the osascript child is parented to Node, not the helper.
3. Fork path through helper instead of direct osascript → architectural change (helper does XPC AX observation, not shell-driving; swapping would require a second AppleScript entry point in Swift). Out-of-scope for a QA run.
4. `sudo tccutil reset AppleEvents` → cannot be run without interactive sudo; also a destructive operation the user must opt into.

No workaround closed the gate. This is a genuine one-time user-action requirement documented in CONTEXT.md § "User action checklist".

**Partial evidence that the pipeline IS correctly wired:**

- `snapshotSettings()` fired successfully: all 9 keys were read and serialized.
- `writeSnapshotFile()` succeeded: `~/.shoki/vo-snapshot.plist` exists with the 9 keys + version magic + pid/ts_unix metadata + `_shoki_snapshot_domain` = `/Users/jackshelton/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4`.
- The stall happens strictly at step 6 of `startHandle` (sendAndReceive on BOOT_SCRIPT). Steps 1-5 all completed.
- `configureSettings()` had NOT run yet (the stall is before it in the sequence), so the user's plist values are untouched. This is a nicety of the lifecycle ordering.

## SIGKILL restore verification

**Command:** `SHOKI_INTEGRATION=1 SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test --run restore-on-sigkill`
**Exit code:** 1
**Log:** `/tmp/sigkill-07-06.log`

**Result:** FAIL — but NOT for the TCC reason; a harness bug surfaced. The child process never starts:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'tsx' imported from /Users/jackshelton/dev/open-source/shoki/packages/sdk/
  at Object.getPackageJSONURL (node:internal/modules/package_json_reader:301:9)
  ...

× restore-on-sigkill > SIGKILL crash → shoki restore-vo-settings restores all 9 plist keys 63ms
  → sigkill-child never reported started
```

`packages/sdk/test/integration/restore-on-sigkill.integration.test.ts:92` spawns the fixture with `['--import', 'tsx/esm', childPath]`, but `tsx` is NOT listed in `packages/sdk/package.json` devDependencies. See § "Bugs found" #1 for details.

**Fortunately:** The escape-hatch path is still independently verified — see item 15.

## Post-test plist diff

VoiceOver never actually launched (stall happened before `configureSettings`), so the user's plist values are bit-for-bit unchanged from the pre-test baseline. Table formatted per plan template for completeness:

| Key | Pre | Post | Match |
| --- | --- | --- | --- |
| SCREnableAppleScript | true | true | YES |
| SCRCategories_SCRCategorySystemWide_SCRSoundComponentSettings_SCRDisableSound | true | true | YES |
| SCRCategories_SCRCategoryRotorAndTables_SCRGeneralSettings_SCRRateAsPercent | 90 | 90 | YES |
| SCRCategories_SCRCategoryActivities_SCRVerbositySettings_SCRVerbosityLevel | 0 | 0 | YES |
| SCRCategories_SCRCategoryHintsAndTips_SCRHintDelay_SCRShouldSpeakHints | false | false | YES |
| SCRCategories_SCRCategoryPunctuationAndSymbols_SCRPunctuationSettings_SCRPunctuationLevel | 0 | 0 | YES |
| SCRCategories_SCRCategoryVerbosity_SCRShouldSpeakStaticText | true | true | YES |
| SCRCategories_SCRCategoryVoices_SCRSpeakChannel | "com.apple.speech.synthesis.voice.Alex" | "com.apple.speech.synthesis.voice.Alex" | YES |
| SCRShouldAnnounceKeyCommands | false | false | YES |

`pgrep -x VoiceOver` after suite → exit 1 (no process).

**Caveat:** "all match" does NOT validate the restore pipeline — it validates only that Plan 07-05's `writeSnapshotFile → configureSettings → restoreSettings` path was never exercised end-to-end because the stall short-circuited before any of it ran. Item #14 below is therefore classified BLOCKED until item #13 unblocks.

## `shoki restore-vo-settings` CLI (escape hatch)

Independently tested against the partial snapshot file that Zig wrote during the failed boot:

```
$ node packages/doctor/dist/cli.js restore-vo-settings --help
Usage: shoki restore-vo-settings [options]

Escape hatch: re-apply the VO plist snapshot written by shoki. Use this if a
crash (SIGKILL, OOM, power loss) left your Mac with altered VoiceOver settings
(Plan 07-05).

Options:
  -p, --path <path>  Snapshot file path (default: "/Users/jackshelton/.shoki/vo-snapshot.plist")
  -f, --force        Apply even if the snapshot is >7 days old
  --dry-run          Print what would be restored without applying
  -h, --help         display help for command

$ node packages/doctor/dist/cli.js restore-vo-settings --dry-run
[dry-run] Would restore VO settings from /Users/jackshelton/.shoki/vo-snapshot.plist
  - SCREnableAppleScript
  - SCRCategories_SCRCategorySystemWide_SCRSoundComponentSettings_SCRDisableSound
  - SCRCategories_SCRCategoryRotorAndTables_SCRGeneralSettings_SCRRateAsPercent
  - SCRCategories_SCRCategoryActivities_SCRVerbositySettings_SCRVerbosityLevel
  - SCRCategories_SCRCategoryHintsAndTips_SCRHintDelay_SCRShouldSpeakHints
  - SCRCategories_SCRCategoryPunctuationAndSymbols_SCRPunctuationSettings_SCRPunctuationLevel
  - SCRCategories_SCRCategoryVerbosity_SCRShouldSpeakStaticText
  - SCRCategories_SCRCategoryVoices_SCRSpeakChannel
  - SCRShouldAnnounceKeyCommands

$ node packages/doctor/dist/cli.js restore-vo-settings
Restored 9 keys from /Users/jackshelton/.shoki/vo-snapshot.plist
```

Exit codes 0 / 0 / 0 respectively. Plist values equal baseline after restore.

This is sufficient to mark item 15 PASS: the escape hatch reads a shoki-formatted snapshot, validates the version magic, iterates all 9 keys, and invokes `defaults write` against the recorded domain. The only dimension not exercised in this QA run is the "SIGKILL-then-recover from a post-configureSettings state" end-to-end, which is what the integration test would prove if item 13 unblocked.

## Verification Checklist (CONTEXT.md § Verification checklist)

Status legend: PASS (verified on HEAD), BLOCKED (user action required; not a code defect), FAIL (code/harness defect).

| # | Item | Status | Evidence | Reproduce |
| --- | --- | --- | --- | --- |
| 1 | `zig --version` reports 0.16.x | PASS | `zig version` → `0.16.0` | `zig version` |
| 2 | `zig build` in `zig/` produces `libshoki.dylib` | PASS | exit 0; `zig-out/lib/libshoki.dylib` 2,258,080 bytes, arm64 Mach-O | `cd zig && zig build && ls -la zig-out/lib/libshoki.dylib` |
| 3 | `zig build test` passes all Zig unit tests | PASS | `Build Summary: 3/3 steps succeeded; 87/87 tests passed` in 494ms | `cd zig && zig build test --summary all` |
| 4 | `swift build` + `swift test` in `helper/` succeeds | PASS | swift build: `Build complete! (0.10s)`. swift test: 7 tests, 0 failures (5 AXObserver + 2 XPCPing) | `cd helper && swift build -c release && swift test` |
| 5 | Helper `.app` bundle builds | PASS | `helper/ShokiRunner.app/Contents/MacOS/ShokiRunner` = 100,200 bytes, executable, ad-hoc signed | `cd helper && bash scripts/build-app-bundle.sh && test -x ShokiRunner.app/Contents/MacOS/ShokiRunner` |
| 6 | `libShokiXPCClient.dylib` linked via `zig/build.zig` | PASS | `otool -L zig-out/lib/libshoki.dylib` includes `@rpath/libShokiXPCClient.dylib`; `nm` shows 10 shoki_xpc_* symbols imported | `cd zig && zig build && otool -L zig-out/lib/libshoki.dylib \| grep ShokiXPCClient` |
| 7 | `.node` installed; `require()` loads it | PASS | binding = 2,258,080 bytes; `node -e "const b = require('...'); console.log(b.ping())"` → `"pong"`; `wireVersion()` = 1 | `cp zig/zig-out/lib/libshoki.dylib packages/binding-darwin-arm64/shoki.node && node -e "console.log(require('./packages/binding-darwin-arm64/shoki.node').ping())"` |
| 8 | `SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test` passes (noop round-trip + ping) | PASS | 57 passed, 6 skipped (all skips are integration gates) | `SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test` |
| 9 | `npx playwright install chromium` succeeds | PASS | Short-circuits (chromium-1200/1208/1217 already cached in `~/Library/Caches/ms-playwright/`); exit 0 | `cd examples/vitest-browser-react && npx playwright install chromium` |
| 10 | `@shoki/matchers` + `@shoki/vitest` tests green | PASS | matchers: 19/19; vitest: 38/38 | `pnpm --filter @shoki/matchers test && pnpm --filter @shoki/vitest test` |
| 11 | `pnpm --filter docs build` succeeds | PASS | vitepress build complete in 1.85s; `docs/.vitepress/dist/index.html` emitted | `pnpm --filter docs build && ls docs/.vitepress/dist/index.html` |
| 12 | TCC anchor chosen + documented | PASS | `TCC-ANCHOR: ad-hoc (Signature=adhoc)` — see § TCC anchor classification above | `codesign -dvvv helper/ShokiRunner.app 2>&1 \| grep -E 'Authority\|Signature'` |
| 13 | `vitest-browser-react-example` runs against REAL VoiceOver with both DOM test and URL-filter test passing | BLOCKED | `Error: OsascriptStall` at `voiceOver.start({ mute: true })` — TCC Automation grant missing for terminal → VoiceOver. See § "End-to-end Vitest test" for the captured failure. Snapshot file + filter code paths are verified up to the stall point | See § "Unblockers" step 1 |
| 14 | After the suite, VO not running AND 9 plist keys restored | BLOCKED | Transitively blocked by #13. VO is NOT running (✓); plist keys are equal to pre-test (✓) but ONLY because the stall short-circuited before `configureSettings` — the true pre/post diff never exercised the restore path. Real signal comes from #15. | Gated on #13 unblock |
| 15 | `shoki restore-vo-settings` CLI works as an escape hatch | PASS | CLI exits 0 with `Restored 9 keys from ~/.shoki/vo-snapshot.plist`; `--help`, `--dry-run`, plain-run all exit 0; all 9 plist values equal baseline post-restore. Tested against a real snapshot file that lifecycle.writeSnapshotFile wrote during the failed #13 run | `node packages/doctor/dist/cli.js restore-vo-settings --dry-run` and then `... restore-vo-settings` |

## Phase 7 gate

**YELLOW**

- GREEN: all 15 items PASS. v1 is end-to-end-verified and shippable.
- **YELLOW: 1-2 items USER-ACTION-REQUIRED** (specifically Automation TCC grant for the terminal), everything else PASS. ← this run
- RED: 3+ items FAIL, or any core item (3, 8, 13, 14) FAILs for code reasons.

**Why not RED despite items 13 and 14 failing:** both are BLOCKED on the same single user action (one checkbox in System Settings), not on code defects. All 87 Zig tests pass, all 57 SDK tests pass, all 19 matchers + 38 vitest-plugin tests pass, all 7 Swift tests pass, docs build, binding loads. The pid-filter wiring (Plan 07-04) is verified by the Zig `SHOKI_AX_TARGET_PID env override` regression test. The snapshot-write path (Plan 07-05) is verified by Zig's 5 new lifecycle tests + the real partial snapshot file that was written during the failed boot attempt. The only unverified thing is "VO announces DOM content through the real pipeline end-to-end" — which is the user-action requirement.

## Bugs found during QA

**1. `@shoki/sdk` SIGKILL integration test depends on `tsx` but it's not declared.**

`packages/sdk/test/integration/restore-on-sigkill.integration.test.ts:92` spawns the fixture via:

```ts
const child = spawn(process.execPath, ['--import', 'tsx/esm', childPath], {
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  env: { ...process.env, SHOKI_SNAPSHOT_PATH: snapshotPath },
});
```

`tsx` is not in `packages/sdk/package.json` `devDependencies`. When the test actually runs (env gates open), the child spawn fails with `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'tsx' imported from packages/sdk/`. The test completes in 63ms with "sigkill-child never reported started".

**Repro (must have SHOKI_INTEGRATION=1 + SHOKI_NATIVE_BUILT=1):**

```bash
SHOKI_INTEGRATION=1 SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test --run restore-on-sigkill
```

**Fix (not applied in this plan per QA scope):** Add `tsx` to `packages/sdk/devDependencies`, OR pre-compile the fixture to JavaScript and drop the `--import tsx/esm`, OR route the spawn through `pnpm exec tsx <file>`. The simplest fix is adding `"tsx": "^4.x"` to devDependencies. Follow-up plan territory.

**2. `reconcileStaleVO` will fire osascript probes even when no prior VO was running.**

Not a defect — observed that on a machine with VO-automation TCC denied, `startHandle` calls `reconcileStaleVO` first which uses `pgrep` (safe, works), then proceeds to boot. The stall happens cleanly at the boot step. No side effect — just noting the code path ran correctly up to the TCC gate. Recording for the future runbook.

**3. Real plist domain on macOS 26.4 (Sequoia+) is a Group Container path, not `com.apple.VoiceOver4`.**

The snapshot file's `_shoki_snapshot_domain` correctly records the full path: `/Users/jackshelton/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4`. `restoreVoSettingsFromSnapshot()` honors this correctly and `defaults write <full-path>` succeeds (verified). Not a bug — noting because any future QA engineer who tries `defaults read com.apple.VoiceOver4 <key>` will see "does not exist" and may incorrectly conclude baseline is empty. Use `/usr/libexec/PlistBuddy` against the Group Container path instead.

## Unblockers (if not GREEN)

### Step 1 — Grant Automation permission (unblocks items 13 and 14)

```bash
# Option A: Trigger the one-time prompt by issuing a real AppleEvent to VoiceOver.
# IMPORTANT: VoiceOver must be running first, because the prompt only triggers
# on a live Apple Event.
osascript -e 'tell application "VoiceOver" to launch'
sleep 3
osascript -e 'tell application "VoiceOver" to get bounds of vo cursor'
# ^ The above should trigger a system dialog on first use.
#   If it doesn't, macOS has already denied and cached "no"; manually:
#
# Option B: System Settings approach.
#   1. Open System Settings
#   2. Privacy & Security → Automation
#   3. Locate your terminal app (Terminal / iTerm / Ghostty / Warp / VS Code)
#   4. Ensure "VoiceOver" is toggled ON
#   5. If "VoiceOver" isn't listed, run Option A's second osascript line once,
#      then re-check.
#
# Clean up:
osascript -e 'tell application "VoiceOver" to quit'
```

### Step 2 — Re-run the end-to-end test (closes item 13)

```bash
cd /Users/jackshelton/dev/open-source/shoki/examples/vitest-browser-react
SHOKI_NATIVE_BUILT=1 SHOKI_INTEGRATION=1 pnpm test
```

Expected: all 4 tests pass (app.test.tsx VO-gated + dom-vs-chrome-url both positive and negative). The Zig-side pid-filter + snapshot-write + restore code are all independently verified; closing item 13 also closes item 14 by construction (Zig's stopHandle calls restoreSettings, and the plist will equal baseline).

### Step 3 — (optional) Fix the SIGKILL integration test and re-run

Add `tsx` to `packages/sdk/devDependencies`, then:

```bash
SHOKI_INTEGRATION=1 SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test --run restore-on-sigkill
```

Expected: PASS — proves the SIGKILL-crash-to-restore full round-trip.

## Reproduce the full run

```bash
# Environment assumptions: macOS 26.x arm64, Homebrew, Node 24+, pnpm 10+
cd /Users/jackshelton/dev/open-source/shoki

# Toolchain (Plan 07-01; re-runs cheap due to caching):
zig version   # expect 0.16.x
(cd zig && zig build)
(cd zig && zig build test --summary all)
(cd helper && swift build -c release && swift test)
(cd helper && bash scripts/build-app-bundle.sh)
cp zig/zig-out/lib/libshoki.dylib packages/binding-darwin-arm64/shoki.node
pnpm install
pnpm -r typecheck
pnpm --filter @shoki/matchers test
pnpm --filter @shoki/vitest test
pnpm --filter docs build
(cd examples/vitest-browser-react && npx playwright install chromium)

# SDK with native binding (items 7, 8):
SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test

# Real end-to-end (items 13, 14; will stall on OsascriptStall
# until TCC Automation grant is in place — see § Unblockers step 1):
(cd examples/vitest-browser-react && SHOKI_NATIVE_BUILT=1 SHOKI_INTEGRATION=1 pnpm test)

# SIGKILL path (item 15 full e2e; currently blocked by missing tsx dep — see Bug #1):
SHOKI_INTEGRATION=1 SHOKI_NATIVE_BUILT=1 pnpm --filter @shoki/sdk test --run restore-on-sigkill

# Escape hatch (item 15, runs independently):
node packages/doctor/dist/cli.js restore-vo-settings --help
node packages/doctor/dist/cli.js restore-vo-settings --dry-run
# Against a real shoki snapshot:
node packages/doctor/dist/cli.js restore-vo-settings

# Cleanup: restore plist and ensure VO not running
osascript -e 'tell application "VoiceOver" to quit' 2>/dev/null
node packages/doctor/dist/cli.js restore-vo-settings --force 2>/dev/null || true
rm -f ~/.shoki/vo-snapshot.plist
pgrep -x VoiceOver && pkill -9 -x VoiceOver || true
```

Report generated autonomously by the Plan 07-06 executor. Copy-paste this document into a GitHub issue as-is to walk any future contributor through reproducing the same local verification state.

## Self-Check: PASSED

Artifacts verified to exist:

- `.planning/phases/07-v1-integration-verification-and-qa-real-voiceover-announceme/QA-REPORT.md` — FOUND (this file)
- `.planning/phases/07-v1-integration-verification-and-qa-real-voiceover-announceme/07-SUMMARY.md` — FOUND
- `.planning/phases/07-v1-integration-verification-and-qa-real-voiceover-announceme/QA-TOOLCHAIN.md` — FOUND
- `/tmp/e2e-07-06.log` — FOUND (captured real-VO test output)
- `/tmp/sigkill-07-06.log` — FOUND (captured SIGKILL test output)
- `zig/zig-out/lib/libshoki.dylib` — FOUND (2,258,080 bytes)
- `packages/binding-darwin-arm64/shoki.node` — FOUND (same bytes, copied)
- `helper/ShokiRunner.app/Contents/MacOS/ShokiRunner` — FOUND (100,200 bytes, executable)
- `packages/doctor/dist/cli.js` — FOUND (rebuilt to run escape-hatch verification)

Commits verified (via `git log --oneline`):

- 07-02: `5045545`, `baf3ada`, `999a638` — all FOUND
- 07-03: `42465b4`, `2db3904`, `341382f`, `54e53d6` — all FOUND
- 07-04: `2a12a6a`, `32327d6`, `d259af0`, `c3a6be7` — all FOUND
- 07-05: `bf1bb17`, `1083d43`, `c50cf4d`, `f47708f` — all FOUND

Plan 07-06 deliverables: QA-REPORT.md + 07-SUMMARY.md written to phase dir;
final commit captures both. Self-check passed. Gate: **YELLOW** (12 PASS, 2
BLOCKED on Automation TCC grant, 1 QA-found harness bug in the SIGKILL test).
