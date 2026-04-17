const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const napi_dep = b.dependency("napi_zig", .{
        .target = target,
        .optimize = optimize,
    });
    const napi_zig = napi_dep.module("napi_zig");

    // Shared library. napi-zig docs describe a higher-level addLib helper; if present
    // prefer that. Otherwise the shape below is the idiomatic Zig 0.16 equivalent.
    const lib = b.addSharedLibrary(.{
        .name = "shoki",
        .root_source_file = b.path("src/core/napi.zig"),
        .target = target,
        .optimize = optimize,
    });
    lib.root_module.addImport("napi_zig", napi_zig);
    lib.linker_allow_shlib_undefined = true; // N-API symbols resolved at load time by Node

    // Link against libShokiXPCClient.dylib (built by `swift build -c release`
    // in helper/). Plan 04 produces the dylib; Plan 05 adds the link step.
    // On non-darwin targets this whole step is skipped — the voiceover driver
    // is gated on `.darwin` in the registry.
    if (target.result.os.tag == .macos) {
        const helper_build_dir = b.path("../helper/.build/release");
        lib.addLibraryPath(helper_build_dir);
        lib.linkSystemLibrary("ShokiXPCClient");
        lib.addRPath(helper_build_dir);
    }

    b.installArtifact(lib);

    // Unit tests
    const test_step = b.step("test", "Run unit tests");

    inline for (.{
        "test/ring_buffer_test.zig",
        "test/wire_test.zig",
        "test/noop_driver_test.zig",
        "test/voiceover_defaults_test.zig",
        "test/voiceover_applescript_test.zig",
        "test/voiceover_ax_notifications_test.zig",
        "test/voiceover_lifecycle_test.zig",
        "test/voiceover_driver_test.zig",
        "test/wire_regression_test.zig",
        "test/voiceover_integration_test.zig",
    }) |test_path| {
        const t = b.addTest(.{
            .root_source_file = b.path(test_path),
            .target = target,
            .optimize = optimize,
        });
        t.root_module.addImport("napi_zig", napi_zig);
        const run_t = b.addRunArtifact(t);
        test_step.dependOn(&run_t.step);
    }
}
