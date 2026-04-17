# @shoki/matchers

Vitest `expect` matchers over `ShokiEvent[]` logs captured by `@shoki/sdk`.

## Install

```sh
pnpm add -D @shoki/matchers
```

Add to `vitest.config.ts`:

```ts
export default defineConfig({
  test: { setupFiles: ['@shoki/matchers/setup'] },
});
```

## Matchers

- `expect(log).toHaveAnnounced({ role, name, source?, interrupt? })` — match by semantic event shape. `role` and `name` accept string or RegExp.
- `expect(log).toHaveAnnouncedText(pattern)` — match any event phrase against a string substring or RegExp.
- `expect(log).toHaveNoAnnouncement()` — assert the log is empty.
- `await expect(log).toHaveStableLog({ quietMs })` — assert the log array reference stays the same length across a quiet window.

All four matchers work against both `ShokiEvent[]` (Node-side, with `tsNanos: bigint`) and `WireShokiEvent[]` (browser-side RPC payloads with `tsMs: number`).

See Plan 04-01 in the shoki monorepo for implementation details.
