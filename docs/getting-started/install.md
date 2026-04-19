# Install

Ogmios's v1 target is **macOS + VoiceOver + Vitest browser mode**. If you're on Windows or Linux you can still install and run TypeScript-only unit tests, but the VoiceOver-dependent tests are gated behind `OGMIOS_INTEGRATION=1` and only run on darwin hosts.

## Platform support (v0.1.1)

Ogmios v0.1.1 supports:

- macOS 14 (Sonoma), 15 (Sequoia), 26 (Tahoe)
- **Apple Silicon (arm64) only** — Intel Mac (x64) support is planned for v0.2

Most active Mac dev machines are Apple Silicon. If you're on an Intel Mac:
- Can you upgrade? v0.1.1 will Just Work.
- If not, [open a GitHub issue](https://github.com/thejackshelton/ogmios/issues) so we can prioritize the cross-compile build.

## Node + pnpm requirements

- Node 24 LTS
- pnpm 10
- **Playwright's Chromium** if you're using Vitest browser mode: `pnpm exec playwright install chromium`.

See the [Platform risk](/background/platform-risk) page for an honest discussion of the macOS-specific risks Ogmios depends on before you commit to this library.

## Install

One package. One setup command. Done.

### Quickstart

```bash
# Install (one command, one package)
npm install ogmios

# First-run setup: downloads OgmiosRunner.app + OgmiosSetup.app from GitHub Releases,
# installs to ~/Applications/, strips quarantine, opens the macOS TCC permission flow.
npx ogmios setup
```

That's it. `npm install ogmios` (or `pnpm add -D ogmios`, or `yarn add -D ogmios`) drops the `ogmios` CLI on your PATH via `npx`, and `ogmios setup` does the first-run download + install + permission dance once per machine.

### Why local install

Ogmios is both a library and a CLI, but the canonical path is a **local install** inside your test project. Your test files will do `import { voiceOver } from 'ogmios'`, which only resolves when `ogmios` lives in your project's `package.json` and `node_modules/`. The `ogmios` binary is available via `npx ogmios …` from that same local install — no global install needed to run `setup` or `info`.

This mirrors how Vitest and Playwright distribute: they're libraries your tests import, plus CLIs you invoke via `npx` / `pnpm exec`. Don't global-install them; don't global-install `ogmios` as the default.

### When global install makes sense

A **global install** works for setup-only use cases where you're not writing test code yet:

```bash
npm install -g ogmios
ogmios setup
```

Reasonable reasons to global install:

- **Evaluating ogmios** — you want to run `ogmios setup` + `ogmios info` on your Mac to see what the permission flow looks like before committing to a project.
- **Pre-provisioning a dev box or CI image** — grant TCC once at the machine level so later project installs skip the prompt.
- **Shared multi-project machines** — one TCC grant anchored on `~/Applications/OgmiosRunner.app` covers every project on that machine regardless of which `node_modules/` they use.

You'll still need a local install (`npm install ogmios` inside the project) to `import` ogmios in test code. Global install does not give your test files access to the library.

Precedent: tools like `pnpm` and `nvm` are global-by-default because they manage your environment. Ogmios is closer to Vitest and Playwright — a library consumed by your tests — which is why local is the default.

| Package | Purpose |
|---------|---------|
| `ogmios` | Everything user-facing: core TS API (`voiceOver()`, `ScreenReaderHandle`, events), the `ogmios` CLI (bin entry), matcher functions at `ogmios/matchers`, and the Vitest plugin at `ogmios/vitest` / `ogmios/vitest/setup` / `ogmios/vitest/browser`. |

The platform-specific binding (`ogmios-darwin-arm64` or `ogmios-darwin-x64`) is an **optional** dependency of `ogmios` — pnpm/npm picks the right one for your OS + CPU at install time. Never installed by hand. No postinstall scripts, no `node-gyp`.

> **Heads up (v0.1.1 — migrating from a prior name?):** this library
> went through several npm names before v0.1.1 GA shipped as
> `ogmios`. If you have code or CI pinned to one of the earlier names,
> the CHANGELOG has a full migration table covering every import path
> and CLI invocation change — see
> [CHANGELOG](https://github.com/thejackshelton/ogmios/blob/main/CHANGELOG.md).
> The short version: replace your import/install with `ogmios`, swap
> `@<old-scope>/vitest` for the subpath `ogmios/vitest`, and flip any
> `OGMIOS_INTEGRATION` env vars accordingly.

## First-run flow (`ogmios setup`)

`npx ogmios setup` is the one-and-done install. On first run it:

1. Checks `~/Applications/OgmiosRunner.app` and `~/Applications/OgmiosSetup.app`. If present and current, skips ahead to step 5.
2. Downloads `ogmios-darwin-<arch>.zip` (~10MB) from the [`app-v<version>` GitHub Release](https://github.com/thejackshelton/ogmios/releases) — no new runtime dependencies; uses Node 24's native `fetch`.
3. Verifies the download against the published `.sha256` sidecar via `crypto.createHash('sha256')`. Checksum mismatches are a hard error.
4. Unzips into `~/Applications/` (or `--install-dir <path>`) using `ditto`, preserving `.app` bundle metadata. Strips `com.apple.quarantine` via `xattr -dr` so the OS doesn't block launch.
5. Launches **OgmiosSetup.app** — a minimal Zig-compiled GUI that triggers the Accessibility + Automation TCC prompts cleanly. One click each, no System Settings dance.

### Flags

```bash
npx ogmios setup [options]
```

| Flag | Purpose |
|------|---------|
| `--force` | Redownload + reinstall even if the apps already exist. Use after an `app-v*` release bumps `compatibleAppVersion`. |
| `--no-download` | Fail with exit code 2 if apps are missing. For pre-seeded CI images — never makes a network request. |
| `--install-dir <path>` | Override `~/Applications/`. Useful for sandboxed CI or per-project installs. |
| `--skip-launch` | Download + install but don't auto-open `OgmiosSetup.app`. For headless bootstrap. |
| `--json` | Emit structured JSON (`SetupResult`) instead of human output. For CI pipelines. |
| `--version <ver>` | Override `compatibleAppVersion` from `packages/sdk/package.json`. For pinning. |
| `--dry-run` | Print the resolved download URL + install dir without touching network or disk. |

Full flag reference: [CLI API → `ogmios setup`](/api/cli#ogmios-setup).

## Verify the install

`ogmios setup` exits 0 once `OgmiosRunner.app` + `OgmiosSetup.app` are installed and the Accessibility + Automation TCC prompts fired. If `setup` succeeded, the install is done — macOS persists the grants across runs on that host. You don't need a separate verification step.

For a diagnostic dump (useful in bug reports) run:

```bash
npx ogmios info
```

which prints the Ogmios version, platform, resolved helper path, and TCC.db accessibility. See [CLI API → `ogmios info`](/api/cli#ogmios-info).

A minimal sanity check without VoiceOver:

```bash
node -e "const { voiceOver } = require('ogmios'); console.log(typeof voiceOver);"
# expected: "function"
```

On a fresh macOS arm64 machine this also loads the native binding into memory; any errors at this point mean the `optionalDependencies` resolution didn't find the right platform package.

## Why one package?

Previously the library shipped 4 user-facing packages (a prior-scope SDK, a prior-scope Vitest plugin, plus the two platform bindings). We collapsed to 1 user-facing package:

- **`ogmios`** — core API, CLI, matchers, Vitest plugin, browser-safe entry points — all behind subpath exports.
- **`ogmios-darwin-arm64` + `ogmios-darwin-x64`** — auto-installed via `optionalDependencies`. Never seen by end users.

Vitest and `@vitest/browser` are **optional peer deps** of `ogmios` — install them only if you use the Vitest plugin.

If you only need the capture core without Vitest ergonomics, `npm install ogmios` is still the whole install. Matcher functions at `ogmios/matchers` are framework-agnostic and usable from Playwright Test, XCUITest, or a plain Node script.

## What's next

- [Permission setup](./permission-setup) — what the TCC prompts are granting and how to re-trigger them if the first click was "Don't Allow".
- [Vitest quickstart](./vitest-quickstart) — write your first test in under 5 minutes.
- [CI quickstart](./ci-quickstart) — pick a runner topology and copy a workflow.
- [Troubleshooting](/guides/troubleshooting) — `ogmios setup` download errors, ENOENT, quarantine issues.
