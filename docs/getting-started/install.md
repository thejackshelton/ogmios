# Install

Shoki's v1 target is **macOS + VoiceOver + Vitest browser mode**. If you're on Windows or Linux you can still install and run TypeScript-only unit tests, but the VoiceOver-dependent tests are gated behind `SHOKI_INTEGRATION=1` and only run on darwin hosts.

## Prerequisites

- **macOS 14 (Sonoma), 15 (Sequoia), or 26 (Tahoe)** for the VoiceOver path.
- **Node.js ≥ 24**. Shoki uses N-API via the [napi-zig](https://github.com/yuku-toolchain/napi-zig) binding loader. Older Node versions may work but 24+ is the CI baseline.
- **pnpm ≥ 10** (npm and yarn also work, but pnpm is what the monorepo uses and what the docs assume).
- **Playwright's Chromium** if you're using Vitest browser mode: `pnpm exec playwright install chromium`.

See the [Platform risk](/background/platform-risk) page for an honest discussion of the macOS-specific risks Shoki depends on before you commit to this library.

## Install

One package. One setup command. Done.

### Quickstart

```bash
# Install (one command, one package)
npm install shoki

# First-run setup: downloads Shoki.app from GitHub Releases, installs to
# ~/Applications/, strips quarantine, opens the macOS TCC permission flow.
npx shoki setup

# Verify everything is wired
npx shoki doctor
```

That's it. `npm install shoki` (or `pnpm add -D shoki`, or `yarn add -D shoki`) drops `shoki` on your PATH via `npx`, and `shoki setup` does the first-run download + install + permission dance once per machine.

### Why local install

Shoki is both a library and a CLI, but the canonical path is a **local install** inside your test project. Your test files will do `import { voiceOver } from 'shoki'`, which only resolves when shoki lives in your project's `package.json` and `node_modules/`. The `shoki` binary is available via `npx shoki …` from that same local install — no global install needed to run `setup` or `doctor`.

This mirrors how Vitest and Playwright distribute: they're libraries your tests import, plus CLIs you invoke via `npx` / `pnpm exec`. Don't global-install them; don't global-install shoki as the default.

### When global install makes sense

A **global install** works for setup-only use cases where you're not writing test code yet:

```bash
npm install -g shoki
shoki setup
```

Reasonable reasons to global install:

- **Evaluating shoki** — you want to run `shoki setup` + `shoki doctor` on your Mac to see what the permission flow looks like before committing to a project.
- **Pre-provisioning a dev box or CI image** — grant TCC once at the machine level so later project installs skip the prompt.
- **Shared multi-project machines** — one TCC grant anchored on `~/Applications/Shoki.app` covers every project on that machine regardless of which `node_modules/` they use.

You'll still need a local install (`npm install shoki` inside the project) to `import` shoki in test code. Global install does not give your test files access to the library.

Precedent: tools like `pnpm` and `nvm` are global-by-default because they manage your environment. Shoki is closer to Vitest and Playwright — a library consumed by your tests — which is why local is the default.

| Package | Purpose |
|---------|---------|
| `shoki` | Everything user-facing: core TS API (`voiceOver()`, `ScreenReaderHandle`, events), the `shoki` CLI (bin entry), matcher functions at `shoki/matchers`, and the Vitest plugin at `shoki/vitest` / `shoki/vitest/setup` / `shoki/vitest/browser`. |

The platform-specific binding (`@shoki/binding-darwin-arm64` or `@shoki/binding-darwin-x64`) is an **optional** dependency of `shoki` — pnpm/npm picks the right one for your OS + CPU at install time. Never installed by hand. No postinstall scripts, no `node-gyp`.

> **Heads up (v1.1):** prior versions shipped `@shoki/doctor`, `@shoki/matchers`, `@shoki/sdk`, and `@shoki/vitest` as separate packages. In v1.1 they all consolidated into the unscoped **`shoki`** package:
> - `@shoki/sdk` → `shoki`
> - `@shoki/vitest` → `shoki/vitest` (subpath export)
> - `@shoki/vitest/setup` → `shoki/vitest/setup`
> - `@shoki/vitest/browser` → `shoki/vitest/browser`
> - `@shoki/sdk/matchers` → `shoki/matchers`
>
> See [CHANGELOG](https://github.com/shoki/shoki/blob/main/CHANGELOG.md) for the migration.

## First-run flow (`shoki setup`)

`npx shoki setup` is the one-and-done install. On first run it:

1. Checks `~/Applications/Shoki.app` and `~/Applications/Shoki Setup.app`. If present and current, skips ahead to step 5.
2. Downloads `shoki-darwin-<arch>.zip` (~10MB) from the [`app-v<version>` GitHub Release](https://github.com/shoki/shoki/releases) — no new runtime dependencies; uses Node 24's native `fetch`.
3. Verifies the download against the published `.sha256` sidecar via `crypto.createHash('sha256')`. Checksum mismatches are a hard error.
4. Unzips into `~/Applications/` (or `--install-dir <path>`) using `ditto`, preserving `.app` bundle metadata. Strips `com.apple.quarantine` via `xattr -dr` so the OS doesn't block launch.
5. Launches **Shoki Setup.app** — a minimal Zig-compiled GUI that triggers the Accessibility + Automation TCC prompts cleanly. One click each, no System Settings dance.

### Flags

```bash
npx shoki setup [options]
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

Full flag reference: [CLI API → `shoki setup`](/api/cli#shoki-setup).

## Verify the install

```bash
npx shoki doctor --json
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
node -e "const { voiceOver } = require('shoki'); console.log(typeof voiceOver);"
# expected: "function"
```

On a fresh macOS arm64 machine this also loads the native binding into memory; any errors at this point mean the `optionalDependencies` resolution didn't find the right platform package.

## Why one package?

Previously Shoki shipped 4 user-facing packages (`@shoki/sdk`, `@shoki/vitest`, plus the two bindings). We collapsed to 1 user-facing package:

- **`shoki`** — core API, CLI, matchers, Vitest plugin, browser-safe entry points — all behind subpath exports.
- **`@shoki/binding-darwin-arm64` + `@shoki/binding-darwin-x64`** — auto-installed via `optionalDependencies`. Never seen by end users. The napi platform-package pattern requires them to stay scoped.

Vitest and `@vitest/browser` are **optional peer deps** of `shoki` — install them only if you use the Vitest plugin.

If you only need the capture core without Vitest ergonomics, `npm install shoki` is still the whole install. Matcher functions at `shoki/matchers` are framework-agnostic and usable from Playwright Test, XCUITest, or a plain Node script.

## What's next

- [Permission setup](./permission-setup) — fix whatever `shoki doctor` flagged.
- [Vitest quickstart](./vitest-quickstart) — write your first test in under 5 minutes.
- [CI quickstart](./ci-quickstart) — pick a runner topology and copy a workflow.
- [Troubleshooting](/guides/troubleshooting) — `shoki setup` download errors, ENOENT, quarantine issues.
