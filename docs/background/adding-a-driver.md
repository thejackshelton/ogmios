# Adding a screen-reader driver

This doc walks you through adding a new screen reader to Shoki (e.g. NVDA on Windows, Orca on Linux, iOS VoiceOver). The goal is that a new driver should touch **one** new Zig file, **one** registry line, **one** new binding package, and **one** TS factory — nothing in `zig/src/core/` or `packages/sdk/src/{binding-loader,screen-reader,wire}.ts` changes.

## 1. Implement the `ShokiDriver` vtable in Zig

Create `zig/src/drivers/<name>/driver.zig`:

```zig
const std = @import("std");
const driver = @import("../../core/driver.zig");
const ring = @import("../../core/ring_buffer.zig");

const MyDriver = struct {
    // driver state: handles, buffers, whatever you need
};

fn init(ctx: *anyopaque, opts: driver.InitOptions) anyerror!void {
    const self: *MyDriver = @ptrCast(@alignCast(ctx));
    // boot the screen reader, configure settings, etc.
}

fn start(ctx: *anyopaque) anyerror!void { ... }
fn stop(ctx: *anyopaque) anyerror!void { ... }
fn drain(ctx: *anyopaque, out: *ring.RingBuffer) anyerror!usize { ... }
fn reset(ctx: *anyopaque) anyerror!void { ... }
fn deinit(ctx: *anyopaque) void { ... }

pub const VTABLE = driver.ShokiDriver{
    .init = init,
    .start = start,
    .stop = stop,
    .drain = drain,
    .reset = reset,
    .deinit = deinit,
    .name = "my-driver",
    .platform = .macos,  // or .windows, .linux
};
```

**Rules:**
- `drain` writes `ShokiAnnouncement` entries to the ring buffer using the wire format (`zig/src/core/wire.zig`). Do NOT bump `WIRE_VERSION`.
- `start`, `stop`, `reset` must be idempotent — callers may invoke them repeatedly.
- `deinit` is called exactly once per driver lifetime.
- Allocate all state in `init`, free in `deinit`. No hidden globals.

## 2. Register it

In `zig/src/core/registry.zig`, add:

```zig
const my_driver = @import("../drivers/my-driver/driver.zig");

pub const drivers = [_]driver.ShokiDriver{
    noop_driver.VTABLE,
    voiceover_driver.VTABLE,
    my_driver.VTABLE,  // ← new
};
```

That's it for Zig. The N-API surface picks it up automatically via `registry.findByName`.

## 3. Create a platform binding package

If your driver targets a new OS/arch triple, create `packages/binding-<os>-<arch>/` with a `package.json` mirroring the existing `binding-darwin-arm64` template:

```json
{
  "name": "@shoki/binding-linux-x64",
  "version": "0.0.0",
  "os": ["linux"],
  "cpu": ["x64"],
  "files": ["shoki.node", "helper/"],
  "main": "./shoki.node"
}
```

Add it to `shoki`'s `optionalDependencies` in `packages/sdk/package.json`:

```json
"optionalDependencies": {
  "@shoki/binding-darwin-arm64": "workspace:*",
  "@shoki/binding-darwin-x64": "workspace:*",
  "@shoki/binding-linux-x64": "workspace:*"
}
```

Add CI build coverage in `.github/workflows/ci.yml` and `release.yml`.

## 4. Add a TS factory

In `packages/sdk/src/my-driver.ts`:

```typescript
import { createScreenReaderHandle } from "./screen-reader.js";
import type { ScreenReaderHandle, ScreenReaderOptions } from "./screen-reader.js";

export function myDriver(opts: ScreenReaderOptions = {}): ScreenReaderHandle {
  return createScreenReaderHandle("my-driver", opts);
}
```

Re-export from `packages/sdk/src/index.ts`:

```typescript
export { myDriver } from "./my-driver.js";
```

## 5. Tests

Add:
- `zig/test/my_driver_test.zig` — unit tests for your driver's state machine (mock the OS calls)
- `packages/sdk/test/my-driver.test.ts` — round-trip test gated on `SHOKI_NATIVE_BUILT`

Tests inherit the existing harness; no framework changes required.

## 6. Docs

Update the repo `README.md`'s supported-screen-readers list and add a `docs/background/drivers/my-driver.md` page covering:
- What OS versions are supported
- Permission requirements (if any)
- Platform-specific quirks and workarounds
- Any known capture-fidelity limitations

## 7. Permissions & trust anchor

If your driver needs OS-level permissions (macOS TCC, Windows UIAccess, etc.), reuse or extend the existing signed helper pattern. For macOS, `helper/` is shared across all macOS drivers — extend `ShokiRunnerProtocol` if new XPC methods are needed.

For non-macOS platforms, the trust anchor story is different:
- **Windows**: NVDA's controller client + a UI Automation driver; no analog to TCC.
- **Linux**: AT-SPI2 over D-Bus; no signing required.

Each platform will have its own security model documented when the driver lands.

## Checklist

- [ ] `zig/src/drivers/<name>/driver.zig` implements the vtable
- [ ] `zig/src/core/registry.zig` includes the driver
- [ ] New `packages/binding-<os>-<arch>/` exists with correct `os`/`cpu`
- [ ] `shoki/package.json` lists the binding in `optionalDependencies`
- [ ] `packages/sdk/src/<name>.ts` factory + `index.ts` export
- [ ] Zig + TS tests green
- [ ] CI builds and runs tests for the new platform
- [ ] `docs/drivers/<name>.md` documents the driver
- [ ] README supported-SRs list updated

Once all boxes are checked, open a PR.
