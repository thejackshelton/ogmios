# Permission setup

macOS gates VoiceOver automation behind two permission layers:

1. **VoiceOver AppleScript control** — a single plist key that enables scripting. Off by default since macOS 26.
2. **TCC grants** (Transparency, Consent, Control) — per-executable Accessibility + Automation permissions, keyed by code signature.

Shoki's job is to make these discoverable. Run `shoki doctor` and it tells you exactly which layer is missing and how to fix it.

## The happy path

```bash
npx shoki doctor
```

Expected output when everything is set up:

```
✓ macOS 14.6 (Sonoma) — supported
✓ VoiceOver AppleScript control enabled
✓ ShokiRunner.app found at /path/to/@shoki/binding-darwin-arm64/helper/ShokiRunner.app
✓ ShokiRunner.app is Developer ID signed
✓ Accessibility grant present for ShokiRunner.app
✓ Automation grant present for ShokiRunner.app → VoiceOver

ready to run shoki · exit 0
```

If every box is checked, skip to the [Vitest quickstart](./vitest-quickstart).

## Fixing common failures

### 3 · VO_APPLESCRIPT_DISABLED

```
✗ VoiceOver AppleScript control disabled
  Run: sudo defaults write /Library/Preferences/com.apple.VoiceOver4.local \
       SCREnableAppleScriptEnabled -bool true
```

Shoki will offer `shoki doctor --fix` which attempts the write automatically when SIP permits. On systems where SIP blocks the write (most modern macOS installs), `--fix` falls back to printing the exact command and a deep link to the right System Settings pane.

### 4 · TCC_MISSING_ACCESSIBILITY

```
✗ Accessibility grant missing for ShokiRunner.app
  Grant at: System Settings → Privacy & Security → Accessibility
  Deep link: x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility
```

`shoki doctor` emits `open <deep-link>` as a follow-up command. Once you grant it in the UI, re-run `shoki doctor` to verify.

### 5 · TCC_MISSING_AUTOMATION

```
✗ Automation grant missing: ShokiRunner.app → VoiceOver
  Grant at: System Settings → Privacy & Security → Automation
  Deep link: x-apple.systempreferences:com.apple.preference.security?Privacy_Automation
```

Same fix flow as Accessibility. VoiceOver has to appear as a child entry under ShokiRunner.app after the helper tries to script it once.

### 6 · SIGNATURE_MISMATCH

```
✗ Stale TCC grant for ShokiRunner.app (csreq does not match current signature)
  Run: tccutil reset Accessibility com.shoki.ShokiRunner
       tccutil reset AppleEvents com.shoki.ShokiRunner
```

This happens when the helper binary is replaced (e.g. you reinstalled the binding package at a new version) but the TCC database still references the old code signing hash. `tccutil reset` clears both entries; re-grant in the UI.

### 7 · NEEDS_FULL_DISK_ACCESS

```
✗ Cannot read system TCC.db (SIP-protected)
  shoki doctor needs Full Disk Access to read this file.
  Grant at: System Settings → Privacy & Security → Full Disk Access
```

This is only needed by `shoki doctor` itself, not by the test runtime. If you don't want to grant FDA to your terminal, you can skip the system-TCC check with `shoki doctor --skip-system-tcc` — the user-scope TCC database is usually enough.

### 8 · HELPER_MISSING

```
✗ ShokiRunner.app not found under any @shoki/binding-* install
  Likely cause: wrong platform binding selected or install was interrupted.
  Try: pnpm install --force
```

### 9 · HELPER_UNSIGNED

```
⚠ ShokiRunner.app is unsigned (dev build)
  TCC grants will reset every rebuild. This is expected for local dev.
  For CI or production, install a signed release from npm.
```

Not actually fatal for local work — it just means you'll re-grant permissions every time the helper changes. For CI you must use a signed release.

## Common first-run gotchas

- **"I granted it but doctor still says missing"** — toggle the grant off and back on in System Settings. macOS occasionally caches the old state.
- **"`tccutil reset` asks for my password but nothing changes"** — use the exact bundle ID `com.shoki.ShokiRunner` (not the binary path). Bundle IDs are what TCC keys on.
- **VoiceOver starts but announces nothing in tests** — almost always a missing Automation grant (→ VoiceOver specifically). The Accessibility grant is necessary but not sufficient.
- **Tests work locally, fail in CI** — your CI image lacks the grants. Use the [pre-baked tart image](/guides/ci/tart-selfhosted) or the [`shoki/setup-action`](/getting-started/ci-quickstart).

## Exit codes

`shoki doctor` exits non-zero on any failure so CI scripts can branch on the cause. The full table is in the [CLI reference](/api/cli).

## Recovery: `shoki restore-vo-settings`

If shoki crashes hard (SIGKILL, power loss, OOM killer), its normal cleanup hooks may not run and your Mac can be left with altered VoiceOver settings — typically muted audio or an unusual speech rate. Zig's signal handlers trap SIGINT/SIGTERM/SIGHUP, but **SIGKILL is unhandleable by any user process**, so a separate recovery path is required.

Every time `voiceOver.start()` runs, shoki writes a snapshot of your original VoiceOver plist values to `~/.shoki/vo-snapshot.plist` (override with `$SHOKI_SNAPSHOT_PATH`). On a clean `voiceOver.stop()` / `voiceOver.end()` that file is deleted — its presence means the previous shoki run terminated uncleanly.

Restore the saved settings at any time with:

```bash
shoki restore-vo-settings
```

Output when it works:

```
Restored 9 keys from /Users/you/.shoki/vo-snapshot.plist
```

### Flags

- `--path <path>` — Read the snapshot from a non-default path. Useful if you set `$SHOKI_SNAPSHOT_PATH` during the shoki run (common in CI).
- `--force` — Apply a snapshot older than 7 days. Without `--force` the command refuses stale snapshots to avoid restoring values from an older shoki version that no longer reflect your current defaults.
- `--dry-run` — Print which keys would be restored without actually writing them.

### Exit codes

- `0` — All keys restored successfully.
- `1` — No snapshot file at the given path (nothing to restore).
- `2` — Snapshot is unrecognized (missing `_shoki_snapshot_version` magic key), stale (>7 days, no `--force`), or one or more `defaults write` calls failed.

### Which keys are snapshotted?

The 9 VoiceOver keys shoki writes during `voiceOver.start()`, pulled from `com.apple.VoiceOver4` (Sonoma) or `~/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4.plist` (Sequoia+):

- `SCREnableAppleScript`
- `SCRCategories_SCRCategorySystemWide_SCRSoundComponentSettings_SCRDisableSound` (mute)
- `SCRCategories_SCRCategoryRotorAndTables_SCRGeneralSettings_SCRRateAsPercent` (speech rate)
- `SCRCategories_SCRCategoryActivities_SCRVerbositySettings_SCRVerbosityLevel`
- `SCRCategories_SCRCategoryHintsAndTips_SCRHintDelay_SCRShouldSpeakHints`
- `SCRCategories_SCRCategoryPunctuationAndSymbols_SCRPunctuationSettings_SCRPunctuationLevel`
- `SCRCategories_SCRCategoryVerbosity_SCRShouldSpeakStaticText`
- `SCRCategories_SCRCategoryVoices_SCRSpeakChannel` (voice)
- `SCRShouldAnnounceKeyCommands`

If shoki starts up and finds a stale snapshot file, that's informational — no automatic restore happens (we can't know whether the user's state in the meantime is intentional). Run `shoki restore-vo-settings` explicitly if you want to roll back.

## Next step

Once `shoki doctor` exits 0, head to the [Vitest quickstart](./vitest-quickstart) and run your first real test.
