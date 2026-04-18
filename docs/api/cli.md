# `shoki` CLI

Shipped as the `bin` entry of **`@shoki/sdk`** (`bin: { "shoki": "./dist/cli/main.js" }`). Installing `@shoki/sdk` puts `shoki` on your PATH via `npx`. Four subcommands today: `doctor`, `setup`, `info`, and `restore-vo-settings`.

```bash
npx shoki doctor
npx shoki setup
npx shoki info
```

## `shoki doctor`

Diagnose VoiceOver + TCC + helper state on the current macOS host.

### Usage

```bash
shoki doctor [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--fix` | Attempt safe automated fixes (plist writes when SIP permits). Never touches TCC.db. |
| `--json` | Machine-readable JSON output. Required for CI scripting. |
| `--quiet` | Suppress all stdout except the final exit code. Useful in piped scripts. |
| `--skip-system-tcc` | Skip the system TCC.db check (avoids Full Disk Access requirement). |
| `--no-color` | Disable ANSI colors. Auto-detected when stdout is not a TTY. |
| `--version` | Print `shoki` version and exit. |
| `--help` | Print help. |

### Exit codes

Full table — match against these in CI scripts to branch on the cause of failure.

| Code | Name | Meaning |
|------|------|---------|
| 0 | `OK` | Ready to run shoki. |
| 1 | `UNKNOWN_ERROR` | Catch-all — an exception we didn't map to a specific code. File a bug. |
| 2 | `OS_UNSUPPORTED` | macOS version < 14 or > 26 (current support window). |
| 3 | `VO_APPLESCRIPT_DISABLED` | `SCREnableAppleScriptEnabled` plist key is not `true`. Run with `--fix`. |
| 4 | `TCC_MISSING_ACCESSIBILITY` | ShokiRunner.app lacks Accessibility grant. Manual grant required. |
| 5 | `TCC_MISSING_AUTOMATION` | ShokiRunner.app lacks Automation grant for VoiceOver. Manual grant required. |
| 6 | `SIGNATURE_MISMATCH` | TCC entry exists but `csreq` doesn't match current helper signature. `tccutil reset` + re-grant. |
| 7 | `NEEDS_FULL_DISK_ACCESS` | Can't read system TCC.db; doctor needs FDA on the terminal. Or use `--skip-system-tcc`. |
| 8 | `HELPER_MISSING` | `ShokiRunner.app` not found under any `@shoki/binding-*` install. |
| 9 | `HELPER_UNSIGNED` | Running against a dev build (unsigned helper). Fine locally, fatal in CI. |

### Human output example

```
shoki doctor (0.1.0)

✓ macOS 14.6 (Sonoma) — supported
✓ VoiceOver AppleScript control enabled
✓ ShokiRunner.app found at /…/node_modules/@shoki/binding-darwin-arm64/helper/ShokiRunner.app
✓ ShokiRunner.app is Developer ID signed
✓ Accessibility grant present for ShokiRunner.app
✓ Automation grant present for ShokiRunner.app → VoiceOver

ready to run shoki · exit 0
```

On failure:

```
shoki doctor (0.1.0)

✓ macOS 14.6 (Sonoma) — supported
✗ VoiceOver AppleScript control disabled
  Fix: sudo defaults write /Library/Preferences/com.apple.VoiceOver4.local SCREnableAppleScriptEnabled -bool true
  Or:  shoki doctor --fix
✗ Automation grant missing for ShokiRunner.app → VoiceOver
  Grant at: System Settings → Privacy & Security → Automation
  Open: open "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"

not ready · exit 3
```

### JSON output example

```bash
shoki doctor --json --quiet
```

```json
{
  "ok": false,
  "exit_code": 3,
  "exit_name": "VO_APPLESCRIPT_DISABLED",
  "macos": { "version": "14.6", "codename": "Sonoma", "supported": true },
  "voiceover": { "applescript_enabled": false, "plist_path": "/Library/Preferences/com.apple.VoiceOver4.local.plist" },
  "helper": { "path": "...", "signed": true, "signature_ok": true },
  "tcc": { "accessibility": "granted", "automation": "missing", "stale_entries": [] },
  "checks_run": ["macos", "vo-applescript", "helper", "tcc"],
  "elapsed_ms": 487
}
```

The JSON shape is part of the public contract; the `exit_name` field is the canonical stable identifier.

## `shoki info`

Print diagnostic context. Use when filing a bug report.

```bash
shoki info
```

Dumps (to stdout):

- `shoki` package versions (sdk, vitest).
- macOS version + codename.
- Node version + arch.
- pnpm version (if present in PATH).
- Resolved paths for `@shoki/binding-*` installations (includes both `ShokiRunner.app` and `ShokiSetup.app` paths).
- Whether `codesign -dvvv` on the helper succeeds.

Paste the output into your GitHub issue and we can skip half the back-and-forth.

### Flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable output. |
| `--help` | Print help. |

## `shoki setup`

Launch the bundled **ShokiSetup.app** — a minimal Zig-compiled macOS GUI that triggers the Accessibility + Automation TCC prompts cleanly on first run. Replaces the multi-step System Settings walkthrough.

```bash
shoki setup [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Print the resolved `ShokiSetup.app` path without launching it. Useful for CI diagnostics. |
| `-h`, `--help` | Print help. |

### Resolver chain

`shoki setup` locates the bundle in this order:

1. `$SHOKI_SETUP_APP_PATH` — explicit override.
2. `node_modules/@shoki/binding-darwin-arm64/helper/ShokiSetup.app` (or `-x64`, depending on host arch).
3. `helper/.build/ShokiSetup.app` — the monorepo dev-build path.

If none resolve, exits `HELPER_MISSING` (8).

### Relation to `shoki doctor --fix`

`shoki doctor` now emits a `launch-setup-app` fix action ahead of the legacy `open-system-settings` deep link when `TCC_MISSING_ACCESSIBILITY` or `TCC_MISSING_AUTOMATION` fires. `--fix` picks the GUI path automatically; manual users can still copy the deep-link URL from the JSON report.

## Planned subcommands (v1.1+)

| Command | Purpose | Status |
|---------|---------|--------|
| `shoki capture` | Standalone capture loop — boot VO, print events to stdout until SIGINT. Useful for ad-hoc debugging without a test framework. | Deferred to v1.1 |

## Exit code semantics

- **0** — every check passed.
- **Non-zero** — some check failed. Specific code identifies the first failing category so scripts can branch.
- If multiple checks fail, the exit code is the highest one (reflects the most-blocking issue; e.g. HELPER_MISSING is more severe than TCC_MISSING).

## Troubleshooting

- **`shoki: command not found`** — you invoked without `npx`. Use `npx shoki ...` or add `./node_modules/.bin` to your PATH.
- **Exits 7 (NEEDS_FULL_DISK_ACCESS)** — grant FDA to your terminal, or use `--skip-system-tcc`.
- **Doctor says all green but tests still fail** — likely a per-process TCC issue in your test runner. Try running the test harness from the same terminal where `shoki doctor` passed.
