const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Helper Zig-built dylib directory. Phase 08 Plan 02 replaced the Swift
    // `swift build` output under `helper/.build/{debug,release}/` with a
    // Zig `zig build` output at `helper/.build/libMunadiXPCClient.dylib`
    // (single artifact, no optimize-mode subdir). Callers can override via
    // `-Dhelper-dylib-dir=<path>` if needed.
    const helper_dylib_dir_opt = b.option(
        []const u8,
        "helper-dylib-dir",
        "Path to the directory containing libMunadiXPCClient.dylib (from helper/build.zig). Default: ../helper/.build",
    ) orelse "../helper/.build";

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
        .name = "munadi",
        .linkage = .dynamic,
        .root_module = lib_mod,
    });
    lib.linker_allow_shlib_undefined = true; // N-API symbols resolved at load time by Node

    // Link against libMunadiXPCClient.dylib (built by `zig build` in helper/).
    // On non-darwin targets the whole step is skipped — the voiceover driver
    // is gated on `.darwin` in the registry so Linux/Windows CI builds won't
    // reach this symbol.
    if (target.result.os.tag == .macos) {
        const helper_path = b.path(helper_dylib_dir_opt);
        lib_mod.addLibraryPath(helper_path);
        lib_mod.linkSystemLibrary("MunadiXPCClient", .{});
        lib_mod.addRPath(helper_path);
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
    // Tests transitively import ax_notifications.zig which declares
    // `extern "c" fn munadi_xpc_*` — link the helper dylib here too so the
    // test binary resolves those symbols.
    if (target.result.os.tag == .macos) {
        const helper_path = b.path(helper_dylib_dir_opt);
        test_mod.addLibraryPath(helper_path);
        test_mod.linkSystemLibrary("MunadiXPCClient", .{});
        test_mod.addRPath(helper_path);
    }
    const t = b.addTest(.{
        .root_module = test_mod,
    });
    const run_t = b.addRunArtifact(t);
    test_step.dependOn(&run_t.step);
}
