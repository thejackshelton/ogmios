# `@shoki/matchers`

Vitest `expect` matchers over `ShokiEvent[]` (or `WireShokiEvent[]`) logs. For a narrative introduction with full examples, see the [Matchers guide](/guides/matchers). This page is the type reference.

## Setup

```ts
// vitest.config.ts
export default defineConfig({
  test: { setupFiles: ["@shoki/matchers/setup"] },
});
```

This registers the four matchers globally and augments Vitest's `expect` type to know about them.

## Shared types

```ts
/** Node-side event. */
interface ShokiEvent {
  phrase: string;
  tsNanos: bigint;
  source: "applescript" | "ax";
  interrupt?: boolean;
  role?: string;
  name?: string;
}

/** Browser-side / RPC-safe variant. `tsMs: number` instead of `tsNanos: bigint`. */
interface WireShokiEvent {
  phrase: string;
  tsMs: number;
  source: "applescript" | "ax";
  interrupt?: boolean;
  role?: string;
  name?: string;
}

type AnyLog = ShokiEvent[] | WireShokiEvent[];

/** String-or-RegExp matcher for role/name. */
type StringMatcher = string | RegExp;
```

All four matchers accept either array shape.

## `toHaveAnnounced(criteria)`

Asserts the log contains at least one event matching the given shape.

```ts
interface AnnouncementCriteria {
  role?: StringMatcher;
  name?: StringMatcher;
  source?: "applescript" | "ax";
  interrupt?: boolean;
}

expect(log: AnyLog).toHaveAnnounced(criteria: AnnouncementCriteria): void;
```

**Matching semantics:**

- Empty criteria (`{}`) matches any event; equivalent to "log is not empty".
- `role: "button"` → exact string match on the event's `role`.
- `role: /button/i` → regex test against the event's `role`.
- Undefined fields are unconstrained (don't filter on them).
- All specified fields must match on the **same event** (not distributed across the log).

**Error output** includes the full log with indexed entries for debuggability.

### Examples

```ts
expect(log).toHaveAnnounced({ role: "button", name: "Submit" });
expect(log).toHaveAnnounced({ name: /submit/i });
expect(log).toHaveAnnounced({ role: "status", source: "ax" });
expect(log).not.toHaveAnnounced({ role: "alert" });
```

## `toHaveAnnouncedText(pattern)`

Asserts at least one event's `phrase` matches `pattern`.

```ts
expect(log: AnyLog).toHaveAnnouncedText(pattern: string | RegExp): void;
```

**Matching semantics:**

- `string` → substring match (case-sensitive).
- `RegExp` → regex test (respects flags like `/i`).

### Examples

```ts
expect(log).toHaveAnnouncedText("Form submitted");
expect(log).toHaveAnnouncedText(/email is required/i);
expect(log).not.toHaveAnnouncedText("error");
```

## `toHaveNoAnnouncement()`

Asserts the log is empty.

```ts
expect(log: AnyLog).toHaveNoAnnouncement(): void;
```

**Error output** includes the unexpected events that were captured.

### Example

```ts
// Decorative animation should be silent.
await doTheDecorativeAnimation();
const log = await session.awaitStable({ quietMs: 500 });
expect(log).toHaveNoAnnouncement();
```

## `toHaveStableLog({ quietMs, timeoutMs? })`

Async matcher. Resolves when the log's length has not grown for `quietMs`. Rejects if `timeoutMs` elapses first.

```ts
await expect(log: AnyLog).toHaveStableLog({
  quietMs: number;
  timeoutMs?: number;  // default: 30_000
}): Promise<void>;
```

The matcher observes the same array reference you pass in — so you need a **live** reference, not a snapshot. With `@shoki/vitest`, `session.log` is the live reference.

### Example

```ts
await expect(session.log).toHaveStableLog({ quietMs: 500 });
// Now it's safe to assert further:
expect(session.log).toHaveAnnounced({ role: "status" });
```

Most tests will prefer `session.awaitStable({ quietMs })` which returns a stable snapshot directly. `toHaveStableLog` is for cases where you want to chain further matchers on the same live reference.

## Type augmentation

`@shoki/matchers/setup` adds this to Vitest's `expect`:

```ts
declare module "vitest" {
  interface Assertion<T> {
    toHaveAnnounced(criteria: AnnouncementCriteria): void;
    toHaveAnnouncedText(pattern: string | RegExp): void;
    toHaveNoAnnouncement(): void;
    toHaveStableLog(opts: { quietMs: number; timeoutMs?: number }): Promise<void>;
  }
  interface AsymmetricMatchersContaining {
    // (same four methods, omitted here for brevity)
  }
}
```

No separate type imports required if you're using `"moduleResolution": "bundler"` or equivalent.

## Caveats

- **`toHaveStableLog` requires a live reference** — if you pass a `[...snapshot]` copy, the length never grows and the matcher resolves on the first tick. Pass `session.log`, not `[...session.log]`.
- **String `role` / `name` is case-sensitive** — use RegExp with `/i` if you want case-insensitive matching.
- **Negation works** — `.not.toHaveAnnounced(...)` and `.not.toHaveAnnouncedText(...)` are supported. Negating `toHaveStableLog` is not supported (it wouldn't make sense).
- **Matcher does not filter by timestamp** — if you need "announced in the last 500ms", filter the array before matching.

## See also

- [Matchers guide](/guides/matchers) for worked examples.
- [`@shoki/sdk`](/api/sdk) for the event shape and capture APIs.
