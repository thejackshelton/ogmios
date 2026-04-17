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
pnpm add -D @shoki/sdk @shoki/vitest @shoki/matchers
```

What each one does:

| Package | Purpose |
|---------|---------|
| `@shoki/sdk` | Core TypeScript API. `voiceOver()` factory, `ScreenReaderHandle`, event types. Loads the platform-specific binding via `optionalDependencies`. |
| `@shoki/vitest` | Vitest browser-mode plugin. Registers 10 `BrowserCommand`s and auto-configures `poolOptions.threads.singleThread = true`. |
| `@shoki/matchers` | `expect(log)` matchers — `toHaveAnnounced({ role, name })`, `toHaveAnnouncedText(pattern)`, `toHaveNoAnnouncement()`, `toHaveStableLog({ quietMs })`. |

The platform-specific binding (`@shoki/binding-darwin-arm64` or `@shoki/binding-darwin-x64`) is an **optional** dependency of `@shoki/sdk` — pnpm picks the right one for your OS + CPU at install time. No postinstall scripts, no `node-gyp`.

## Run the pre-flight check

```bash
npx shoki doctor
```

What it does:

- Detects your macOS version (14 / 15 / 26).
- Checks that VoiceOver is AppleScript-controllable (`com.apple.VoiceOver4.local.plist` → `SCREnableAppleScriptEnabled`).
- Checks that the ShokiRunner helper app has the Accessibility + Automation TCC grants it needs.
- Flags stale grants from prior binary signatures.

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

## Why so many packages?

Each package is a deliberately small surface:

- The **SDK** can be used without Vitest (e.g. from a standalone Node script, Playwright Test, or XCUITest harness).
- The **matchers** don't depend on the SDK or the binding — they work against anything shaped like `ShokiEvent[]`.
- The **Vitest plugin** doesn't force you to ship matchers in your prod bundle.

If you only need the capture core, `pnpm add -D @shoki/sdk` is enough. Matchers and the Vitest plugin are ergonomic sugar over the event stream.
