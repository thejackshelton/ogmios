# @shoki/vitest

Vitest browser-mode integration for Shoki. Registers BrowserCommands that bridge browser tests to `@shoki/sdk` over tinyRPC, and exposes `@shoki/vitest/setup` which wires Shoki's matchers (from `@shoki/sdk/matchers`) into Vitest's `expect` via `expect.extend`.

## Install

```sh
pnpm add -D @shoki/vitest @shoki/sdk
```

The matcher functions live inside `@shoki/sdk/matchers` (framework-agnostic) and the `expect.extend` wiring lives at `@shoki/vitest/setup`. The platform binding (`@shoki/binding-darwin-arm64` or `-x64`) is installed automatically as an `optionalDependency` of `@shoki/sdk`.

See `examples/vitest-browser-react` for the canonical end-to-end setup.

## Usage

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { shokiVitest } from '@shoki/vitest';

export default defineConfig({
  plugins: [shokiVitest()],
  test: {
    setupFiles: ['@shoki/vitest/setup'],
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [{ browser: 'chromium' }],
    },
  },
});
```

```ts
// test.tsx
import { voiceOver } from '@shoki/vitest/browser';
import { page } from '@vitest/browser/context';
import { expect, test } from 'vitest';

test('submit announces', async () => {
  const session = await voiceOver.start({ mute: true });
  await page.getByRole('button', { name: 'Submit' }).click();
  const log = await session.awaitStable({ quietMs: 500 });
  expect(log).toHaveAnnounced({ role: 'button', name: 'Submit' });
  await session.stop();
});
```

## How it works

1. The Vitest plugin registers 10 `BrowserCommands` at `config` hook time (VITEST-01).
2. Because any file imports `@shoki/vitest/browser`, the plugin auto-sets `poolOptions.threads.singleThread = true` (VITEST-03) — VoiceOver is a system singleton.
3. `voiceOver.start()` on the browser side dispatches over Vitest's tinyRPC WebSocket to the Node-side `SessionStore`, which boots VoiceOver via `@shoki/sdk`.
4. All RPC payloads are structured-clone-safe (VITEST-06): timestamps are millisecond numbers, not bigints; `lastPhrase` returns `null` instead of `undefined`.

## Errors

- `ShokiConcurrentTestError` — thrown if `voiceOver.start()` is called inside a `test.concurrent` (VITEST-04).
- `ShokiPlatformUnsupportedError` — non-macOS host.
- `ShokiSessionNotFoundError` — the session id is unknown or already stopped.
- `ShokiBindingNotAvailableError` — the native binding failed to load.
