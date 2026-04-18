# munadi — Zig core

N-API native core for Munadi. Compiles to `munadi.node` per platform and is loaded in-process by `munadi`.

## Pinned versions (do not drift — see PITFALLS.md Pitfall 10)

- Zig: 0.16.0 stable (matches `minimum_zig_version` in `build.zig.zon`)
- napi-zig: pinned by commit SHA `4f05eeaeee539b4800b9cdbc1485270c476b7ff8` in `build.zig.zon` dependencies

## Bootstrapping napi-zig dependency

The `build.zig.zon` in this repo ships with `.hash = "UPDATE_VIA_ZIG_FETCH"` as a placeholder. On first check-out (or when bumping the SHA in `build.zig.zon`):

```
cd zig
zig fetch --save=napi_zig git+https://github.com/yuku-toolchain/napi-zig.git#4f05eeaeee539b4800b9cdbc1485270c476b7ff8
```

This rewrites `build.zig.zon` with the correct `.hash` value and populates the local cache.

## Build

```
zig build                           # current platform
zig build -Dtarget=aarch64-macos    # Apple Silicon
zig build -Dtarget=x86_64-macos     # Intel
zig build test                      # run unit tests
```

The resulting `munadi.node` is copied into `../packages/binding-darwin-<arch>/munadi.node` by the CI workflow (see `.github/workflows/release.yml` — plan 05).

## Layout

- `src/core/napi.zig` — single N-API export surface (all `pub fn` exposed to JS)
- `src/core/driver.zig` — `MunadiDriver` vtable definition
- `src/core/registry.zig` — comptime driver registry (add a driver = one import + one array entry)
- `src/core/ring_buffer.zig` — bounded ring buffer with `droppedCount`
- `src/core/wire.zig` — versioned binary wire format
- `src/drivers/noop/` — end-to-end-testable no-op driver (Phase 1)
- `src/drivers/voiceover/` — real VO driver (Phase 3, not here)

## Adding a new driver

See `src/drivers/README.md`.
