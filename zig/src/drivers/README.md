# Ogmios driver contract

A screen reader ships as one directory under `src/drivers/<name>/` containing `driver.zig`.

## Required surface

Your driver must:

1. Implement the `OgmiosDriver` vtable from `src/core/driver.zig`:

   ```zig
   pub const OgmiosDriver = struct {
       init: *const fn (ctx: *anyopaque, opts: InitOptions) anyerror!void,
       start: *const fn (ctx: *anyopaque) anyerror!void,
       stop: *const fn (ctx: *anyopaque) anyerror!void,
       drain: *const fn (ctx: *anyopaque, out: *RingBuffer) anyerror!usize,
       reset: *const fn (ctx: *anyopaque) anyerror!void,
       deinit: *const fn (ctx: *anyopaque) void,
       name: []const u8,
       platform: DriverPlatform,
   };
   ```

2. Expose a `pub fn create(allocator) !*Self` constructor.
3. Expose a `pub fn vtable() OgmiosDriver` filled with your method pointers.

## Registering

Add one line to `src/core/registry.zig`:

```zig
pub const drivers = [_]RegisteredDriver{
    .{ .name = "noop", .platform = .any, .create = makeNoop },
    .{ .name = "your-driver", .platform = .darwin, .create = makeYourDriver },
};
```

And a matching `make<YourDriver>` factory following the `makeNoop` shape.

## What you MUST NOT change (EXT-01)

- The `OgmiosDriver` struct shape in `src/core/driver.zig`
- The wire format in `src/core/wire.zig`
- The N-API surface in `src/core/napi.zig`

If your driver needs data outside the vtable, raise a plan — EXT-01 depends on stability.

## New platform bindings

Each triple needs a `@ogmios/binding-<os>-<arch>` package and a CI build target.
See `packages/binding-darwin-arm64/package.json`. Add the triple to `.github/workflows/release.yml` matrix.

## Reference

`src/drivers/noop/driver.zig` is the minimum viable driver and powers Phase 1 end-to-end tests.
