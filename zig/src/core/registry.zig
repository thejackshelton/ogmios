const std = @import("std");
const driver_mod = @import("driver.zig");
const noop_mod = @import("../drivers/noop/driver.zig");
const voiceover_mod = @import("../drivers/voiceover/driver.zig");
const defaults_mod = @import("../drivers/voiceover/defaults.zig");
const lifecycle_mod = @import("../drivers/voiceover/lifecycle.zig");
const applescript_mod = @import("../drivers/voiceover/applescript.zig");
const ax_mod = @import("../drivers/voiceover/ax_notifications.zig");

/// Comptime driver registry per CONTEXT.md Driver Interface D-12.
/// Adding a driver: (1) drop a new file at src/drivers/<name>/driver.zig,
/// (2) add one entry below. No core edits.
pub const RegisteredDriver = struct {
    name: []const u8,
    platform: driver_mod.DriverPlatform,
    create: *const fn (allocator: std.mem.Allocator) anyerror!driver_mod.DriverHandle,
};

fn makeNoop(allocator: std.mem.Allocator) anyerror!driver_mod.DriverHandle {
    const instance = try noop_mod.NoopDriver.create(allocator);
    const vt_slot = try allocator.create(driver_mod.ShokiDriver);
    vt_slot.* = noop_mod.NoopDriver.vtable();
    return .{ .ctx = @ptrCast(instance), .vtable = vt_slot };
}

/// voiceover driver factory — wires real backends (real subprocess runner,
/// real clock, real osascript spawner, real XPC backend which forwards to
/// libShokiXPCClient.dylib). Tests construct VoiceOverDriver directly with mocks.
fn makeVoiceOver(allocator: std.mem.Allocator) anyerror!driver_mod.DriverHandle {
    const instance = try voiceover_mod.VoiceOverDriver.create(
        allocator,
        defaults_mod.realSubprocessRunner,
        lifecycle_mod.realClock,
        realAppleScriptSpawner(),
        ax_mod.realXpcBackend,
    );
    const vt_slot = try allocator.create(driver_mod.ShokiDriver);
    vt_slot.* = voiceover_mod.VoiceOverDriver.vtable();
    return .{ .ctx = @ptrCast(instance), .vtable = vt_slot };
}

/// Real osascript spawner — uses std.process.Child. Wrapped here (not in
/// applescript.zig) to keep that module test-clean; Plan 05 owns the link.
var real_spawner_ctx_sentinel: u8 = 0;
fn realSpawnImpl(ctx: *anyopaque, allocator: std.mem.Allocator, argv: []const []const u8) anyerror!*applescript_mod.ChildProcess {
    _ = ctx;
    _ = allocator;
    _ = argv;
    // Full implementation lands when the binding integrates real osascript spawning
    // in a production build. For Plan 05's unit-test round-trip the test inserts
    // a MockSpawner; CI integration tests (Plan 07) use the real path once the
    // spawner is fleshed out.
    return error.RealSpawnerNotYetImplemented;
}

fn realAppleScriptSpawner() applescript_mod.ChildProcessSpawner {
    return .{
        .ctx = @ptrCast(&real_spawner_ctx_sentinel),
        .spawnFn = realSpawnImpl,
    };
}

pub const drivers = [_]RegisteredDriver{
    .{ .name = "noop", .platform = .any, .create = makeNoop },
    .{ .name = "voiceover", .platform = .darwin, .create = makeVoiceOver },
};

pub fn findByName(name: []const u8) ?RegisteredDriver {
    for (drivers) |d| {
        if (std.mem.eql(u8, d.name, name)) return d;
    }
    return null;
}
