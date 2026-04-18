const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const napi_dep = b.dependency("napi_zig", .{
        .target = target,
        .optimize = optimize,
    });
    const napi_zig = napi_dep.module("napi");

    // Shared library (Zig 0.16 API: create Module then addLibrary).
    const lib_mod = b.createModule(.{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    lib_mod.addImport("napi_zig", napi_zig);

    const lib = b.addLibrary(.{
        .name = "shoki",
        .linkage = .dynamic,
        .root_module = lib_mod,
    });
    lib.linker_allow_shlib_undefined = true; // N-API symbols resolved at load time by Node

    // Link against libShokiXPCClient.dylib (built by `swift build -c release`
    // in helper/). Plan 04 produces the dylib; Plan 05 adds the link step.
    // On non-darwin targets this whole step is skipped — the voiceover driver
    // is gated on `.darwin` in the registry.
    if (target.result.os.tag == .macos) {
        const helper_build_dir = b.path("../helper/.build/release");
        lib_mod.addLibraryPath(helper_build_dir);
        lib_mod.linkSystemLibrary("ShokiXPCClient", .{});
        lib_mod.addRPath(helper_build_dir);
    }

    b.installArtifact(lib);

    // Unit tests. Zig 0.16 enforces that @import paths must be within the
    // Module's root directory subtree. Each test file lives in `zig/test/`
    // and imports `../src/...`, so the test Module's root is set to
    // `zig/all_tests.zig` (which aggregates all ten test files via comptime
    // imports). This runs all registered tests as one test binary.
    const test_step = b.step("test", "Run unit tests");

    const test_mod = b.createModule(.{
        .root_source_file = b.path("all_tests.zig"),
        .target = target,
        .optimize = optimize,
    });
    test_mod.addImport("napi_zig", napi_zig);
    const t = b.addTest(.{
        .root_module = test_mod,
    });
    const run_t = b.addRunArtifact(t);
    test_step.dependOn(&run_t.step);
}
