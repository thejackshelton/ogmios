# Architecture

This document captures the load-bearing design decisions for Shoki. Before changing anything here, open an issue and discuss.

## Three-layer process model

```
┌────────────────────────┐
│  Test process (Node)   │
│  @shoki/sdk (TS)       │
│  shoki.node (N-API)    │  ← Zig compiled to .node addon
└────────────┬───────────┘
             │ XPC (libShokiXPCClient.dylib)
┌────────────▼───────────┐
│  ShokiRunner.app       │  ← Zig-compiled, signed helper
│  ShokiSetup.app        │  ← Zig-compiled GUI — triggers first-run TCC prompts
└────────────┬───────────┘
             │ AppleScript + AX notifications
┌────────────▼───────────┐
│  VoiceOver             │
└────────────────────────┘
```

- **SDK layer** (`@shoki/sdk`, TypeScript) — public API. `voiceOver.listen()`, `shoki` CLI, matcher functions at `@shoki/sdk/matchers`, event types.
- **Core layer** (`shoki.node`, Zig via napi-zig) — in-process N-API addon. Owns the 50ms VO poll loop, the ring buffer, the wire format. Never spawns a subprocess for hot-path reads. Links `libShokiXPCClient.dylib` (also Zig-compiled) as the XPC client surface.
- **Helper layer** (`ShokiRunner.app`, Zig) — signed helper app that holds the **stable TCC trust anchor**. When the Zig core needs to call into TCC-protected VO APIs, it routes via XPC through the helper. Shipped alongside `ShokiSetup.app` — a minimal Zig-compiled GUI whose sole purpose is to trigger the Accessibility + Automation TCC prompts cleanly on first run (replaces the multi-step System Settings walkthrough).

### Why N-API in-process, not a daemon or spawned CLI

The 50ms poll cadence on `osascript` makes per-call subprocess spawning unworkable — spawn overhead would dominate. A long-lived daemon adds lifecycle coordination problems with Vitest (which parallelizes; VoiceOver is a singleton). The in-process N-API addon is what Yuku and napi-rs use and is the only design that meets the perf + lifecycle requirements.

### Why Zig, not Rust

Mac + Linux OS-level integration in a single language is the driving requirement. Zig's `@cImport` (with the caveats noted in `.planning/research/PITFALLS.md`) and direct Mach-O interop make it feasible to touch both macOS Accessibility APIs and (future) Linux AT-SPI from one codebase. Rust is the nearest alternative but the ecosystem for Linux accessibility work is thinner and the FFI shim work is larger.

## The signed-wrapper-app decision (load-bearing)

macOS's TCC (Transparency, Consent, Control) framework gates Accessibility and Automation permissions per-executable, keyed by code signature. This creates a permission-flake factory if you grant TCC to `node`:

- Node's binary hash changes across every minor version.
- Dev rebuilds of an unsigned Zig binary have different hashes every time.
- Users must re-approve permissions after every npm/Node upgrade.
- `tccutil reset` doesn't cleanly remove stale entries.

**Chosen solution:** grant TCC to a small, stable, Developer ID-signed helper app (`ShokiRunner.app`) that lives inside the `@shoki/binding-<os>-<arch>` npm package. The Zig core talks to the helper via XPC; TCC sees the helper's stable bundle identity, not `node`'s or the addon's.

Consequences:

- Every release requires Apple Developer ID signing + notarization of **both** helper bundles (`ShokiRunner.app` and `ShokiSetup.app`). Documented in [Release setup](./release-setup.md).
- The helper is **tiny** — Zig-compiled, one build target per bundle, one XPC protocol, one service implementation. Single-language helper means no Swift toolchain is required to build shoki from source.
- The `.node` addon itself is NOT independently signed; it inherits trust from Node.
- Local dev without Dev ID works — the helper script noops signing when `APPLE_DEVELOPER_ID_APP` is unset. You'll just re-prompt for permissions more often.

Alternatives considered and rejected:

- **Grant TCC to Node** — breaks on every Node upgrade (Pitfall #2 in PITFALLS.md).
- **Grant TCC to the user's terminal/IDE** — intrusive, doesn't help in CI.
- **Sign the `.node` addon directly** — doesn't help: Node still needs to be the TCC caller, and signing `.node` files is awkward anyway.

## Wire format

Binary Buffer passed from Zig to TS via N-API:

```
┌─────────────┬──────────────────┬───────────────────────┐
│ u32 version │ u32 entry_count  │ entries (variable)    │
└─────────────┴──────────────────┴───────────────────────┘

Each entry:
┌────────────────┬─────────────┬──────────┬──────────────┬───────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│ u64 ts_nanos   │ u8 source   │ u8 flags │ u16 phr_len  │ phrase bytes  │ u16 role_len │ role bytes   │ u16 name_len │ name bytes   │
└────────────────┴─────────────┴──────────┴──────────────┴───────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

- `version` is currently `1`. Freeze: Phase 1 locks this. A new driver MUST NOT bump `version` without coordinated TS decoder update.
- `source` is `0` for AppleScript capture, `1` for AX notifications (see Phase 3).
- `flags` reserves bit 0 for `interrupt?` (whether this announcement interrupted a prior one). Other bits reserved.
- String fields are UTF-8. `role` and `name` are 0-length when not emitted by the driver.

Source of truth is `zig/src/core/wire.zig`. TS decoder at `packages/sdk/src/wire.ts` matches byte-for-byte.

## Driver extensibility

Adding a new screen reader is three files + one registry entry:

1. `zig/src/drivers/<name>/driver.zig` — implements the `ShokiDriver` vtable (`init, start, stop, drain, reset, deinit, name, platform`)
2. `zig/src/core/registry.zig` — add one line to the comptime array
3. `packages/binding-<new-os>-<new-arch>/` — new platform package
4. `packages/sdk/src/<name>.ts` — a factory function returning a `ScreenReaderHandle`

Nothing in `packages/sdk/src/binding-loader.ts`, `packages/sdk/src/screen-reader.ts`, `packages/sdk/src/wire.ts`, or `zig/src/core/` needs to change. This is verified in Phase 6 by adding a second driver.

See [Adding a screen-reader driver](./adding-a-driver.md) for a walkthrough.

## Platform risk

Shoki depends on VoiceOver's AppleScript surface. Apple has been tightening this:

- **macOS 26.2 / CVE-2025-43530** — new entitlement required for VO AppleScript access; third parties cannot request it.

To hedge, Phase 3 implements a **parallel capture path** using `AXObserverAddNotification` + `kAXAnnouncementRequestedNotification`. Both paths run; results are merged into a single event stream with a `source_tag`. If the AppleScript path breaks in a future macOS, the AX path keeps working.

Users see this disclosure on the [Platform risk](./platform-risk.md) page.

## Things that are NOT in this architecture

- **No test runner** — Shoki never runs tests; users bring Vitest/Playwright/XCUITest.
- **No app driver** — Shoki never clicks, types, or navigates; users drive the app themselves.
- **No SR simulation** — always the real VoiceOver/NVDA/etc.
- **No daemon** — in-process only for the hot path.
- **No out-of-tree driver ABI** — adding a driver requires forking/contributing. Post-v1 if demand exists.
