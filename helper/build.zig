// Build graph for the Shoki macOS helper (Phase 08 Plan 01 scaffold).
//
// Plan 01 scope: produce a static `libshoki_xpc_core.a` from the XPC
// dispatcher module and a test runner that drives the unit tests under
// `helper/test/`. Plan 02 will add the `ShokiRunner-zig` executable target
// that links `xpc_core` + `main.zig` + `ax_observer.zig`.
//
// This file intentionally mirrors the structure of `zig/build.zig` so an
// engineer familiar with the Zig core build can read both without context
// switching (standardTargetOptions → standardOptimizeOption → createModule
// → addLibrary / addTest → installArtifact → step).

const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // ShokiRunner XPC service core.
    //
    // Static in Plan 01 so the unit-test binary links against the same
    // compile unit as the future executable (Plan 02). That guarantees the
    // tests exercise the *same* `dispatchCore` logic that production runs.
    //
    // Root source is `xpc_service.zig` rather than a dedicated `root.zig`
    // because the dispatcher IS the module's public surface for now. A
    // Plan 02 addition of additional modules (ax_observer.zig, main.zig)
    // will promote the root to a dedicated `root.zig` that re-exports.
    const xpc_core_mod = b.createModule(.{
        .root_source_file = b.path("src/runner/xpc_service.zig"),
        .target = target,
        .optimize = optimize,
    });

    const xpc_core = b.addLibrary(.{
        .name = "shoki_xpc_core",
        .linkage = .static,
        .root_module = xpc_core_mod,
    });

    // On macOS, link Foundation so the extern decls in xpc_bindings.zig
    // that resolve at link time (xpc_*, xpc_release/retain, …) find their
    // symbols. libxpc is part of libSystem and therefore linked implicitly
    // by Zig's macOS target; Foundation pulls in the Objective-C runtime
    // that xpc_main would otherwise reach for in Plan 02.
    if (target.result.os.tag == .macos) {
        xpc_core_mod.linkFramework("Foundation", .{});
    }

    b.installArtifact(xpc_core);

    // Unit tests.
    //
    // Zig 0.16 enforces that @import paths stay within the module root's
    // subtree. Rooting at `all_tests.zig` (in helper/) means the test
    // module's root directory is `helper/` itself, so `test/*` files can
    // reach `../src/...` freely. Additional test files are registered by
    // adding `_ = @import("test/new_test.zig");` inside all_tests.zig.
    const test_step = b.step("test", "Run helper unit tests");

    const test_mod = b.createModule(.{
        .root_source_file = b.path("all_tests.zig"),
        .target = target,
        .optimize = optimize,
    });
    if (target.result.os.tag == .macos) {
        test_mod.linkFramework("Foundation", .{});
    }

    const t = b.addTest(.{ .root_module = test_mod });
    const run_t = b.addRunArtifact(t);
    test_step.dependOn(&run_t.step);
}
