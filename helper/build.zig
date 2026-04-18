// Build graph for the Shoki macOS helper.
//
// ## Phase 08 Plan 02 scope
//
// Plan 01 shipped a static `libshoki_xpc_core.a` + test runner. Plan 02
// extends this file to produce THREE additional products:
//
//   1. `ShokiRunner` executable (Zig-compiled Mach-O), from main.zig + the
//      existing xpc_service + new ax_observer modules.
//   2. `libShokiXPCClient.dylib` — drop-in replacement for the Swift-built
//      dylib zig-core links against. Built from `src/client/xpc_client.zig`.
//   3. The `.app` bundle staged under `helper/.build/ShokiRunner.app/` —
//      Contents/Info.plist + Contents/MacOS/ShokiRunner.
//
// ## Output layout
//
// Everything lands under `helper/.build/` so `zig/build.zig`'s
// `-Dhelper-dylib-dir=../helper/.build` contract holds (Plan 02 updates
// zig/build.zig's default to match).
//
//     helper/.build/
//     ├── libShokiXPCClient.dylib
//     ├── ShokiRunner.app/
//     │   └── Contents/
//     │       ├── Info.plist
//     │       └── MacOS/ShokiRunner
//     └── ShokiRunner                 (raw exe — bundle uses a copy)
//
// zig-out/ continues to receive the static `libshoki_xpc_core.a` (install
// artifact) for reference; it isn't what consumers link against.

const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // -----------------------------------------------------------------------
    // 1. Static core library — unchanged from Plan 01
    // -----------------------------------------------------------------------

    // Shared helper module — `xpc_bindings` — exposed to consumers (runner
    // executable + client dylib + tests) so `@import("xpc_bindings")` works
    // across module-subtree boundaries. Zig 0.16 requires each module's
    // imports to stay within the module's root-file subtree; a shared
    // module is the standard way to cross that boundary.
    const xpc_bindings_mod = b.createModule(.{
        .root_source_file = b.path("src/runner/xpc_bindings.zig"),
        .target = target,
        .optimize = optimize,
    });

    const xpc_core_mod = b.createModule(.{
        .root_source_file = b.path("src/runner/xpc_service.zig"),
        .target = target,
        .optimize = optimize,
    });
    xpc_core_mod.addImport("xpc_bindings", xpc_bindings_mod);

    const xpc_core = b.addLibrary(.{
        .name = "shoki_xpc_core",
        .linkage = .static,
        .root_module = xpc_core_mod,
    });

    if (target.result.os.tag == .macos) {
        xpc_core_mod.linkFramework("Foundation", .{});
        xpc_core_mod.linkFramework("ApplicationServices", .{});
        xpc_core_mod.linkFramework("CoreFoundation", .{});
    }

    b.installArtifact(xpc_core);

    // -----------------------------------------------------------------------
    // 2. ShokiRunner executable — Plan 02 Task 2
    // -----------------------------------------------------------------------
    //
    // Root is `main.zig`; it @imports xpc_bindings + xpc_service + ax_observer
    // directly, so we don't need a separate addImport wiring. Framework linkage
    // matches the static lib.

    const runner_mod = b.createModule(.{
        .root_source_file = b.path("src/runner/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    runner_mod.addImport("xpc_bindings", xpc_bindings_mod);

    // `main.zig` also @imports `xpc_service.zig` and `ax_observer.zig` as
    // siblings; since they share its root-file subtree (`src/runner/`) no
    // explicit addImport is needed for those.

    // Plan 08-04: block-ABI shim. libxpc's set_event_handler takes an
    // Obj-C block; clang compiles src/runner/xpc_block_shim.c with -fblocks
    // to produce the real block literals that Zig cannot emit. The
    // symbols are declared in xpc_bindings.zig and consumed by main.zig.
    if (target.result.os.tag == .macos) {
        runner_mod.addCSourceFile(.{
            .file = b.path("src/runner/xpc_block_shim.c"),
            .flags = &.{ "-fblocks", "-fobjc-arc", "-Wall" },
        });
    }

    if (target.result.os.tag == .macos) {
        runner_mod.linkFramework("Foundation", .{});
        runner_mod.linkFramework("ApplicationServices", .{});
        runner_mod.linkFramework("CoreFoundation", .{});
        // Plan 08-04: link the clang blocks runtime so the block descriptors
        // produced by xpc_block_shim.c resolve at link time. libSystem on
        // macOS 13+ includes the blocks runtime, but we link BlocksRuntime
        // explicitly via -lobjc for forward-compat.
        runner_mod.linkSystemLibrary("objc", .{});
    }

    const runner_exe = b.addExecutable(.{
        .name = "ShokiRunner",
        .root_module = runner_mod,
    });

    // Install the raw exe into `.build/` (not `zig-out/bin/`) so the app
    // bundle staging below can find it at a stable path. We use addInstallFile
    // with .custom to pick the directory exactly.
    const install_runner = b.addInstallFileWithDir(
        runner_exe.getEmittedBin(),
        .{ .custom = "../.build" },
        "ShokiRunner",
    );
    b.getInstallStep().dependOn(&install_runner.step);

    // Stage the .app bundle.
    // Contents/Info.plist
    const install_plist = b.addInstallFileWithDir(
        b.path("src/runner/Info.plist"),
        .{ .custom = "../.build/ShokiRunner.app/Contents" },
        "Info.plist",
    );
    b.getInstallStep().dependOn(&install_plist.step);

    // Contents/MacOS/ShokiRunner — same binary again; copying once makes the
    // bundle self-contained (codesign operates on the bundle, not on the raw
    // exe path).
    const install_bundle_exe = b.addInstallFileWithDir(
        runner_exe.getEmittedBin(),
        .{ .custom = "../.build/ShokiRunner.app/Contents/MacOS" },
        "ShokiRunner",
    );
    b.getInstallStep().dependOn(&install_bundle_exe.step);

    // -----------------------------------------------------------------------
    // 3. libShokiXPCClient.dylib — Plan 02 Task 2
    // -----------------------------------------------------------------------
    //
    // C-ABI drop-in replacement for the Swift-built dylib. zig-core links
    // against this by name from `helper/.build/libShokiXPCClient.dylib`.

    const client_mod = b.createModule(.{
        .root_source_file = b.path("src/client/xpc_client.zig"),
        .target = target,
        .optimize = optimize,
    });
    client_mod.addImport("xpc_bindings", xpc_bindings_mod);

    if (target.result.os.tag == .macos) {
        client_mod.linkFramework("Foundation", .{});
        client_mod.linkFramework("CoreFoundation", .{});
    }

    const client_dylib = b.addLibrary(.{
        .name = "ShokiXPCClient",
        .linkage = .dynamic,
        .root_module = client_mod,
    });

    // Place the dylib directly at `.build/libShokiXPCClient.dylib`.
    const install_dylib = b.addInstallFileWithDir(
        client_dylib.getEmittedBin(),
        .{ .custom = "../.build" },
        "libShokiXPCClient.dylib",
    );
    b.getInstallStep().dependOn(&install_dylib.step);

    // -----------------------------------------------------------------------
    // 4. ShokiSetup executable + .app bundle — Plan 08-03
    // -----------------------------------------------------------------------
    //
    // Zig-compiled GUI whose whole purpose is to trigger the macOS
    // Accessibility + Automation-of-VoiceOver TCC prompts cleanly on first
    // launch. See src/setup/setup_main.zig for the flow.
    //
    // Framework linkage is a superset of ShokiRunner's because we also need
    // AppKit (NSApplication + NSAlert) and libobjc (objc_msgSend variants).

    const setup_mod = b.createModule(.{
        .root_source_file = b.path("src/setup/setup_main.zig"),
        .target = target,
        .optimize = optimize,
    });

    if (target.result.os.tag == .macos) {
        setup_mod.linkFramework("Foundation", .{});
        setup_mod.linkFramework("AppKit", .{});
        setup_mod.linkFramework("ApplicationServices", .{});
        setup_mod.linkFramework("CoreFoundation", .{});
        setup_mod.linkSystemLibrary("objc", .{});
    }

    const setup_exe = b.addExecutable(.{
        .name = "ShokiSetup",
        .root_module = setup_mod,
    });

    // Raw exe alongside .build/ShokiRunner so scripts can find it at a
    // stable path if they want to invoke without the bundle wrapper.
    const install_setup = b.addInstallFileWithDir(
        setup_exe.getEmittedBin(),
        .{ .custom = "../.build" },
        "ShokiSetup",
    );
    b.getInstallStep().dependOn(&install_setup.step);

    // Stage the .app bundle: Contents/Info.plist + Contents/MacOS/ShokiSetup.
    const install_setup_plist = b.addInstallFileWithDir(
        b.path("src/setup/Info.plist"),
        .{ .custom = "../.build/ShokiSetup.app/Contents" },
        "Info.plist",
    );
    b.getInstallStep().dependOn(&install_setup_plist.step);

    const install_setup_bundle_exe = b.addInstallFileWithDir(
        setup_exe.getEmittedBin(),
        .{ .custom = "../.build/ShokiSetup.app/Contents/MacOS" },
        "ShokiSetup",
    );
    b.getInstallStep().dependOn(&install_setup_bundle_exe.step);

    // -----------------------------------------------------------------------
    // 5. Test step — Plan 01 + Plan 02 + Plan 03 tests
    // -----------------------------------------------------------------------

    const test_step = b.step("test", "Run helper unit tests");

    const test_mod = b.createModule(.{
        .root_source_file = b.path("all_tests.zig"),
        .target = target,
        .optimize = optimize,
    });
    test_mod.addImport("xpc_bindings", xpc_bindings_mod);
    if (target.result.os.tag == .macos) {
        test_mod.linkFramework("Foundation", .{});
        test_mod.linkFramework("ApplicationServices", .{});
        test_mod.linkFramework("CoreFoundation", .{});
        // Plan 08-03: setup_bindings_test.zig references AppKit +
        // libobjc symbols (objc_getClass, sel_registerName).
        test_mod.linkFramework("AppKit", .{});
        test_mod.linkSystemLibrary("objc", .{});
        // Plan 08-04: xpc_block_shim_test.zig references the block-ABI
        // shim symbols; compile the same C file into the test module.
        test_mod.addCSourceFile(.{
            .file = b.path("src/runner/xpc_block_shim.c"),
            .flags = &.{ "-fblocks", "-fobjc-arc", "-Wall" },
        });
    }

    const t = b.addTest(.{ .root_module = test_mod });
    const run_t = b.addRunArtifact(t);
    test_step.dependOn(&run_t.step);
}
