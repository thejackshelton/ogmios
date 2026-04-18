# Install

Dicta's v1 target is **macOS + VoiceOver + Vitest browser mode**. If you're on Windows or Linux you can still install and run TypeScript-only unit tests, but the VoiceOver-dependent tests are gated behind `SHOKI_INTEGRATION=1` and only run on darwin hosts.

## Platform support (v0.1.0)

Dicta v0.1.0 supports:

- macOS 14 (Sonoma), 15 (Sequoia), 26 (Tahoe)
- **Apple Silicon (arm64) only** — Intel Mac (x64) support is planned for v0.2

Most active Mac dev machines are Apple Silicon. If you're on an Intel Mac:
- Can you upgrade? v0.1.0 will Just Work.
- If not, [open a GitHub issue](https://github.com/<org>/shoki/issues) so we can prioritize the cross-compile build.

## Node + pnpm requirements

- Node 24 LTS
- pnpm 10
- **Playwright's Chromium** if you're using Vitest browser mode: `pnpm exec playwright install chromium`.

See the [Platform risk](/background/platform-risk) page for an honest discussion of the macOS-specific risks Dicta depends on before you commit to this library.

## Install

One package. One setup command. Done.

### Quickstart

```bash
# Install (one command, one package)
npm install dicta

# First-run setup: downloads Shoki.app from GitHub Releases, installs to
# ~/Applications/, strips quarantine, opens the macOS TCC permission flow.
npx dicta setup

# Verify everything is wired
npx dicta doctor
```

That's it. `npm install dicta` (or `pnpm add -D dicta`, or `yarn add -D dicta`) drops the `dicta` CLI on your PATH via `npx`, and `dicta setup` does the first-run download + install + permission dance once per machine.

> **Note (v0.1):** The helper application retains its original "Shoki" file names (`Shoki.app`, `Shoki Setup.app`) for v0.1. `npx dicta setup` will briefly launch a window labeled "Shoki Setup" — expected behavior. Full helper rebrand in v0.2.

### Why local install

Dicta is both a library and a CLI, but the canonical path is a **local install** inside your test project. Your test files will do `import { voiceOver } from 'dicta'`, which only resolves when `dicta` lives in your project's `package.json` and `node_modules/`. The `dicta` binary is available via `npx dicta …` from that same local install — no global install needed to run `setup` or `doctor`.

This mirrors how Vitest and Playwright distribute: they're libraries your tests import, plus CLIs you invoke via `npx` / `pnpm exec`. Don't global-install them; don't global-install `dicta` as the default.

### When global install makes sense

A **global install** works for setup-only use cases where you're not writing test code yet:

```bash
npm install -g dicta
dicta setup
```

Reasonable reasons to global install:

- **Evaluating dicta** — you want to run `dicta setup` + `dicta doctor` on your Mac to see what the permission flow looks like before committing to a project.
- **Pre-provisioning a dev box or CI image** — grant TCC once at the machine level so later project installs skip the prompt.
- **Shared multi-project machines** — one TCC grant anchored on `~/Applications/Shoki.app` covers every project on that machine regardless of which `node_modules/` they use.

You'll still need a local install (`npm install dicta` inside the project) to `import` dicta in test code. Global install does not give your test files access to the library.

Precedent: tools like `pnpm` and `nvm` are global-by-default because they manage your environment. Dicta is closer to Vitest and Playwright — a library consumed by your tests — which is why local is the default.

| Package | Purpose |
|---------|---------|
| `dicta` | Everything user-facing: core TS API (`voiceOver()`, `ScreenReaderHandle`, events), the `dicta` CLI (bin entry), matcher functions at `dicta/matchers`, and the Vitest plugin at `dicta/vitest` / `dicta/vitest/setup` / `dicta/vitest/browser`. |

The platform-specific binding (`@shoki/binding-darwin-arm64` or `@shoki/binding-darwin-x64`) is an **optional** dependency of `dicta` — pnpm/npm picks the right one for your OS + CPU at install time. Never installed by hand. No postinstall scripts, no `node-gyp`.

> **Heads up (v0.1.0 — naming saga):** this library has had a few name changes en route to v0.1 GA.
> - Previously shipped as `@shoki/doctor` + `@shoki/matchers` + `@shoki/sdk` + `@shoki/vitest` (Phase 8 consolidated them).
> - Phase 10 Plan 01 renamed `@shoki/sdk` → unscoped `shoki`.
> - A v0.1.0 attempt under the unscoped name hit npm's E403 anti-typosquatting filter vs. `shiki`.
> - Quick task 260418-f0a re-scoped to `@shoki/core`, but the `@shoki` npm org creation was subsequently denied (likely the same anti-typosquatting policy).
> - **v0.1.0 GA ships as `dicta`** — unscoped, distinctive (Latin: "things said"), no npm name saga. The CLI bin command also changes to `dicta`.
>
> Import + CLI migration for v0.1.0 GA:
> - `@shoki/sdk` → `dicta`
> - `shoki` (unscoped) → `dicta`
> - `@shoki/core` → `dicta`
> - `@shoki/vitest` → `dicta/vitest` (subpath export)
> - `@shoki/vitest/setup` → `dicta/vitest/setup`
> - `@shoki/vitest/browser` → `dicta/vitest/browser`
> - `@shoki/sdk/matchers` / `@shoki/core/matchers` → `dicta/matchers`
> - CLI: `npx shoki …` → `npx dicta …`
>
> See [CHANGELOG](https://github.com/shoki/shoki/blob/main/CHANGELOG.md) for the migration.

## First-run flow (`dicta setup`)

`npx dicta setup` is the one-and-done install. On first run it:

1. Checks `~/Applications/Shoki.app` and `~/Applications/Shoki Setup.app`. If present and current, skips ahead to step 5.
2. Downloads `shoki-darwin-<arch>.zip` (~10MB) from the [`app-v<version>` GitHub Release](https://github.com/shoki/shoki/releases) — no new runtime dependencies; uses Node 24's native `fetch`.
3. Verifies the download against the published `.sha256` sidecar via `crypto.createHash('sha256')`. Checksum mismatches are a hard error.
4. Unzips into `~/Applications/` (or `--install-dir <path>`) using `ditto`, preserving `.app` bundle metadata. Strips `com.apple.quarantine` via `xattr -dr` so the OS doesn't block launch.
5. Launches **Shoki Setup.app** — a minimal Zig-compiled GUI that triggers the Accessibility + Automation TCC prompts cleanly. One click each, no System Settings dance.

### Flags

```bash
npx dicta setup [options]
```

| Flag | Purpose |
|------|---------|
| `--force` | Redownload + reinstall even if the apps already exist. Use after an `app-v*` release bumps `compatibleAppVersion`. |
| `--no-download` | Fail with exit code 2 if apps are missing. For pre-seeded CI images — never makes a network request. |
| `--install-dir <path>` | Override `~/Applications/`. Useful for sandboxed CI or per-project installs. |
| `--skip-launch` | Download + install but don't auto-open `Shoki Setup.app`. For headless bootstrap. |
| `--json` | Emit structured JSON (`SetupResult`) instead of human output. For CI pipelines. |
| `--version <ver>` | Override `compatibleAppVersion` from `packages/sdk/package.json`. For pinning. |
| `--dry-run` | Print the resolved download URL + install dir without touching network or disk. |

Full flag reference: [CLI API → `dicta setup`](/api/cli#dicta-setup).

## Verify the install

```bash
npx dicta doctor --json
```

What doctor checks:

- macOS version (14 / 15 / 26).
- VoiceOver AppleScript-controllability (`com.apple.VoiceOver4.local.plist` → `SCREnableAppleScriptEnabled`).
- `Shoki.app` + `Shoki Setup.app` discoverable in `~/Applications/`.
- Accessibility + Automation TCC grants on the helper.
- Stale grants from prior binary signatures.

Exit code 0 means you're ready to write a test. Non-zero exit identifies which check failed — see [Exit codes](/api/cli#exit-codes).

A minimal sanity check without VoiceOver:

```bash
node -e "const { voiceOver } = require('dicta'); console.log(typeof voiceOver);"
# expected: "function"
```

On a fresh macOS arm64 machine this also loads the native binding into memory; any errors at this point mean the `optionalDependencies` resolution didn't find the right platform package.

## Why one package?

Previously Dicta shipped 4 user-facing packages (`@shoki/sdk`, `@shoki/vitest`, plus the two bindings). We collapsed to 1 user-facing package:

- **`dicta`** — core API, CLI, matchers, Vitest plugin, browser-safe entry points — all behind subpath exports.
- **`@shoki/binding-darwin-arm64` + `@shoki/binding-darwin-x64`** — auto-installed via `optionalDependencies`. Never seen by end users. The napi platform-package pattern requires them to stay scoped; the bindings keep their `@shoki` scope for v0.1.

Vitest and `@vitest/browser` are **optional peer deps** of `dicta` — install them only if you use the Vitest plugin.

If you only need the capture core without Vitest ergonomics, `npm install dicta` is still the whole install. Matcher functions at `dicta/matchers` are framework-agnostic and usable from Playwright Test, XCUITest, or a plain Node script.

## What's next

- [Permission setup](./permission-setup) — fix whatever `dicta doctor` flagged.
- [Vitest quickstart](./vitest-quickstart) — write your first test in under 5 minutes.
- [CI quickstart](./ci-quickstart) — pick a runner topology and copy a workflow.
- [Troubleshooting](/guides/troubleshooting) — `dicta setup` download errors, ENOENT, quarantine issues.
