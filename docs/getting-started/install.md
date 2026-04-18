# Install

Shoki's v1 target is **macOS + VoiceOver + Vitest browser mode**. If you're on Windows or Linux you can still install and run TypeScript-only unit tests, but the VoiceOver-dependent tests are gated behind `SHOKI_INTEGRATION=1` and only run on darwin hosts.

## Prerequisites

- **macOS 14 (Sonoma), 15 (Sequoia), or 26 (Tahoe)** for the VoiceOver path.
- **Node.js ≥ 24**. Shoki uses N-API via the [napi-zig](https://github.com/yuku-toolchain/napi-zig) binding loader. Older Node versions may work but 24+ is the CI baseline.
- **pnpm ≥ 10** (npm and yarn also work, but pnpm is what the monorepo uses and what the docs assume).
- **Playwright's Chromium** if you're using Vitest browser mode: `pnpm exec playwright install chromium`.

See the [Platform risk](/background/platform-risk) page for an honest discussion of the macOS-specific risks Shoki depends on before you commit to this library.

## Install the packages

```bash
pnpm add -D @shoki/sdk @shoki/vitest
```

Two user-installed packages cover every use case. What each one does:

| Package | Purpose |
|---------|---------|
| `@shoki/sdk` | Core TypeScript API + CLI + matcher functions. `voiceOver()` factory, `ScreenReaderHandle`, event types, `shoki` CLI (bin entry), and framework-agnostic matcher functions at the subpath `@shoki/sdk/matchers`. Loads the platform-specific binding via `optionalDependencies`. |
| `@shoki/vitest` | Vitest browser-mode plugin + matcher wiring. Registers 10 `BrowserCommand`s, auto-configures `poolOptions.threads.singleThread = true`, and exposes `@shoki/vitest/setup` which `expect.extend`s Shoki's matchers (`toHaveAnnounced`, `toHaveAnnouncedText`, `toHaveNoAnnouncement`, `toHaveStableLog`). |

The platform-specific binding (`@shoki/binding-darwin-arm64` or `@shoki/binding-darwin-x64`) is an **optional** dependency of `@shoki/sdk` — pnpm picks the right one for your OS + CPU at install time. No postinstall scripts, no `node-gyp`.

> **Heads up (v1.1):** prior versions shipped `@shoki/doctor` and `@shoki/matchers` as separate packages. They were merged into `@shoki/sdk` in the consolidation. The `shoki` CLI is now the `bin` entry of `@shoki/sdk`; matcher functions live at `@shoki/sdk/matchers`; and framework wiring (`expect.extend`) lives at `@shoki/vitest/setup`. See [CHANGELOG](https://github.com/shoki/shoki/blob/main/CHANGELOG.md) for the migration.

## Run the pre-flight check

```bash
npx shoki doctor
```

What it does:

- Detects your macOS version (14 / 15 / 26).
- Checks that VoiceOver is AppleScript-controllable (`com.apple.VoiceOver4.local.plist` → `SCREnableAppleScriptEnabled`).
- Checks that the ShokiRunner helper app has the Accessibility + Automation TCC grants it needs.
- Flags stale grants from prior binary signatures.

If TCC grants are missing, `shoki doctor --fix` emits a `LAUNCH_SETUP_APP` action and `shoki setup` launches the bundled **ShokiSetup.app** — a minimal GUI that triggers the Accessibility + Automation prompts cleanly on first run. One double-click replaces the multi-step System Settings walkthrough.

```bash
npx shoki setup        # launch ShokiSetup.app (opens TCC prompts)
npx shoki doctor --fix # auto-launch when grants are detected missing
```

If everything is green, you're ready to write a test. See [Permission setup](./permission-setup) for what to do if it isn't.

## Verify the install

A minimal sanity check without VoiceOver:

```bash
node -e "const { voiceOver } = require('@shoki/sdk'); console.log(typeof voiceOver);"
# expected: "function"
```

On a fresh macOS arm64 machine this also loads the native binding into memory; any errors at this point mean the `optionalDependencies` resolution didn't find the right platform package.

## What's next

- [Permission setup](./permission-setup) — fix whatever `shoki doctor` flagged.
- [Vitest quickstart](./vitest-quickstart) — write your first test in under 5 minutes.
- [CI quickstart](./ci-quickstart) — pick a runner topology and copy a workflow.

## Why just two packages?

Shoki ships **4 packages** total — 2 you install directly, and 2 platform bindings pulled in automatically as `optionalDependencies`:

- `@shoki/sdk` — core API, CLI (`bin: shoki`), and matcher functions at `@shoki/sdk/matchers`.
- `@shoki/vitest` — Vitest browser-mode plugin + `@shoki/vitest/setup` for `expect.extend`.
- `@shoki/binding-darwin-arm64` — platform binary (Zig-compiled `.node` + signed helper apps). Not installed by hand.
- `@shoki/binding-darwin-x64` — platform binary for Intel macs. Not installed by hand.

If you only need the capture core without Vitest ergonomics, `pnpm add -D @shoki/sdk` is enough — the matcher functions at `@shoki/sdk/matchers` are framework-agnostic and usable from Playwright Test, XCUITest, or a plain Node script.
