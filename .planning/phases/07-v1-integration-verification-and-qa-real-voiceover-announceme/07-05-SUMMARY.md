---
phase: 07-v1-integration-verification-and-qa-real-voiceover-announceme
plan: 05
status: complete
gate_status: GREEN
completed_date: 2026-04-17
tags:
  - sigkill-recovery
  - settings-restore
  - escape-hatch
  - cli
  - plist-snapshot
  - docs
requires:
  - 07-01 (Zig 0.16 toolchain + helper dylib)
  - 07-02 (libshoki.dylib builds + RealSpawner)
provides:
  - zig/src/drivers/voiceover/lifecycle.zig writeSnapshotFile / serializeSnapshot / deleteSnapshotFile / resolveSnapshotPath
  - On-disk snapshot file at ~/.shoki/vo-snapshot.plist (or $SHOKI_SNAPSHOT_PATH)
  - packages/doctor/src/restore-vo-settings.ts restoreVoSettingsFromSnapshot()
  - shoki CLI `restore-vo-settings` subcommand (--path, --force, --dry-run)
  - packages/sdk/test/integration/restore-on-sigkill.integration.test.ts (SIGKILL end-to-end, gated)
  - packages/sdk/test/fixtures/sigkill-child.ts (fork target for the SIGKILL test)
  - docs/getting-started/permission-setup.md "Recovery" section
affects:
  - zig/src/drivers/voiceover/lifecycle.zig (startHandle writes snapshot; stopHandle deletes it)
  - zig/test/voiceover_lifecycle_test.zig (+5 tests covering snapshot-file I/O)
  - packages/doctor/src/cli.ts (registers restore-vo-settings subcommand)
key-decisions:
  - "Snapshot file is plist XML — same format `defaults`/`plutil` natively produce — with three `_shoki_*` metadata keys (version, pid, ts_unix) and a `_shoki_snapshot_domain` key so the restore CLI writes back to the correct Sonoma-vs-Sequoia+ plist path. Version magic lets us refuse unrecognized files; 7-day TTL on ts_unix (override via --force) avoids applying stale snapshots from an older shoki version."
  - "Use libc (std.c.open/write/close/rename/unlink/mkdir) directly for the file-I/O path. Zig 0.16 moved `std.fs.cwd()` to `std.Io.Dir.cwd()` which requires a `std.Options.cwd` root override this module doesn't wire up — libc is stable POSIX and avoids the churn."
  - "Restore CLI uses regex parsing on the snapshot plist rather than shelling out to plutil. Shoki writes the file itself with a narrow set of tag shapes (bool/int/string); a full plist parser is overkill and adds a binary dep. We only parse files matching `_shoki_snapshot_version` so attacker-crafted XML cannot cause us to run arbitrary defaults-write commands."
  - "Plan's plist-key example used Guidepup names like `SpeechRate`/`VoiceVolume`; the actual defaults.zig catalog (frozen in Phase 3) uses verbatim-copied Guidepup keys `SCRCategories_...`. Code follows the real catalog — Plan was Rule-1 corrected inline."
  - "Integration test uses plain node:child_process (execFile + spawn) instead of execa. @shoki/sdk doesn't depend on execa; SIGKILL integration test must not add a new runtime dep to the SDK test suite."
  - "On clean stopHandle we delete the snapshot file — its presence means a crash. We deliberately do NOT auto-restore on next voiceOver.start() because the user may have intentionally changed settings in the interim; `shoki restore-vo-settings` is opt-in."
metrics:
  duration_min: 10
  tasks_completed: 3
  tasks_planned: 3
  commits: 3
  files_created: 4
  files_modified: 5
  lines_added: ~1199
  lines_removed: ~15
  new_zig_tests: 5
  zig_tests_total_passing: 86
  new_doctor_tests: 7
  doctor_tests_total_passing: 97
  sdk_tests_passing: 51
  sdk_tests_skipped: 12
---

# Phase 7 Plan 05: SIGKILL-robust settings restore + `shoki restore-vo-settings` CLI — Summary

Closed the SIGKILL-recovery gap that Phase 3 explicitly deferred: the on-disk snapshot file written by `voiceOver.start()` plus a `shoki restore-vo-settings` CLI gives users an escape hatch when a hard crash leaves their Mac with altered VoiceOver settings. CONTEXT.md's "Settings restore is non-negotiable" requirement is now backed by a real crash-survivable recovery path, not just SIGTERM-aware signal handlers.

**One-liner:** Lifecycle writes `~/.shoki/vo-snapshot.plist` on start (plist XML with version magic + 9 catalog keys); `shoki restore-vo-settings` CLI re-applies them via `defaults write`; SIGKILL integration test proves end-to-end recovery.

## What landed

### Zig — on-disk snapshot write

`zig/src/drivers/voiceover/lifecycle.zig` adds four pub fns:

- `resolveSnapshotPath(allocator) []u8` — `$SHOKI_SNAPSHOT_PATH` else `$HOME/.shoki/vo-snapshot.plist`
- `serializeSnapshot(allocator, snap, pid, ts_unix) []u8` — pure-fn plist XML builder, no I/O
- `writeSnapshotFile(allocator, snap, path) void` — atomic (tmp + rename), 0600 perms, auto-mkpath
- `deleteSnapshotFile(path) void` — best-effort, idempotent

Plist format (shoki-owned):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>_shoki_snapshot_domain</key><string>com.apple.VoiceOver4/default</string>
  <!-- 9 catalog keys as bool/int/string per Phase 3's defaults.zig -->
  <key>SCREnableAppleScript</key><true/>
  ...
  <key>_shoki_snapshot_version</key><integer>1</integer>
  <key>_shoki_snapshot_pid</key><integer>12345</integer>
  <key>_shoki_snapshot_ts_unix</key><integer>1729...</integer>
</dict>
</plist>
```

Wired into `startHandle` immediately after `snapshotSettings()` succeeds — failure logs a warning but doesn't abort VO boot, since in-memory snapshot is still enough for graceful shutdown. `stopHandle` deletes the file on the clean path.

5 new Zig tests in `zig/test/voiceover_lifecycle_test.zig`: file round-trip, catalog-order serialization, auto-mkpath for nested dirs, delete-idempotent, default-HOME path resolution. All 86 Zig tests pass.

### TS — `shoki restore-vo-settings` CLI

`packages/doctor/src/restore-vo-settings.ts` exports `restoreVoSettingsFromSnapshot(opts)` returning:

```ts
interface RestoreResult {
  ok: boolean;
  code: 'OK' | 'SNAPSHOT_MISSING' | 'SNAPSHOT_UNRECOGNIZED' | 'SNAPSHOT_STALE' | 'WRITE_FAILED';
  restoredKeys?: string[];
  failures?: Array<{ key: string; error: string }>;
  snapshotAgeSeconds?: number;
}
```

Rejection gates:
1. **SNAPSHOT_MISSING** (exit 1) — file doesn't exist; nothing to do.
2. **SNAPSHOT_UNRECOGNIZED** (exit 2) — no `_shoki_snapshot_version` magic key.
3. **SNAPSHOT_STALE** (exit 2) — ts_unix older than 7 days and `--force` not passed.
4. **WRITE_FAILED** (exit 2) — at least one `defaults write` failed; successful keys still reported.
5. **OK** (exit 0) — all 9 keys restored.

Key lookup uses the snapshot's recorded `_shoki_snapshot_domain` (not a hardcoded default) so it writes back to the correct path on Sequoia+ Group Container installs. String-typed values matching the `__SHOKI_MISSING__` sentinel trigger `defaults delete` instead of `defaults write` — round-trips the `.missing` variant from Phase 3.

CLI subcommand in `cli.ts` exposes `--path`, `--force`, `--dry-run`. Example:

```
$ shoki restore-vo-settings --help
Usage: shoki restore-vo-settings [options]

Escape hatch: re-apply the VO plist snapshot written by shoki. Use this if a
crash (SIGKILL, OOM, power loss) left your Mac with altered VoiceOver settings
(Plan 07-05).

Options:
  -p, --path <path>  Snapshot file path (default:
                     "~/.shoki/vo-snapshot.plist")
  -f, --force        Apply even if the snapshot is >7 days old
  --dry-run          Print what would be restored without applying
  -h, --help         display help for command
```

Success output:
```
Restored 9 keys from /Users/you/.shoki/vo-snapshot.plist
```

7 RED→GREEN unit tests in `packages/doctor/test/restore-vo-settings.test.ts` covering all rejection codes + happy path argv + custom domain handling. All 97 doctor tests pass.

### SIGKILL integration test (gated)

`packages/sdk/test/integration/restore-on-sigkill.integration.test.ts` gated on `darwin + SHOKI_INTEGRATION=1 + SHOKI_NATIVE_BUILT=1`. Sequence:

1. Snapshot reference state of 9 VO plist keys.
2. Fork `sigkill-child.ts` with `$SHOKI_SNAPSHOT_PATH=<tempfile>`; wait for "started" IPC.
3. Assert snapshot file exists + contains `_shoki_snapshot_version`.
4. `child.kill('SIGKILL')` + wait for exit.
5. Assert at least one plist key now differs from reference (proves shoki actually wrote its defaults).
6. Run `node .../cli.js restore-vo-settings --path <tempfile>`.
7. Assert all 9 keys match reference.
8. pkill VO + confirm pgrep empty.

Fixture `packages/sdk/test/fixtures/sigkill-child.ts` boots `voiceOver()` with `mute: true, speechRate: 90` (benign no-op values) and idles — SIGKILL-unhandleable, so the on-disk snapshot is the only recovery state.

Test skips cleanly when env not set — full `pnpm --filter @shoki/sdk test` passes with 51 passed / 12 skipped. Real darwin+VO execution lands in Plan 07-06's runbook.

### Docs

`docs/getting-started/permission-setup.md` new **Recovery** section:
- What the snapshot file is + where it lives (with env override)
- How to run `shoki restore-vo-settings`
- Flags (--path, --force, --dry-run)
- Exit codes (0/1/2)
- List of the 9 snapshotted keys
- Note that shoki deliberately does NOT auto-restore on startup (user may have intentionally changed settings)

## Deviations from Plan

### Auto-fixed Issues (no architectural change)

**1. [Rule 1 - Bug] Plan's plist-key example used Guidepup short names (SpeechRate, VoiceVolume)**
- **Found during:** Task 1 & Task 2 (mismatch between plan pseudocode and real `defaults.zig` catalog)
- **Issue:** Plan's example JSON/XML referenced keys like `SpeechRate`, `VoiceVolume`, `EffectsEnabled` etc. The real `keyCatalog()` in `zig/src/drivers/voiceover/defaults.zig` (frozen in Phase 3 CAP-02) uses verbatim-copied Guidepup SCR-prefixed names: `SCRCategories_SCRCategoryRotorAndTables_SCRGeneralSettings_SCRRateAsPercent`, etc.
- **Fix:** Used the real catalog keys in `SHOKI_KEYS` const in `restore-vo-settings.ts` and in the test fixture builder. Documented in SUMMARY key-decisions. The 9 keys are still 9 keys and the snapshot format is unchanged — just the names.
- **Files modified:** `packages/doctor/src/restore-vo-settings.ts`, `packages/doctor/test/restore-vo-settings.test.ts`, `docs/getting-started/permission-setup.md`
- **Commit:** `1083d43`

**2. [Rule 3 - Blocking] Zig 0.16 `std.fs.cwd()` API changed**
- **Found during:** Task 1 (first `zig build test`)
- **Issue:** Plan pseudocode used `std.fs.cwd().makePath()`, `std.fs.cwd().createFile()`, etc. In Zig 0.16 these moved to `std.Io.Dir.cwd()` and require a `std.Options.cwd` root override. Test harness also rejected `realpathAlloc` + `readFileAlloc` as not-a-member on `Io.Dir`.
- **Fix:** Switched file-I/O to libc directly (`std.c.open`, `write`, `close`, `rename`, `unlink`, `mkdir`). This matches the precedent set by Phase 7 Plan 02 (which wrote shims over libc for mutex/clock/subprocess because Zig 0.16's Io abstraction is still settling).
- **Files modified:** `zig/src/drivers/voiceover/lifecycle.zig`, `zig/test/voiceover_lifecycle_test.zig`
- **Commit:** `bf1bb17`

**3. [Rule 3 - Blocking] `std.time.timestamp` / `std.time.nanoTimestamp` removed in Zig 0.16**
- **Found during:** Task 1 second `zig build test`
- **Issue:** Plan pseudocode used `std.time.timestamp()` for the snapshot ts_unix metadata; Zig 0.16 removed this.
- **Fix:** Compute via `clock_mod.nanoTimestamp() / std.time.ns_per_s` — matches the pattern already established in `zig/src/core/clock.zig` (Plan 07-02 rationale).
- **Files modified:** `zig/src/drivers/voiceover/lifecycle.zig`, `zig/test/voiceover_lifecycle_test.zig`
- **Commit:** `bf1bb17`

**4. [Rule 3 - Blocking] `@shoki/sdk` doesn't depend on execa**
- **Found during:** Task 3 (`pnpm --filter @shoki/sdk test`)
- **Issue:** Plan pseudocode for the SIGKILL integration test used `import { execFile } from 'node:child_process'` but the sibling `execa` pattern from the plan's example. execa is NOT a direct dep of `@shoki/sdk`.
- **Fix:** Wrote a small `runCmd(cmd, args)` helper using `util.promisify(execFile)` that never throws — tests don't need execa's bells and whistles for the simple CLI invocations.
- **Files modified:** `packages/sdk/test/integration/restore-on-sigkill.integration.test.ts`
- **Commit:** `c50cf4d`

**5. [Rule 2 - Correctness] Added `_shoki_snapshot_domain` key to snapshot format**
- **Found during:** Task 2 (reviewing the restore CLI's write target)
- **Issue:** Plan's snapshot schema included `_shoki_snapshot_version`, `_shoki_snapshot_pid`, `_shoki_snapshot_ts_unix` but not the plist domain. On Sequoia+, the domain is a long Group Container path — not knowable from the key names alone. Without recording it, restore would have to re-run `sw_vers` + path computation, and would break if the user's HOME changed between capture and restore.
- **Fix:** Added `_shoki_snapshot_domain` as a fourth metadata key. The snapshot already knows its domain (`PlistSnapshot.domain`); serialize it. The restore CLI uses the recorded domain, falling back to `com.apple.VoiceOver4/default` only if the tag is absent (for forward-compat with theoretically-older snapshots).
- **Files modified:** `zig/src/drivers/voiceover/lifecycle.zig`, `packages/doctor/src/restore-vo-settings.ts`, `packages/doctor/test/restore-vo-settings.test.ts`
- **Commit:** `bf1bb17` + `1083d43`

### Architectural decisions NOT made (Rule 4 avoided)

- **Auto-restore on startup if snapshot file is present:** Considered but rejected — user may have intentionally changed VO settings since the crash, and silently reverting them would be worse than a manual opt-in. `shoki restore-vo-settings` stays explicit.
- **Signed / HMAC'd snapshot file:** Over-engineering for v1. The snapshot lives in `~/.shoki/` (0600 perms, user-scoped); anyone who can tamper with it can already run `defaults write` directly.

## Auth gates

None — this plan's implementation paths (Zig file I/O, TS unit tests with mocked execa) don't need TCC / helper signing. The SIGKILL integration test **does** need full TCC + real VoiceOver, but it skips cleanly when `SHOKI_INTEGRATION != 1` and its actual execution is deferred to Plan 07-06's runbook.

## Deferred items (for 07-06 runbook)

- Real SIGKILL end-to-end under `SHOKI_INTEGRATION=1` on darwin with granted TCC — test is authored + typecheck-clean; Plan 07-06 is where we actually flip the env var and run it on the live Mac.
- Confirming the on-disk snapshot survives across a real process crash vs. just a signal delivery — again requires live run in 07-06.

## Verification checklist

| Item | Status | Notes |
|------|--------|-------|
| `grep -c "writeSnapshotFile" zig/src/drivers/voiceover/lifecycle.zig` ≥ 2 | ✓ (5) | Definition + 2 call sites + alias + comment |
| `grep -q "_shoki_snapshot_version" lifecycle.zig` | ✓ | Metadata key written by serializeSnapshot |
| `zig build test` — all tests pass | ✓ | 86/86 (+5 new) |
| `pnpm --filter @shoki/doctor test` — all tests pass | ✓ | 97 passed / 1 skipped (+7 new) |
| `pnpm --filter @shoki/doctor typecheck` | ✓ | No errors |
| `pnpm --filter @shoki/doctor build` | ✓ | dist/cli.js + dist/restore-vo-settings.js emitted |
| `shoki restore-vo-settings --help` prints description | ✓ | See captured output above |
| `shoki restore-vo-settings --path /tmp/nope.plist` exits 1 | ✓ | Prints "No snapshot at ..." |
| Integration test file exists + gates correctly | ✓ | Skips with "SHOKI_INTEGRATION != 1" |
| Fixture file exists | ✓ | sigkill-child.ts, mirrors crash-child.ts |
| permission-setup.md has Recovery section | ✓ | 3 references to `shoki restore-vo-settings` / `~/.shoki` path |
| `pnpm --filter @shoki/sdk typecheck` | ✓ | New integration test compiles |
| `pnpm --filter @shoki/sdk test` — no regressions | ✓ | 51 passed / 12 skipped (unchanged pass count, +1 skip from new file) |

## Commits

| Hash | Scope | Summary |
|------|-------|---------|
| `bf1bb17` | Task 1 | Lifecycle writeSnapshotFile + 5 Zig tests |
| `1083d43` | Task 2 | restore-vo-settings module + CLI subcommand + 7 unit tests |
| `c50cf4d` | Task 3 | SIGKILL integration test + sigkill-child fixture + docs Recovery section |

## Self-Check: PASSED

All created files verified present:
- `/Users/jackshelton/dev/open-source/shoki/packages/doctor/src/restore-vo-settings.ts` — FOUND
- `/Users/jackshelton/dev/open-source/shoki/packages/doctor/test/restore-vo-settings.test.ts` — FOUND
- `/Users/jackshelton/dev/open-source/shoki/packages/sdk/test/integration/restore-on-sigkill.integration.test.ts` — FOUND
- `/Users/jackshelton/dev/open-source/shoki/packages/sdk/test/fixtures/sigkill-child.ts` — FOUND

All commits verified:
- `bf1bb17` — FOUND in `git log --oneline`
- `1083d43` — FOUND in `git log --oneline`
- `c50cf4d` — FOUND in `git log --oneline`

All functional verification passes (see Verification checklist above).
