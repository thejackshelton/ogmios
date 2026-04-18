# `shoki` CLI

Shipped as the `bin` entry of **`shoki`** (`bin: { "shoki": "./dist/cli/main.js" }`). Installing `shoki` puts `shoki` on your PATH via `npx`. Four subcommands today: `doctor`, `setup`, `info`, and `restore-vo-settings`.

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

Download + install `Shoki.app` + `Shoki Setup.app` from GitHub Releases, then launch **Shoki Setup.app** — a minimal Zig-compiled macOS GUI that triggers the Accessibility + Automation TCC prompts cleanly on first run. Replaces the multi-step System Settings walkthrough.

```bash
shoki setup [options]
```

### Flow

1. Check `<install-dir>/Shoki.app` and `<install-dir>/Shoki Setup.app`. If both present and `--force` is not set, skip to step 6.
2. Fetch `shoki-darwin-<arch>.zip` from `https://github.com/<owner>/shoki/releases/download/app-v<version>/shoki-darwin-<arch>.zip` using Node 24's native `fetch` (no new runtime dependencies).
3. Fetch the `.sha256` sidecar from the same release. Parses either `<64-hex>  <basename>` (shasum format) or a bare `<64-hex>`.
4. Hash the downloaded zip with `crypto.createHash('sha256')` and compare to the sidecar. Mismatch = hard error.
5. Unzip via `/usr/bin/ditto -x -k <zip> <install-dir>`, strip the quarantine attr via `xattr -dr com.apple.quarantine <installed bundles>`.
6. Unless `--skip-launch`, run `/usr/bin/open -W <install-dir>/Shoki Setup.app` so the user can click through the TCC prompts. `-W` waits for the app to exit before the CLI returns.

### Options

| Flag | Description |
|------|-------------|
| `--force` | Redownload + reinstall even if the apps are already present. Use after an `app-v*` release bumps `compatibleAppVersion`. |
| `--no-download` | Fail with exit code 2 (`MISSING_DEP`) if apps are missing — never makes a network request. For pre-seeded CI images. |
| `--install-dir <path>` | Override the install directory. Default: `~/Applications/`. |
| `--skip-launch` | Download + install but don't auto-open `Shoki Setup.app`. For headless bootstrap. |
| `--json` | Emit structured JSON output (`SetupResult`) instead of human output. For CI pipelines. |
| `--version <ver>` | Download a specific `Shoki.app` version. Default: the SDK's `compatibleAppVersion` from `packages/sdk/package.json`. |
| `--dry-run` | Print the resolved download URL + install dir without touching the network or filesystem. |
| `-h`, `--help` | Print help. |

### `--json` output shape

```ts
interface SetupResult {
  action: "noop" | "launched-only" | "downloaded" | "reinstalled";
  installDir: string;
  appsPresent: { shokiApp: boolean; shokiSetupApp: boolean };
  downloadedFromUrl?: string;
  sha256Verified?: boolean;
  launched: boolean;
  compatibleAppVersion: string;
}
```

Example:

```bash
$ shoki setup --json
{
  "action": "downloaded",
  "installDir": "/Users/you/Applications",
  "appsPresent": { "shokiApp": true, "shokiSetupApp": true },
  "downloadedFromUrl": "https://github.com/shoki/shoki/releases/download/app-v0.1.0/shoki-darwin-arm64.zip",
  "sha256Verified": true,
  "launched": true,
  "compatibleAppVersion": "0.1.0"
}
```

### Exit codes

| Code | Name | Meaning |
|------|------|---------|
| 0 | `OK` | Success — or `--dry-run` returned cleanly. |
| 1 | `GENERIC` | Catch-all (checksum mismatch, network error, unzip failure — all currently route here with an attached error message; promoted to dedicated codes 3–5 in a future release). |
| 2 | `MISSING_DEP` | `--no-download` passed and apps are absent. |
| 6 | `QUARANTINE` | `xattr -dr` returned an unexpected non-0/non-1 exit. |
| 7 | `UNSUPPORTED_PLATFORM` | Not darwin-arm64 or darwin-x64. |

### Download URL pattern

```
https://github.com/<owner>/shoki/releases/download/app-v<version>/shoki-<platform>.zip
https://github.com/<owner>/shoki/releases/download/app-v<version>/shoki-<platform>.zip.sha256
```

Where `<platform>` is `darwin-arm64` or `darwin-x64`, and `<version>` is `compatibleAppVersion` from the SDK's package.json (or `--version <ver>` override).

The release cadence is **independent** from the SDK's `v*` tag cadence. SDK tags (`v*`) publish the npm package; app tags (`app-v*`) publish the helper bundles. `compatibleAppVersion` in `packages/sdk/package.json` couples the two.

### Relation to `shoki doctor --fix`

`shoki doctor` emits a `launch-setup-app` fix action ahead of the legacy `open-system-settings` deep link when `TCC_MISSING_ACCESSIBILITY` or `TCC_MISSING_AUTOMATION` fires. `--fix` picks the GUI path automatically; manual users can still copy the deep-link URL from the JSON report.

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
