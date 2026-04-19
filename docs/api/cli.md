# `ogmios` CLI

Shipped as the `bin` entry of **`ogmios`** (`bin: { "ogmios": "./dist/cli/main.js" }`). Installing `ogmios` puts `ogmios` on your PATH via `npx`. Three subcommands: `setup` (default), `info`, and `restore-vo-settings`.

```bash
npx ogmios setup
npx ogmios info
```

> **Note:** `ogmios doctor` was removed in v0.1.7. Every failure it surfaced
> (TCC grants missing, VO AppleScript disabled, signature mismatch, stale
> TCC entries) either required the GUI setup flow to fix or required
> `sudo`/SIP-off steps the CLI cannot perform on the user's behalf.
> `ogmios setup` now owns the entire onboarding path.

## `ogmios setup`

Download + install `OgmiosRunner.app` + `OgmiosSetup.app` from GitHub Releases, then launch **OgmiosSetup.app** — a minimal Zig-compiled macOS GUI that triggers the Accessibility + Automation TCC prompts cleanly on first run. Replaces the multi-step System Settings walkthrough.

```bash
ogmios setup [options]
```

`setup` is the default subcommand — bare `ogmios` (or `npx ogmios`) invokes it.

### Flow

1. Check `<install-dir>/OgmiosRunner.app` and `<install-dir>/OgmiosSetup.app`. If both present and `--force` is not set, skip to step 6.
2. Fetch `ogmios-darwin-<arch>.zip` from `https://github.com/<owner>/ogmios/releases/download/app-v<version>/ogmios-darwin-<arch>.zip` using Node 24's native `fetch` (no new runtime dependencies).
3. Fetch the `.sha256` sidecar from the same release. Parses either `<64-hex>  <basename>` (shasum format) or a bare `<64-hex>`.
4. Hash the downloaded zip with `crypto.createHash('sha256')` and compare to the sidecar. Mismatch = hard error.
5. Unzip via `/usr/bin/ditto -x -k <zip> <install-dir>`, strip the quarantine attr via `xattr -dr com.apple.quarantine <installed bundles>`.
6. Unless `--skip-launch`, run `/usr/bin/open -W <install-dir>/OgmiosSetup.app` so the user can click through the TCC prompts. `-W` waits for the app to exit before the CLI returns.

### Options

| Flag | Description |
|------|-------------|
| `--force` | Redownload + reinstall even if the apps are already present. Use after an `app-v*` release bumps `compatibleAppVersion`. |
| `--no-download` | Fail with exit code 2 (`MISSING_DEP`) if apps are missing — never makes a network request. For pre-seeded CI images. |
| `--install-dir <path>` | Override the install directory. Default: `~/Applications/`. |
| `--skip-launch` | Download + install but don't auto-open `OgmiosSetup.app`. For headless bootstrap. |
| `--json` | Emit structured JSON output (`SetupResult`) instead of human output. For CI pipelines. |
| `--version <ver>` | Download a specific `OgmiosRunner.app` version. Default: the SDK's `compatibleAppVersion` from `packages/sdk/package.json`. |
| `--dry-run` | Print the resolved download URL + install dir without touching the network or filesystem. |
| `-h`, `--help` | Print help. |

### `--json` output shape

```ts
interface SetupResult {
  action: "noop" | "launched-only" | "downloaded" | "reinstalled";
  installDir: string;
  appsPresent: { ogmiosRunnerApp: boolean; ogmiosSetupApp: boolean };
  downloadedFromUrl?: string;
  sha256Verified?: boolean;
  launched: boolean;
  compatibleAppVersion: string;
}
```

Example:

```bash
$ ogmios setup --json
{
  "action": "downloaded",
  "installDir": "/Users/you/Applications",
  "appsPresent": { "ogmiosRunnerApp": true, "ogmiosSetupApp": true },
  "downloadedFromUrl": "https://github.com/thejackshelton/ogmios/releases/download/app-v0.1.6/ogmios-darwin-arm64.zip",
  "sha256Verified": true,
  "launched": true,
  "compatibleAppVersion": "0.1.6"
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
https://github.com/<owner>/ogmios/releases/download/app-v<version>/ogmios-<platform>.zip
https://github.com/<owner>/ogmios/releases/download/app-v<version>/ogmios-<platform>.zip.sha256
```

Where `<platform>` is `darwin-arm64` or `darwin-x64`, and `<version>` is `compatibleAppVersion` from the SDK's package.json (or `--version <ver>` override).

The release cadence is **independent** from the SDK's `v*` tag cadence. SDK tags (`v*`) publish the npm package; app tags (`app-v*`) publish the helper bundles. `compatibleAppVersion` in `packages/sdk/package.json` couples the two.

## `ogmios info`

Print diagnostic context. Use when filing a bug report.

```bash
ogmios info
```

Dumps (to stdout):

- `ogmios` package version.
- Node version + architecture.
- Platform (`darwin arm64` / `darwin x64`).
- Resolved `OgmiosRunner.app` path + source (`env`, `installed`, `npm`, or `dev`), or `<none>` if none of the known locations contained the helper.
- TCC.db accessibility for both the user scope (`~/Library/Application Support/com.apple.TCC/TCC.db`) and the system scope (`/Library/Application Support/com.apple.TCC/TCC.db`). The system scope normally reports `inaccessible (permission-denied)` unless your terminal has Full Disk Access — that is expected.

Paste the output into your GitHub issue and we can skip half the back-and-forth.

## `ogmios restore-vo-settings`

Escape hatch. If a crash (SIGKILL, OOM, power loss) interrupted a run before `ogmios` could restore the pre-run VoiceOver plist snapshot, this command re-applies it from `~/.ogmios/vo-snapshot.plist` (Plan 07-05).

```bash
ogmios restore-vo-settings [options]
```

### Options

| Flag | Description |
|------|-------------|
| `-p, --path <path>` | Snapshot file path (default: `~/.ogmios/vo-snapshot.plist`). Matches `$OGMIOS_SNAPSHOT_PATH` if it was set at run time. |
| `-f, --force` | Apply even if the snapshot is older than 7 days. |
| `--dry-run` | Print the keys that would be restored without calling `defaults write`. |

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success — snapshot applied, or `--dry-run` completed. |
| 1 | Snapshot file missing at the given path. |
| 2 | Snapshot is malformed, stale (>7 days without `--force`), or one or more `defaults write` calls failed. |

## Planned subcommands (v1.1+)

| Command | Purpose | Status |
|---------|---------|--------|
| `ogmios capture` | Standalone capture loop — boot VO, print events to stdout until SIGINT. Useful for ad-hoc debugging without a test framework. | Deferred to v1.1 |

## Troubleshooting

- **`ogmios: command not found`** — you invoked without `npx`. Use `npx ogmios ...` or add `./node_modules/.bin` to your PATH.
- **`ogmios setup` succeeds but tests still fail** — the TCC prompts fired but you clicked "Don't Allow", or you granted a different binary. Re-run `ogmios setup --force` (quits the helper, reopens it so macOS re-triggers the prompts). If that doesn't clear it, `tccutil reset Accessibility org.ogmios.runner && tccutil reset AppleEvents org.ogmios.runner` and re-run.
- **Works on my Mac, fails in CI** — CI macOS images usually don't have VoiceOver AppleScript control enabled. Our reference `cirruslabs/macos-*-ogmios` tart images do. If you're self-hosting, see the CI guide.
